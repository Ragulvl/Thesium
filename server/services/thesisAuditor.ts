// Whole-Thesis Auditor — runs AFTER all sections are complete.
//
// Design: Condenses every section to ~600 words (first 400 + last 200) so the
// entire thesis fits in a single context window. One LARGE model call produces
// a structured JSON audit report covering repetition, contradictions, missing
// transitions, and terminology inconsistency.
//
// The report is stored in thesis.auditReport (Json?) and returned for display.

import { prisma } from '../config/prisma.js';
import { aiRouter } from './ai/index.js';
import type { AIResponse, PipelineStage } from './ai/index.js';
import { callModelWithRetry } from './openRouter.js';   // Kept for USE_AI_ROUTER=false rollback
import { MODELS } from '../config/models.js';
import { env } from '../config/env.js';

// ── AI Router Toggle ─────────────────────────────────────────────────
const USE_AI_ROUTER = env.USE_AI_ROUTER !== 'false';

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

// ── Types ─────────────────────────────────────────────────────────────

export interface AuditIssue {
  category: 'repetition' | 'contradiction' | 'transition' | 'terminology' | 'balance';
  severity: 'high' | 'medium' | 'low';
  description: string;
  affectedSections: string[];
  suggestion: string;
}

export interface ThesisAuditReport {
  generatedAt: string;
  overallScore: 'excellent' | 'good' | 'fair' | 'poor';
  issues: AuditIssue[];
  strengths: string[];
  wordCountBalance: Record<string, number>;
  summary: string;
}

// ── Helpers ───────────────────────────────────────────────────────────

function condenseSection(content: string, targetWords = 600): string {
  const words = content.split(/\s+/).filter(Boolean);
  if (words.length <= targetWords) return content;

  // Take first 400 words + last 200 words with a gap marker
  const head = words.slice(0, 400).join(' ');
  const tail = words.slice(-200).join(' ');
  return `${head}\n\n[... ${words.length - 600} words omitted ...]\n\n${tail}`;
}

function parseAuditReport(raw: string): ThesisAuditReport | null {
  try {
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return null;
    const parsed = JSON.parse(match[0]);

    const validScores = ['excellent', 'good', 'fair', 'poor'] as const;
    const validCategories = ['repetition', 'contradiction', 'transition', 'terminology', 'balance'] as const;
    const validSeverities = ['high', 'medium', 'low'] as const;

    return {
      generatedAt: new Date().toISOString(),
      overallScore: validScores.includes(parsed.overallScore) ? parsed.overallScore : 'fair',
      issues: Array.isArray(parsed.issues)
        ? parsed.issues
            .filter((i: any) => typeof i === 'object')
            .map((i: any): AuditIssue => ({
              category:        validCategories.includes(i.category) ? i.category : 'repetition',
              severity:        validSeverities.includes(i.severity) ? i.severity : 'medium',
              description:     typeof i.description === 'string' ? i.description : '',
              affectedSections: Array.isArray(i.affectedSections) ? i.affectedSections : [],
              suggestion:      typeof i.suggestion === 'string' ? i.suggestion : '',
            }))
        : [],
      strengths:        Array.isArray(parsed.strengths) ? parsed.strengths : [],
      wordCountBalance: typeof parsed.wordCountBalance === 'object' ? parsed.wordCountBalance : {},
      summary:          typeof parsed.summary === 'string' ? parsed.summary : 'Audit complete.',
    };
  } catch {
    return null;
  }
}

// ── Main ──────────────────────────────────────────────────────────────

export async function runThesisAudit(
  thesisId: string,
  job: any,
  logger: any
): Promise<ThesisAuditReport> {
  const thesis = await prisma.thesis.findUnique({
    where: { id: thesisId },
    include: { sections: { orderBy: { order: 'asc' } } },
  });

  if (!thesis) throw new Error(`Thesis ${thesisId} not found`);

  // Filter to sections that have meaningful content
  const writtenSections = thesis.sections.filter(
    s => !['title', 'toc'].includes(s.id) && (s.wordCount ?? 0) > 100
  );

  if (writtenSections.length < 2) {
    throw new Error('Not enough sections written to audit (need at least 2)');
  }

  if (job) await job.updateProgress({ stage: 'Preparing Audit', percent: 10 });

  // Word count balance map
  const wordCountBalance: Record<string, number> = {};
  for (const s of writtenSections) {
    wordCountBalance[s.label] = s.wordCount ?? 0;
  }

  // Build condensed thesis input
  const condensedSections = writtenSections
    .map(s => `=== ${s.label.toUpperCase()} ===\n${condenseSection(s.content, 600)}`)
    .join('\n\n');

  const totalWords = Object.values(wordCountBalance).reduce((a, b) => a + b, 0);

  if (job) await job.updateProgress({ stage: 'Running Audit', percent: 30 });

  logger.info(`🔍 Auditing thesis "${thesis.title}" — ${writtenSections.length} sections, ~${totalWords} words`);

  const auditRes = await callAI(
    'audit',
    MODELS.LARGE,
    `You are a senior academic thesis auditor reviewing a complete thesis manuscript.

Your task: perform a whole-thesis quality audit. Check ALL of the following across sections:

1. REPETITION — ideas, sentences, or arguments duplicated across sections
2. CONTRADICTION — conflicting claims, data, or conclusions between sections
3. TRANSITION — abrupt section endings or beginnings with no logical bridge
4. TERMINOLOGY — same concept referred to by different names in different sections
5. BALANCE — sections that are disproportionately long or short relative to their importance

Return ONLY valid JSON (no markdown fences, no explanation):
{
  "overallScore": "excellent|good|fair|poor",
  "summary": "2-3 sentence overall assessment of the thesis quality.",
  "strengths": [
    "Strength 1",
    "Strength 2"
  ],
  "issues": [
    {
      "category": "repetition|contradiction|transition|terminology|balance",
      "severity": "high|medium|low",
      "description": "Clear description of the problem found.",
      "affectedSections": ["Section Name A", "Section Name B"],
      "suggestion": "Specific, actionable fix."
    }
  ]
}

Rules:
- Maximum 8 issues — prioritise by severity
- If the thesis is excellent, issues array may be empty
- Be specific: name the sections and the exact problem
- Strengths array: 2-4 items minimum`,
    `THESIS: "${thesis.title}"
FIELD: ${thesis.field || 'General'}
TOTAL WORDS: ${totalWords}
WORD DISTRIBUTION: ${JSON.stringify(wordCountBalance)}

CONDENSED CONTENT:

${condensedSections}

Produce the audit JSON.`,
    logger
  );

  if (job) await job.updateProgress({ stage: 'Saving Report', percent: 80 });

  const report = parseAuditReport(auditRes.content);

  if (!report) {
    throw new Error('Audit produced unparseable output');
  }

  // Attach word count balance to report
  report.wordCountBalance = wordCountBalance;

  // Save to thesis record
  await prisma.thesis.update({
    where: { id: thesisId },
    data: { auditReport: report as any },
  });

  if (job) await job.updateProgress({ stage: 'Completed', percent: 100 });

  const issueCount = report.issues.length;
  const highSeverity = report.issues.filter(i => i.severity === 'high').length;
  logger.info(`✅ Audit complete: ${report.overallScore.toUpperCase()} — ${issueCount} issues (${highSeverity} high severity)`);

  return report;
}
