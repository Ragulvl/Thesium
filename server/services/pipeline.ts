// Why: Optimized pipeline — reduced from 11 LLM calls to 4 per subsection (~70% cost reduction, 2-3x faster).
import { prisma } from '../config/prisma.js';
import { callModelWithRetry } from './openRouter.js';
import { fetchAcademicPapers } from './scholar.js';
import { generateSubsectionImage } from './imageGenerator.js';
import { DEFAULT_SECTIONS } from '../shared/constants.js';
import { MODELS, MAX_JOB_COST_USD } from '../config/models.js';

// Sections that don't need images
const SKIP_IMAGE_SECTIONS = new Set(['title', 'toc', 'references', 'appendices']);

const PAGE_DISTRIBUTION: Record<string, number> = {
  title: 0.01,
  abstract: 0.02,
  toc: 0.02,
  introduction: 0.12,
  literature: 0.30,
  methodology: 0.20,
  results: 0.18,
  discussion: 0.10,
  conclusion: 0.04,
  references: 0.01,
  appendices: 0.0,
};

/** Track cumulative cost for a pipeline run and abort if over budget. */
class CostTracker {
  private totalCostUsd = 0;
  private readonly budgetUsd: number;

  constructor(budgetUsd: number) {
    this.budgetUsd = budgetUsd;
  }

  add(costUsd: number) {
    this.totalCostUsd += costUsd;
  }

  get total() { return this.totalCostUsd; }

  checkBudget() {
    if (this.totalCostUsd > this.budgetUsd) {
      throw new Error(`Pipeline aborted: estimated cost $${this.totalCostUsd.toFixed(4)} exceeds budget $${this.budgetUsd.toFixed(2)}`);
    }
  }
}

/**
 * Optimized 4-Stage Pipeline (was 11 stages).
 *
 * Per subsection:
 *   Stage 1: Research + Outline  — fetch papers, build evidence, generate intent (1 LLM call + 1 API call)
 *   Stage 2: Draft with Citations — write full subsection with inline citations (1 LLM call)
 *   Stage 3: Review + Improve    — consistency, originality, coherence in one pass (1 LLM call)
 *   Stage 4: Final Polish + Summary — grammar, formatting, + context summary for next subsection (1 LLM call)
 *
 * Total: ~4 LLM calls per subsection (down from 11)
 */
export async function runAIPipeline(thesisId: string, sectionId: string, job: any, logger: any) {
  const costTracker = new CostTracker(MAX_JOB_COST_USD);

  // Fetch thesis and section
  const thesis = await prisma.thesis.findUnique({ where: { id: thesisId }, include: { user: true } });
  let section = await prisma.section.findUnique({ where: { thesisId_id: { thesisId, id: sectionId } } });

  if (!thesis || !section) {
    throw new Error('Thesis or section not found');
  }

  // ── Static sections: Title Page and TOC don't need the AI pipeline ──
  if (sectionId === 'title') {
    const authorName = (thesis as any).user?.name || 'Student';
    const titleContent = `# ${thesis.title}\n\n**Author:** ${authorName}\n**Field of Study:** ${thesis.field}\n**Date:** ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}\n**Target Pages:** ${thesis.targetPages}`;
    const wc = titleContent.split(/\s+/).filter(Boolean).length;
    await prisma.section.update({
      where: { thesisId_id: { thesisId, id: sectionId } },
      data: { content: titleContent, wordCount: wc, pipelineMetadata: { status: 'complete' } },
    });
    if (job) await job.updateProgress({ stage: 'Complete', percent: 100 });
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
      data: { content: tocContent, wordCount: wc, pipelineMetadata: { status: 'complete' } },
    });
    if (job) await job.updateProgress({ stage: 'Complete', percent: 100 });
    return;
  }

  // Gather context
  const allSections = await prisma.section.findMany({
    where: { thesisId },
    orderBy: { order: 'asc' }
  });

  const previousSectionsArray = allSections.filter((s) => s.order < section!.order && s.wordCount > 0);
  const globalOutline = thesis.outline || DEFAULT_SECTIONS.map((s, idx) => `${idx + 1}. ${s.label}`).join('\n');
  const prevSummaries = previousSectionsArray.map(s => `- [${s.label}]: Completed.`).join('\n');

  // Load or create pipeline metadata (supports resumption)
  let meta: any = section.pipelineMetadata || {};

  // ── STEP 0: Generate subsection outline (1 LLM call, runs once per section) ──
  if (!meta.subsections || meta.subsections.length === 0) {
    // Outline generation (silent)

    const outlineRes = await callModelWithRetry(MODELS.DRAFTER,
      `You are an academic thesis structurer. For the section "${section!.label}" in a thesis titled "${thesis.title}" (field: ${thesis.field}), generate a structured outline.\n\nReturn ONLY a numbered list of 3 to 6 logical subsection titles. No markdown, no explanation — just the list.`,
      `Generate the subsection outline.`,
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
      subsectionSummaries: [],
      status: 'generating',
      stages: [],
      estimatedCostUsd: costTracker.total,
      pipelineVersion: 2, // Mark as optimized pipeline
    };

    section = await prisma.section.update({
      where: { thesisId_id: { thesisId, id: sectionId } },
      data: { pipelineMetadata: meta as any }
    });
  }

  const subsections = meta.subsections;
  let currentIndex = meta.currentSubsectionIndex || 0;
  let currentContent = section.content || '';

  // Word count targets
  const allocatedPercentage = PAGE_DISTRIBUTION[section.id] || 0.10;
  const targetPages = thesis.targetPages || 60;
  const sectionTargetWords = Math.max(300, Math.round(targetPages * allocatedPercentage * 325));
  const subsectionTargetWords = Math.round(sectionTargetWords / subsections.length);

  logger.info(`📝 ${section.label} — ${subsections.length} subsections, ~${sectionTargetWords} words target`);

  // ── MAIN LOOP: 4 stages per subsection ──
  while (currentIndex < subsections.length) {
    const subTitle = subsections[currentIndex];
    const stageStart = Date.now();

    // Processing subsection (silent — completion logged below)

    const percent = Math.floor((currentIndex / subsections.length) * 100);
    if (job) await job.updateProgress({ stage: 'Generating', subsectionIndex: currentIndex, totalSubsections: subsections.length, percent });

    // Build context block (shared across stages)
    const safeContents = meta.subsectionContents || [];
    const prevText = safeContents.length > 0
      ? safeContents[safeContents.length - 1].slice(-2000)
      : (previousSectionsArray.length > 0 ? previousSectionsArray[previousSectionsArray.length - 1].content.slice(-2000) : 'No prior content.');
    const localSummaries = (meta.subsectionSummaries || []).map((s: string, i: number) => `${i + 1}. ${s}`).join('\n');

    const authorName = (thesis as any).user?.name || 'the author';
    const context = `THESIS: "${thesis.title}" | AUTHOR: ${authorName} | SECTION: "${section.label}" | SUBSECTION: "${subTitle}"
TARGET LENGTH: ~${subsectionTargetWords} words
THESIS OUTLINE:\n${globalOutline}
PREVIOUS SECTIONS: ${prevSummaries || 'None'}
THIS SECTION SO FAR:\n${localSummaries || '(Starting)'}
PRECEDING TEXT:\n...${prevText}`;

    // ════════════════════════════════════════════════════════════════
    // STAGE 1: Research — Fetch papers + extract evidence (1 API + 1 LLM)
    // ════════════════════════════════════════════════════════════════
    if (job) await job.updateProgress({ stage: 'Researching', subsectionIndex: currentIndex, totalSubsections: subsections.length, percent });

    // Generate search query + fetch papers in one step
    const searchQuery = `${thesis.title} ${subTitle} ${thesis.field}`.slice(0, 100);
    const papers = await fetchAcademicPapers(searchQuery, 3, logger);

    // Build evidence block from paper abstracts (no LLM call needed — abstracts ARE the evidence)
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

    // ════════════════════════════════════════════════════════════════
    // STAGE 2: Draft with Citations (1 LLM call — replaces 5 old stages)
    // ════════════════════════════════════════════════════════════════
    if (job) await job.updateProgress({ stage: 'Drafting', subsectionIndex: currentIndex, totalSubsections: subsections.length, percent: percent + 5 });

    const draftRes = await callModelWithRetry(MODELS.DRAFTER,
      `You are an expert academic writer. Write a complete, publication-ready subsection for an academic thesis.

${context}
${evidenceInstruction}

REQUIREMENTS:
• Write ~${subsectionTargetWords} words of formal academic English
• Include APA in-text citations where claims are supported by the evidence above
• Ensure logical flow from the preceding text
• Use clear topic sentences and transitions between paragraphs
• Write from the perspective of the author, ${(thesis as any).user?.name || 'the researcher'}. Use third person academic voice (e.g. "the author proposes...", "this study examines...")
• DO NOT wrap in markdown code blocks — return raw text only
• DO NOT include the subsection title — just the body text`,
      `Write the subsection "${subTitle}".`,
      logger
    );
    costTracker.add(draftRes.estimatedCostUsd);
    costTracker.checkBudget();

    // ════════════════════════════════════════════════════════════════
    // STAGE 3: Review + Improve (1 LLM call — replaces consistency + originality + citation verification)
    // ════════════════════════════════════════════════════════════════
    if (job) await job.updateProgress({ stage: 'Reviewing', subsectionIndex: currentIndex, totalSubsections: subsections.length, percent: percent + 10 });

    const reviewRes = await callModelWithRetry(MODELS.LARGE,
      `You are a senior academic reviewer. Perform a SINGLE comprehensive review pass on this thesis subsection.

Your review must address ALL of the following in one output:
1. CONSISTENCY: Fix any logical gaps, contradictions, or non-sequiturs
2. ORIGINALITY: Rephrase overly generic sentences to have a unique academic voice
3. CITATIONS: Verify that all in-text citations match the provided evidence below. Remove any fabricated references. Soften claims that go beyond what the evidence supports.
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

    // ════════════════════════════════════════════════════════════════
    // STAGE 4: Final Polish + Context Summary (1 LLM call — replaces grammar + summary)
    // ════════════════════════════════════════════════════════════════
    if (job) await job.updateProgress({ stage: 'Polishing', subsectionIndex: currentIndex, totalSubsections: subsections.length, percent: percent + 15 });

    const polishRes = await callModelWithRetry(MODELS.MEDIUM,
      `You are a meticulous academic editor. Perform final polishing on this thesis subsection text.

Fix: grammar, spelling, punctuation, awkward phrasing, and formatting inconsistencies.
Ensure: perfect academic tone, smooth paragraph transitions, consistent tense/voice.

After the polished text, add a SEPARATOR line "---SUMMARY---" followed by a 1-sentence summary of the main argument in this subsection.

RULES:
• Return the polished text followed by ---SUMMARY--- and the summary
• DO NOT wrap in markdown code blocks
• DO NOT change the meaning or remove citations`,
      `Polish this text:\n\n${reviewRes.content}`,
      logger
    );
    costTracker.add(polishRes.estimatedCostUsd);
    costTracker.checkBudget();

    // Parse polished content and summary
    const polishOutput = polishRes.content;
    const separatorIdx = polishOutput.indexOf('---SUMMARY---');
    const polishedText = separatorIdx > 0
      ? polishOutput.slice(0, separatorIdx).trim()
      : polishOutput.trim();
    const contextSummary = separatorIdx > 0
      ? polishOutput.slice(separatorIdx + 13).trim()
      : `Discussed ${subTitle}.`;

    // ════════════════════════════════════════════════════════════════
    // QUALITY GUARD — cheap validation before saving
    // ════════════════════════════════════════════════════════════════
    const wordCount = polishedText.split(/\s+/).filter(Boolean).length;
    const minWords = Math.max(50, Math.round(subsectionTargetWords * 0.3));

    let finalText = polishedText;
    let finalSummary = contextSummary;

    const MAX_QUALITY_RETRIES = 2;

    if (wordCount < minWords || polishedText.length < 100) {
      // Quality guard retry (silent)

      let bestText = polishedText;
      let bestWordCount = wordCount;

      for (let retryNum = 1; retryNum <= MAX_QUALITY_RETRIES; retryNum++) {
        // Exponential backoff: 1s, 2s
        await new Promise(res => setTimeout(res, 1000 * retryNum));

        // Retry attempt (silent)

        const retryRes = await callModelWithRetry(MODELS.DRAFTER,
          `You are an expert academic writer. Your previous output was too short (${bestWordCount} words, need at least ${subsectionTargetWords}).

CRITICAL: Write AT LEAST ${subsectionTargetWords} words. This is a FULL academic subsection, not a summary.

${context}
${evidenceInstruction}

• Write detailed, paragraph-level academic prose
• Include specific examples and arguments
• DO NOT return bullet points or outlines
• DO NOT wrap in markdown code blocks`,
          `Write a FULL, detailed subsection "${subTitle}" (minimum ${subsectionTargetWords} words).`,
          logger
        );
        costTracker.add(retryRes.estimatedCostUsd);

        const retryWordCount = retryRes.content.split(/\s+/).filter(Boolean).length;

        if (retryWordCount > bestWordCount) {
          bestText = retryRes.content;
          bestWordCount = retryWordCount;
          // Retry improved (silent)
        }

        // Exit early if we've hit the target
        if (bestWordCount >= minWords) break;
      }

      // Re-polish if we got better text
      if (bestWordCount > wordCount) {
        const rePolishRes = await callModelWithRetry(MODELS.MEDIUM,
          `Polish this academic text. Fix grammar, spelling, and ensure academic tone.\n\nAfter the polished text, add "---SUMMARY---" followed by a 1-sentence summary.\n\nDO NOT wrap in markdown code blocks.`,
          `Polish:\n\n${bestText}`,
          logger
        );
        costTracker.add(rePolishRes.estimatedCostUsd);

        const reOutput = rePolishRes.content;
        const reSepIdx = reOutput.indexOf('---SUMMARY---');
        finalText = reSepIdx > 0 ? reOutput.slice(0, reSepIdx).trim() : reOutput.trim();
        finalSummary = reSepIdx > 0 ? reOutput.slice(reSepIdx + 13).trim() : `Discussed ${subTitle}.`;
      }

      if (bestWordCount < minWords) {
        // Using best available (silent)
      }
    }

    // ════════════════════════════════════════════════════════════════
    // STAGE 5: Image Generation (non-fatal)
    // ════════════════════════════════════════════════════════════════
    let imageData: any = null;
    if (!SKIP_IMAGE_SECTIONS.has(sectionId)) {
      if (job) await job.updateProgress({ stage: 'Generating Image', subsectionIndex: currentIndex, totalSubsections: subsections.length, percent: percent + 18 });
      imageData = await generateSubsectionImage(thesis.title, section.label, subTitle, finalText);
    }

    // ════════════════════════════════════════════════════════════════
    // Save progress
    // ════════════════════════════════════════════════════════════════
    const finalSubContent = `\n\n### ${subTitle}\n\n${finalText}`;

    if (!meta.subsectionContents) meta.subsectionContents = [];
    if (!meta.subsectionSummaries) meta.subsectionSummaries = [];
    if (!meta.subsectionImages) meta.subsectionImages = [];

    meta.subsectionContents[currentIndex] = finalSubContent;
    meta.subsectionSummaries[currentIndex] = finalSummary;
    if (imageData) {
      meta.subsectionImages[currentIndex] = {
        base64: imageData.base64,
        caption: imageData.caption,
        prompt: imageData.prompt,
      };
    }

    currentContent = meta.subsectionContents.join('');
    const finalWordCount = currentContent.split(/\s+/).filter(Boolean).length;

    const stageDuration = Date.now() - stageStart;
    meta.stages.push({
      subsection: subTitle,
      durationMs: stageDuration,
      llmCalls: 3, // draft + review + polish (research uses API, not LLM)
    });

    currentIndex++;
    meta.currentSubsectionIndex = currentIndex;
    meta.estimatedCostUsd = costTracker.total;

    section = await prisma.section.update({
      where: { thesisId_id: { thesisId, id: sectionId } },
      data: {
        content: currentContent.trim(),
        wordCount: finalWordCount,
        pipelineMetadata: meta as any
      }
    });

    // Record usage for this subsection (cost tracking for monetization)
    await prisma.usage.create({
      data: {
        userId: thesis.userId,
        thesisId,
        sectionId,
        costUsd: draftRes.estimatedCostUsd + reviewRes.estimatedCostUsd + polishRes.estimatedCostUsd,
        tokens: 0, // Token-level tracking not available from OpenRouter — cost is the primary metric
        model: MODELS.DRAFTER,
        stage: `subsection:${subTitle}`,
      }
    }).catch((err: unknown) => logger.warn({ err }, 'Failed to record usage — non-fatal'));

    logger.info(`   ✅ ${subTitle} — ${finalWordCount} words (${(stageDuration / 1000).toFixed(0)}s)`);
  }

  // ── Complete ──
  meta.status = 'completed';
  meta.estimatedCostUsd = costTracker.total;
  const finalSection = await prisma.section.update({
    where: { thesisId_id: { thesisId, id: sectionId } },
    data: { pipelineMetadata: meta }
  });

  if (job) await job.updateProgress({ stage: 'Completed', subsectionIndex: currentIndex, totalSubsections: subsections.length, percent: 100 });

  logger.info(`✅ ${section.label} DONE — ${finalSection.wordCount} words, $${costTracker.total.toFixed(4)}`);

  return finalSection;
}
