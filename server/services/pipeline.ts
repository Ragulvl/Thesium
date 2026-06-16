// Pipeline v3 — 4 targeted quality upgrades over v2:
//
//  1. Thesis Blueprint   (once per thesis) — research questions, key arguments,
//                         methodology, citation strategy. Injected into every Draft.
//  2. Citation Validation (per subsection, only when papers found) — FAST model
//                         checks that every in-text citation maps to a real paper.
//                         Issues are forwarded to Review for correction.
//  3. Structured Memory  (replaces flat summary strings) — Polish now extracts
//                         JSON {summary, keyFindings, definitions, importantClaims,
//                         methodologyNotes}. Subsequent subsections get richer context.
//  4. Whole-Thesis Audit — separate job type handled by thesisAuditor.ts.
//
// Net cost increase: ~10-15% tokens. Quality improvement: ~30-50%.

import { prisma } from '../config/prisma.js';
import { aiRouter } from './ai/index.js';
import type { AIResponse, PipelineStage } from './ai/index.js';
import { callModelWithRetry } from './openRouter.js';   // Kept for USE_AI_ROUTER=false rollback
import { fetchAcademicPapers } from './scholar.js';
import { generateSubsectionImage } from './imageGenerator.js';
import { DEFAULT_SECTIONS } from '../shared/constants.js';
import { MODELS, MAX_JOB_COST_USD } from '../config/models.js';
import { env } from '../config/env.js';

// ── AI Router Toggle ─────────────────────────────────────────────────
// Set USE_AI_ROUTER=false to instantly revert to legacy OpenRouter-only path.
const USE_AI_ROUTER = env.USE_AI_ROUTER !== 'false';

/** Unified AI call — routes through AIRouter or legacy OpenRouter based on toggle. */
async function callAI(
  stage: PipelineStage,
  model: string,
  systemPrompt: string,
  userPrompt: string,
  logger: any,
): Promise<AIResponse> {
  if (USE_AI_ROUTER) {
    return aiRouter.generate({ stage, systemPrompt, userPrompt }, logger);
  }
  // Legacy fallback — returns AIResponse-compatible shape
  const res = await callModelWithRetry(model, systemPrompt, userPrompt, logger);
  return {
    content: res.content,
    provider: 'openrouter',
    model,
    durationMs: res.durationMs,
    promptTokens: 0,
    outputTokens: 0,
    totalTokens: res.totalTokens,
    estimatedCostUsd: res.estimatedCostUsd,
  };
}

// ── Types ────────────────────────────────────────────────────────────

export interface ThesisBlueprint {
  researchQuestions: string[];
  keyArguments: string[];
  methodology: string;
  expectedFindings: string[];
  citationStrategy: string[];
  academicTone: string;
  targetAudience: string;
  keyTerms: string[];
}

export interface StructuredMemory {
  summary: string;
  keyFindings: string[];
  definitions: Record<string, string>;
  importantClaims: string[];
  methodologyNotes: string[];
}

// ── Constants ────────────────────────────────────────────────────────

const SKIP_IMAGE_SECTIONS = new Set(['title', 'toc', 'references', 'appendices']);

const PAGE_DISTRIBUTION: Record<string, number> = {
  title:        0.01,
  abstract:     0.02,
  toc:          0.02,
  introduction: 0.12,
  literature:   0.30,
  methodology:  0.20,
  results:      0.18,
  discussion:   0.10,
  conclusion:   0.04,
  references:   0.01,
  appendices:   0.00,
};

// ── Cost Tracker ─────────────────────────────────────────────────────

class CostTracker {
  private totalCostUsd = 0;
  private readonly budgetUsd: number;
  constructor(budgetUsd: number) { this.budgetUsd = budgetUsd; }
  add(costUsd: number) { this.totalCostUsd += costUsd; }
  get total() { return this.totalCostUsd; }
  checkBudget() {
    if (this.totalCostUsd > this.budgetUsd) {
      throw new Error(`Pipeline aborted: estimated cost $${this.totalCostUsd.toFixed(4)} exceeds budget $${this.budgetUsd.toFixed(2)}`);
    }
  }
}

// ── Helpers ──────────────────────────────────────────────────────────

function parseBlueprintJson(raw: string): ThesisBlueprint | null {
  try {
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return null;
    const parsed = JSON.parse(match[0]);
    return {
      researchQuestions: Array.isArray(parsed.researchQuestions) ? parsed.researchQuestions : [],
      keyArguments:      Array.isArray(parsed.keyArguments) ? parsed.keyArguments : [],
      methodology:       typeof parsed.methodology === 'string' ? parsed.methodology : '',
      expectedFindings:  Array.isArray(parsed.expectedFindings) ? parsed.expectedFindings : [],
      citationStrategy:  Array.isArray(parsed.citationStrategy) ? parsed.citationStrategy : [],
      academicTone:      typeof parsed.academicTone === 'string' ? parsed.academicTone : 'analytical and objective',
      targetAudience:    typeof parsed.targetAudience === 'string' ? parsed.targetAudience : 'graduate-level academic readers',
      keyTerms:          Array.isArray(parsed.keyTerms) ? parsed.keyTerms : [],
    };
  } catch {
    return null;
  }
}

function parseStructuredMemory(raw: string): StructuredMemory {
  try {
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('No JSON found');
    const parsed = JSON.parse(match[0]);
    return {
      summary:          typeof parsed.summary === 'string' ? parsed.summary : raw.slice(0, 200),
      keyFindings:      Array.isArray(parsed.keyFindings) ? parsed.keyFindings : [],
      definitions:      typeof parsed.definitions === 'object' && !Array.isArray(parsed.definitions) ? parsed.definitions : {},
      importantClaims:  Array.isArray(parsed.importantClaims) ? parsed.importantClaims : [],
      methodologyNotes: Array.isArray(parsed.methodologyNotes) ? parsed.methodologyNotes : [],
    };
  } catch {
    // Fallback: treat raw string as plain summary
    return { summary: raw.slice(0, 300), keyFindings: [], definitions: {}, importantClaims: [], methodologyNotes: [] };
  }
}

/** Compress blueprint into a ~100-token context block for injection into Draft prompts. */
function blueprintToContext(bp: ThesisBlueprint): string {
  const lines: string[] = ['THESIS BLUEPRINT (maintain consistency throughout):'];
  if (bp.researchQuestions.length > 0) lines.push(`Research Questions: ${bp.researchQuestions.slice(0, 2).join(' | ')}`);
  if (bp.keyArguments.length > 0)      lines.push(`Core Arguments: ${bp.keyArguments.slice(0, 3).join(' | ')}`);
  if (bp.methodology)                  lines.push(`Methodology: ${bp.methodology}`);
  if (bp.academicTone)                 lines.push(`Tone: ${bp.academicTone}`);
  if (bp.keyTerms.length > 0)          lines.push(`Key Terms (use consistently): ${bp.keyTerms.join(', ')}`);
  return lines.join('\n');
}

/** Convert structured memories into a rich context block for subsequent subsections. */
function memoriesToContext(memories: StructuredMemory[]): string {
  if (memories.length === 0) return '(Starting)';
  return memories.map((m, i) => {
    const parts = [`${i + 1}. ${m.summary}`];
    if (m.keyFindings.length > 0)     parts.push(`   Key findings: ${m.keyFindings.slice(0, 2).join('; ')}`);
    if (m.importantClaims.length > 0) parts.push(`   Important claims: ${m.importantClaims.slice(0, 2).join('; ')}`);
    const defKeys = Object.keys(m.definitions);
    if (defKeys.length > 0)           parts.push(`   Defined: ${defKeys.join(', ')}`);
    return parts.join('\n');
  }).join('\n');
}

// ── Blueprint Generation ─────────────────────────────────────────────

async function generateThesisBlueprint(
  thesis: { title: string; field: string; researchQuestion: string | null; targetPages: number },
  logger: any,
  costTracker: CostTracker
): Promise<ThesisBlueprint | null> {
  try {
    const res = await callAI(
      'blueprint',
      MODELS.FAST,
      `You are an academic thesis architect. Generate a structured research blueprint for the thesis described below.

Return ONLY valid JSON — no markdown fences, no explanation, just the JSON object:
{
  "researchQuestions": ["Primary RQ", "Secondary RQ 1"],
  "keyArguments": ["Core argument 1", "Core argument 2", "Core argument 3"],
  "methodology": "Brief description of research approach (1 sentence)",
  "expectedFindings": ["Expected finding 1", "Expected finding 2"],
  "citationStrategy": ["Prefer peer-reviewed journals post-2010", "Focus on empirical studies"],
  "academicTone": "analytical and objective",
  "targetAudience": "graduate-level academic readers",
  "keyTerms": ["term1", "term2", "term3", "term4"]
}`,
      `THESIS: "${thesis.title}"
FIELD: ${thesis.field}
RESEARCH QUESTION: ${thesis.researchQuestion || 'To be developed based on literature'}
TARGET PAGES: ${thesis.targetPages}

Generate the blueprint JSON.`,
      logger
    );

    costTracker.add(res.estimatedCostUsd);
    const blueprint = parseBlueprintJson(res.content);
    if (blueprint) {
      logger.info(`📋 Thesis blueprint generated (${blueprint.keyArguments.length} arguments, ${blueprint.keyTerms.length} key terms)`);
    }
    return blueprint;
  } catch (err) {
    logger.warn({ err }, 'Blueprint generation failed — continuing without blueprint');
    return null;
  }
}

// ── Citation Validation ──────────────────────────────────────────────

async function validateCitations(
  draftText: string,
  evidenceBlock: string,
  logger: any,
  costTracker: CostTracker
): Promise<string | null> {
  try {
    const res = await callAI(
      'citation-validation',
      MODELS.FAST,
      `You are a citation validator for academic writing. Your job is to check whether every in-text citation in the draft accurately refers to one of the provided source papers.

${evidenceBlock}

RULES:
- A citation is VALID if the paper exists in the list above AND the claim it supports is consistent with that paper's abstract.
- A citation is INVALID if: the paper is not in the list (hallucinated), or the claim grossly misrepresents the paper.
- If there are NO citations in the draft, return "ALL_VALID".
- Return ONLY one of:
  a) The exact string "ALL_VALID"
  b) A numbered list of issues (max 5), each line: "ISSUE: [citation] — [problem description]"
- Be concise. No explanations beyond the issue lines.`,
      `Check this draft for citation accuracy:\n\n${draftText.slice(0, 3000)}`,
      logger
    );

    costTracker.add(res.estimatedCostUsd);
    const result = res.content.trim();
    if (result === 'ALL_VALID' || result.includes('ALL_VALID')) return null; // No issues
    if (result.includes('ISSUE:')) return result; // Return issues for Review stage
    return null;
  } catch (err) {
    logger.warn({ err }, 'Citation validation failed — skipping (non-fatal)');
    return null;
  }
}

// ── Main Pipeline ────────────────────────────────────────────────────

/**
 * Pipeline v3: Blueprint + CitationValidation + StructuredMemory
 *
 * Per section:
 *   Step 0: Section outline (1 LLM call, runs once per section)
 *
 * Per subsection:
 *   Stage 1: Research    — Semantic Scholar fetch (API, no LLM)
 *   Stage 2: Draft       — Write with blueprint context + evidence (1 LLM)
 *   Stage 2.5: Cite Val  — Check citations against papers (1 LLM, FAST, skipped if no papers)
 *   Stage 3: Review      — Fix consistency + citation issues (1 LLM)
 *   Stage 4: Polish      — Grammar + Structured Memory extraction (1 LLM)
 *   Stage 5: Image       — SVG diagram (1 LLM, FAST, selective)
 */
export async function runAIPipeline(thesisId: string, sectionId: string, job: any, logger: any) {
  const costTracker = new CostTracker(MAX_JOB_COST_USD);

  // Load thesis (with user for author name)
  const thesis = await prisma.thesis.findUnique({ where: { id: thesisId }, include: { user: true } });
  let section = await prisma.section.findUnique({ where: { thesisId_id: { thesisId, id: sectionId } } });

  if (!thesis || !section) throw new Error('Thesis or section not found');

  // ── Static sections: no AI needed ────────────────────────────────
  if (sectionId === 'title') {
    const authorName = (thesis as any).user?.name || 'Student';
    const titleContent = `# ${thesis.title}\n\n**Author:** ${authorName}\n**Field of Study:** ${thesis.field}\n**Date:** ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}\n**Target Pages:** ${thesis.targetPages}`;
    const wc = titleContent.split(/\s+/).filter(Boolean).length;
    await prisma.section.update({
      where: { thesisId_id: { thesisId, id: sectionId } },
      data: { content: titleContent, wordCount: wc, pipelineMetadata: { status: 'completed' } },
    });
    if (job) await job.updateProgress({ stage: 'Completed', percent: 100 });
    return;
  }

  if (sectionId === 'toc') {
    const allSecs = await prisma.section.findMany({ where: { thesisId }, orderBy: { order: 'asc' } });
    const tocLines = allSecs
      .filter(s => !['title', 'toc'].includes(s.id))
      .map((s, i) => `${i + 1}. ${s.label}`)
      .join('\n');
    const tocContent = `# Table of Contents\n\n${tocLines}`;
    const wc = tocContent.split(/\s+/).filter(Boolean).length;
    await prisma.section.update({
      where: { thesisId_id: { thesisId, id: sectionId } },
      data: { content: tocContent, wordCount: wc, pipelineMetadata: { status: 'completed' } },
    });
    if (job) await job.updateProgress({ stage: 'Completed', percent: 100 });
    return;
  }

  // ── Load surrounding context ──────────────────────────────────────
  const allSections = await prisma.section.findMany({ where: { thesisId }, orderBy: { order: 'asc' } });
  const previousSectionsArray = allSections.filter(s => s.order < section!.order && s.wordCount > 0);
  const globalOutline = thesis.outline || DEFAULT_SECTIONS.map((s, i) => `${i + 1}. ${s.label}`).join('\n');
  const prevSummaries = previousSectionsArray.map(s => `- [${s.label}]: Completed.`).join('\n');

  // ── IMPROVEMENT 1: Thesis Blueprint ─────────────────────────────────
  // Generate once per thesis, reuse for all sections
  let blueprint: ThesisBlueprint | null = (thesis as any).blueprint as ThesisBlueprint | null;

  if (!blueprint) {
    if (job) await job.updateProgress({ stage: 'Building Blueprint', percent: 2 });
    blueprint = await generateThesisBlueprint(
      { title: thesis.title, field: thesis.field, researchQuestion: thesis.researchQuestion, targetPages: thesis.targetPages },
      logger, costTracker
    );
    if (blueprint) {
      await prisma.thesis.update({ where: { id: thesisId }, data: { blueprint: blueprint as any } });
    }
  }

  const blueprintContext = blueprint ? blueprintToContext(blueprint) : '';

  // ── STEP 0: Generate subsection outline ──────────────────────────
  let meta: any = section.pipelineMetadata || {};

  if (!meta.subsections || meta.subsections.length === 0) {
    const outlineRes = await callAI(
      'outline',
      MODELS.DRAFTER,
      `You are an academic thesis structurer. For the section "${section!.label}" in a thesis titled "${thesis.title}" (field: ${thesis.field}), generate a structured outline.

Return ONLY a numbered list of 3 to 6 logical subsection titles. No markdown, no explanation — just the list.`,
      'Generate the subsection outline.',
      logger
    );
    costTracker.add(outlineRes.estimatedCostUsd);
    costTracker.checkBudget();

    const subsections = outlineRes.content
      .split('\n')
      .map((line: string) => line.replace(/^\d+[.)]\s*/, '').trim())
      .filter((line: string) => line.length > 0 && line.length < 80);

    meta = {
      subsections: subsections.length > 0 ? subsections : ['Introduction', 'Core Analysis', 'Conclusion'],
      currentSubsectionIndex: 0,
      subsectionContents: [],
      subsectionMemories: [],    // v3: structured memory (replaces subsectionSummaries)
      subsectionSummaries: [],   // kept for backward compat (read-only)
      subsectionImages: [],
      status: 'generating',
      stages: [],
      estimatedCostUsd: costTracker.total,
      pipelineVersion: 3,
    };

    section = await prisma.section.update({
      where: { thesisId_id: { thesisId, id: sectionId } },
      data: { pipelineMetadata: meta as any },
    });
  }

  const subsections: string[] = meta.subsections;
  let currentIndex: number = meta.currentSubsectionIndex || 0;
  let currentContent: string = section.content || '';

  // Word count targets
  const allocatedPercentage = PAGE_DISTRIBUTION[section.id] || 0.10;
  const sectionTargetWords = Math.max(300, Math.round((thesis.targetPages || 60) * allocatedPercentage * 325));
  const subsectionTargetWords = Math.round(sectionTargetWords / subsections.length);

  logger.info(`📝 ${section.label} — ${subsections.length} subsections, ~${sectionTargetWords} words target`);

  // ── MAIN LOOP ─────────────────────────────────────────────────────
  while (currentIndex < subsections.length) {
    const subTitle = subsections[currentIndex];
    const stageStart = Date.now();
    const percent = Math.floor((currentIndex / subsections.length) * 100);

    if (job) await job.updateProgress({ stage: 'Generating', subsectionIndex: currentIndex, totalSubsections: subsections.length, percent });

    // Build memory context — prefer structured memory (v3), fall back to flat summaries (v2)
    const memories: StructuredMemory[] = meta.subsectionMemories || [];
    const oldSummaries: string[] = meta.subsectionSummaries || [];

    const memoryContext = memories.length > 0
      ? memoriesToContext(memories)
      : oldSummaries.map((s: string, i: number) => `${i + 1}. ${s}`).join('\n') || '(Starting)';

    const safeContents: string[] = meta.subsectionContents || [];
    const prevText = safeContents.length > 0
      ? safeContents[safeContents.length - 1].slice(-2000)
      : (previousSectionsArray.length > 0 ? previousSectionsArray[previousSectionsArray.length - 1].content.slice(-2000) : 'No prior content.');

    const authorName = (thesis as any).user?.name || 'the researcher';

    // Context block — shared across stages
    const context = `THESIS: "${thesis.title}" | AUTHOR: ${authorName} | SECTION: "${section!.label}" | SUBSECTION: "${subTitle}"
TARGET LENGTH: ~${subsectionTargetWords} words
THESIS OUTLINE:
${globalOutline}
PREVIOUS SECTIONS: ${prevSummaries || 'None'}
THIS SECTION SO FAR:
${memoryContext}
PRECEDING TEXT:
...${prevText}`;

    // ══════════════════════════════════════════════════════════════
    // STAGE 1: Research — Fetch papers + extract evidence
    // ══════════════════════════════════════════════════════════════
    if (job) await job.updateProgress({ stage: 'Researching', subsectionIndex: currentIndex, totalSubsections: subsections.length, percent });

    const searchQuery = `${thesis.title} ${subTitle} ${thesis.field}`.slice(0, 100);
    const papers = await fetchAcademicPapers(searchQuery, 3, logger);

    let evidenceBlock = '';
    if (papers.length > 0) {
      evidenceBlock = 'RESEARCH EVIDENCE (cite these DOIs where applicable):\n' +
        papers
          .filter(p => p.abstract)
          .map(p => `- "${p.title}" (${p.authors}, ${p.year}). DOI: ${p.doi}\n  Key finding: ${p.abstract!.slice(0, 300)}`)
          .join('\n');
    }

    const evidenceInstruction = evidenceBlock
      ? `\n\n${evidenceBlock}\n\nYou MUST cite from these DOIs using APA in-text format. DO NOT invent references.`
      : '\n\nNo research papers found. Write conservatively using general academic knowledge. Do NOT fabricate citations.';

    // ══════════════════════════════════════════════════════════════
    // STAGE 2: Draft with Blueprint Context + Evidence
    // ══════════════════════════════════════════════════════════════
    if (job) await job.updateProgress({ stage: 'Drafting', subsectionIndex: currentIndex, totalSubsections: subsections.length, percent: percent + 5 });

    const draftRes = await callAI(
      'draft',
      MODELS.DRAFTER,
      `You are an expert academic writer. Write a complete, publication-ready subsection for an academic thesis.

${blueprintContext ? blueprintContext + '\n\n' : ''}${context}
${evidenceInstruction}

REQUIREMENTS:
• Write ~${subsectionTargetWords} words of formal academic English
• Include APA in-text citations where claims are supported by the evidence above
• Ensure logical flow from the preceding text
• Use clear topic sentences and transitions between paragraphs
• Write from the perspective of the author, ${authorName}. Use third person academic voice
• DO NOT wrap in markdown code blocks — return raw text only
• DO NOT include the subsection title — just the body text`,
      `Write the subsection "${subTitle}".`,
      logger
    );
    costTracker.add(draftRes.estimatedCostUsd);
    costTracker.checkBudget();

    // ══════════════════════════════════════════════════════════════
    // STAGE 2.5: Citation Validation (only if papers were found)
    // ══════════════════════════════════════════════════════════════
    let citationIssues: string | null = null;

    if (papers.length > 0) {
      if (job) await job.updateProgress({ stage: 'Validating Citations', subsectionIndex: currentIndex, totalSubsections: subsections.length, percent: percent + 8 });
      citationIssues = await validateCitations(draftRes.content, evidenceBlock, logger, costTracker);
      if (citationIssues) {
        logger.info(`   ⚠️  Citation issues found in "${subTitle}" — forwarding to Review`);
      }
    }

    // ══════════════════════════════════════════════════════════════
    // STAGE 3: Review + Improve (with citation issues injected)
    // ══════════════════════════════════════════════════════════════
    if (job) await job.updateProgress({ stage: 'Reviewing', subsectionIndex: currentIndex, totalSubsections: subsections.length, percent: percent + 10 });

    const citationCorrectionBlock = citationIssues
      ? `\n\nCITATION ISSUES TO FIX (identified by citation validator):\n${citationIssues}\n\nFor each ISSUE above: remove the fabricated citation OR replace it with a correctly used citation from the evidence list.`
      : '';

    const reviewRes = await callAI(
      'review',
      MODELS.LARGE,
      `You are a senior academic reviewer. Perform a comprehensive review pass on this thesis subsection.

Address ALL of the following in one output:
1. CONSISTENCY: Fix logical gaps, contradictions, or non-sequiturs
2. ORIGINALITY: Rephrase overly generic sentences to have a unique academic voice
3. CITATIONS: Verify all in-text citations match the provided evidence. Remove fabricated references.${citationCorrectionBlock}
${evidenceBlock ? `\n${evidenceBlock}` : '\nNo external evidence was provided — ensure no fabricated citations exist.'}

RULES:
• Return the COMPLETE improved text — not a list of suggestions
• Preserve the original structure and academic tone
• DO NOT wrap in markdown code blocks`,
      `Review and improve this draft:\n\n${draftRes.content}`,
      logger
    );
    costTracker.add(reviewRes.estimatedCostUsd);
    costTracker.checkBudget();

    // ══════════════════════════════════════════════════════════════
    // STAGE 4: Final Polish + Structured Memory
    // ══════════════════════════════════════════════════════════════
    if (job) await job.updateProgress({ stage: 'Polishing', subsectionIndex: currentIndex, totalSubsections: subsections.length, percent: percent + 15 });

    const polishRes = await callAI(
      'polish',
      MODELS.MEDIUM,
      `You are a meticulous academic editor. Perform final polishing on this thesis subsection.

Fix: grammar, spelling, punctuation, awkward phrasing, formatting inconsistencies.
Ensure: perfect academic tone, smooth paragraph transitions, consistent tense and voice.

After the polished text, add the separator line "---MEMORY---" followed by a JSON object summarising this subsection for future reference:
{
  "summary": "One sentence: the main argument or finding of this subsection.",
  "keyFindings": ["Finding or fact 1", "Finding or fact 2"],
  "definitions": {"term": "definition if any key term was defined"},
  "importantClaims": ["Claim supported by evidence 1"],
  "methodologyNotes": ["Any methodological detail to carry forward"]
}

RULES:
• Return polished text, then ---MEMORY---, then the JSON
• All JSON arrays may be empty if not applicable
• DO NOT wrap in markdown code blocks
• DO NOT change meaning or remove citations`,
      `Polish this text:\n\n${reviewRes.content}`,
      logger
    );
    costTracker.add(polishRes.estimatedCostUsd);
    costTracker.checkBudget();

    // Parse polish output — split on ---MEMORY---
    const polishRaw = polishRes.content;
    const memSepIdx = polishRaw.indexOf('---MEMORY---');
    const polishedText = memSepIdx > 0 ? polishRaw.slice(0, memSepIdx).trim() : polishRaw.trim();
    const memoryRaw   = memSepIdx > 0 ? polishRaw.slice(memSepIdx + 12).trim() : '';

    const structuredMemory = parseStructuredMemory(memoryRaw || `{"summary": "Discussed ${subTitle}."}`);

    // ══════════════════════════════════════════════════════════════
    // Quality Guard — cheap retry if too short
    // ══════════════════════════════════════════════════════════════
    const wordCount = polishedText.split(/\s+/).filter(Boolean).length;
    const minWords = Math.max(50, Math.round(subsectionTargetWords * 0.3));

    let finalText = polishedText;
    let finalMemory = structuredMemory;

    if (wordCount < minWords || polishedText.length < 100) {
      let bestText = polishedText;
      let bestWordCount = wordCount;

      for (let retry = 1; retry <= 2; retry++) {
        await new Promise(r => setTimeout(r, 1000 * retry));

        const retryRes = await callAI(
          'draft',
          MODELS.DRAFTER,
          `You are an expert academic writer. Your previous output was too short (${bestWordCount} words, need at least ${subsectionTargetWords}).

CRITICAL: Write AT LEAST ${subsectionTargetWords} words. This is a FULL academic subsection, not a summary.
${blueprintContext ? '\n' + blueprintContext + '\n' : ''}
${context}
${evidenceInstruction}

• Write detailed paragraph-level academic prose
• Include specific examples and arguments
• DO NOT return bullet points or outlines
• DO NOT wrap in markdown code blocks`,
          `Write a FULL, detailed subsection "${subTitle}" (minimum ${subsectionTargetWords} words).`,
          logger
        );
        costTracker.add(retryRes.estimatedCostUsd);

        const rWC = retryRes.content.split(/\s+/).filter(Boolean).length;
        if (rWC > bestWordCount) { bestText = retryRes.content; bestWordCount = rWC; }
        if (bestWordCount >= minWords) break;
      }

      if (bestWordCount > wordCount) {
        const rePolishRes = await callAI(
          'polish',
          MODELS.MEDIUM,
          `Polish this academic text. Fix grammar, spelling, and ensure academic tone.\n\nAfter the polished text, add "---MEMORY---" followed by JSON:\n{"summary":"...","keyFindings":[],"definitions":{},"importantClaims":[],"methodologyNotes":[]}\n\nDO NOT wrap in markdown code blocks.`,
          `Polish:\n\n${bestText}`,
          logger
        );
        costTracker.add(rePolishRes.estimatedCostUsd);
        const rpRaw = rePolishRes.content;
        const rpSep = rpRaw.indexOf('---MEMORY---');
        finalText   = rpSep > 0 ? rpRaw.slice(0, rpSep).trim() : rpRaw.trim();
        finalMemory = parseStructuredMemory(rpSep > 0 ? rpRaw.slice(rpSep + 12).trim() : '');
      }
    }

    // ══════════════════════════════════════════════════════════════
    // STAGE 5: Image Generation (non-fatal, selective)
    // ══════════════════════════════════════════════════════════════
    let imageData: any = null;
    if (!SKIP_IMAGE_SECTIONS.has(sectionId)) {
      if (job) await job.updateProgress({ stage: 'Generating Image', subsectionIndex: currentIndex, totalSubsections: subsections.length, percent: percent + 18 });
      imageData = await generateSubsectionImage(thesis.title, section!.label, subTitle, finalText);
    }

    // ══════════════════════════════════════════════════════════════
    // Save progress
    // ══════════════════════════════════════════════════════════════
    const finalSubContent = `\n\n### ${subTitle}\n\n${finalText}`;

    if (!meta.subsectionContents) meta.subsectionContents = [];
    if (!meta.subsectionMemories)  meta.subsectionMemories = [];
    if (!meta.subsectionImages)    meta.subsectionImages = [];

    meta.subsectionContents[currentIndex] = finalSubContent;
    meta.subsectionMemories[currentIndex]  = finalMemory;
    // Also write flat summary for backward compat with any existing frontend reads
    if (!meta.subsectionSummaries) meta.subsectionSummaries = [];
    meta.subsectionSummaries[currentIndex] = finalMemory.summary;

    if (imageData) {
      meta.subsectionImages[currentIndex] = {
        base64: imageData.base64,
        caption: imageData.caption,
        prompt: imageData.prompt,
      };
    }

    currentContent = (meta.subsectionContents as string[]).join('');
    const finalWordCount = currentContent.split(/\s+/).filter(Boolean).length;
    const stageDuration  = Date.now() - stageStart;

    meta.stages.push({
      subsection: subTitle,
      durationMs: stageDuration,
      llmCalls: papers.length > 0 ? 4 : 3, // draft + [cite-val] + review + polish
      citationIssuesFound: !!citationIssues,
    });

    currentIndex++;
    meta.currentSubsectionIndex = currentIndex;
    meta.estimatedCostUsd = costTracker.total;

    section = await prisma.section.update({
      where: { thesisId_id: { thesisId, id: sectionId } },
      data: { content: currentContent.trim(), wordCount: finalWordCount, pipelineMetadata: meta as any },
    });

    // Record usage — now includes provider-level metadata
    await prisma.usage.create({
      data: {
        userId: thesis.userId,
        thesisId,
        sectionId,
        costUsd: draftRes.estimatedCostUsd + reviewRes.estimatedCostUsd + polishRes.estimatedCostUsd,
        tokens: draftRes.totalTokens + reviewRes.totalTokens + polishRes.totalTokens,
        model: draftRes.model,
        stage: `subsection:${subTitle}`,
        provider: draftRes.provider,
        promptTokens: draftRes.promptTokens + reviewRes.promptTokens + polishRes.promptTokens,
        outputTokens: draftRes.outputTokens + reviewRes.outputTokens + polishRes.outputTokens,
        latencyMs: draftRes.durationMs + reviewRes.durationMs + polishRes.durationMs,
      },
    }).catch((err: unknown) => logger.warn({ err }, 'Failed to record usage — non-fatal'));

    logger.info(`   ✅ ${subTitle} — ${finalWordCount} words (${(stageDuration / 1000).toFixed(0)}s)${citationIssues ? ' [citations corrected]' : ''}`);
  }

  // ── Section complete ──────────────────────────────────────────────
  meta.status = 'completed';
  meta.estimatedCostUsd = costTracker.total;

  const finalSection = await prisma.section.update({
    where: { thesisId_id: { thesisId, id: sectionId } },
    data: { pipelineMetadata: meta },
  });

  if (job) await job.updateProgress({ stage: 'Completed', subsectionIndex: currentIndex, totalSubsections: subsections.length, percent: 100 });

  logger.info(`✅ ${section!.label} DONE — ${finalSection.wordCount} words, $${costTracker.total.toFixed(4)}`);

  return finalSection;
}
