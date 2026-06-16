// Image generation service — uses LLM to generate SVG diagrams for thesis figures.
// Security fix: LLM-returned SVG is now sanitized before storage to remove
// script tags, event handlers, external references (SSRF), and foreignObject.
import { aiRouter } from './ai/index.js';
import type { AIResponse, PipelineStage } from './ai/index.js';
import { callModelWithRetry } from './openRouter.js';   // Kept for USE_AI_ROUTER=false rollback
import { MODELS } from '../config/models.js';
import { logger } from '../config/logger.js';
import { env } from '../config/env.js';

// ── AI Router Toggle ─────────────────────────────────────────────────
const USE_AI_ROUTER = env.USE_AI_ROUTER !== 'false';

async function callAI(
  stage: PipelineStage,
  model: string,
  systemPrompt: string,
  userPrompt: string,
  callLogger: any,
): Promise<AIResponse> {
  if (USE_AI_ROUTER) {
    return aiRouter.generate({ stage, systemPrompt, userPrompt }, callLogger);
  }
  const res = await callModelWithRetry(model, systemPrompt, userPrompt, callLogger);
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

export interface GeneratedImage {
  base64: string;       // base64-encoded sanitized SVG
  prompt: string;       // the prompt used
  caption: string;      // short caption for the image
  isSvg: true;          // flag for export to handle correctly
}

/**
 * Strip dangerous elements and attributes from an SVG string.
 *
 * We do NOT use a full DOM parser here to avoid a heavy dependency.
 * Instead we apply targeted regex removals for the specific attack
 * vectors that are relevant in this context (LLM-generated SVGs):
 *
 *  - <script> blocks
 *  - on* event handler attributes (onclick, onload, etc.)
 *  - href / xlink:href pointing to external URLs or data: URIs
 *  - <foreignObject> (allows HTML injection inside SVG)
 *  - <use> with external references
 */
function sanitizeSvg(svg: string): string {
  return svg
    // Remove <script> blocks entirely
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    // Remove on* event handlers (onclick, onload, onmouseover, etc.)
    .replace(/\son\w+\s*=\s*["'][^"']*["']/gi, '')
    .replace(/\son\w+\s*=\s*[^\s>]*/gi, '')
    // Remove javascript: URI schemes
    .replace(/javascript\s*:/gi, 'blocked:')
    // Remove data: URI references (can embed scripts)
    .replace(/(?:href|src|xlink:href)\s*=\s*["']data:[^"']*["']/gi, '')
    // Remove external http(s) href references (SSRF via <image href="...">)
    .replace(/(?:href|src|xlink:href)\s*=\s*["']https?:\/\/[^"']*["']/gi, '')
    // Remove <foreignObject> (HTML injection)
    .replace(/<foreignObject[\s\S]*?<\/foreignObject>/gi, '')
    // Remove <use> with external fragment references
    .replace(/<use[^>]+xlink:href\s*=\s*["'][^#][^"']*["'][^>]*\/?>/gi, '');
}

/**
 * Generate an SVG diagram for a thesis subsection using a text LLM.
 * Returns GeneratedImage or null (non-fatal on failure).
 */
export async function generateSubsectionImage(
  thesisTitle: string,
  sectionLabel: string,
  subTitle: string,
  content: string,
): Promise<GeneratedImage | null> {
  try {
    const res = await callAI('image', MODELS.FAST,
      `You are an academic figure designer. Your job is to decide IF a diagram is needed, and only then generate one.

DECISION RULES — be very selective:
SKIP (return "SKIP") for subsections that are:
- Introductions, overviews, summaries, or conclusions
- Definitions or explanations of terminology
- Historical background or literature reviews
- Limitations, future work, or ethical discussions
- Recommendations or policy suggestions
- Any content that is primarily narrative or argumentative text
- Abstract, acknowledgments, references

ONLY generate a diagram when the content CLEARLY describes:
- A multi-step process or workflow (→ FLOWCHART)
- A system with distinct components/layers (→ ARCHITECTURE)
- Two or more things being explicitly compared (→ COMPARISON)
- A hierarchical/tree relationship (→ HIERARCHY)
- Numeric data or statistics being compared (→ BAR CHART)

If in doubt, return SKIP. Fewer high-quality diagrams are better than many unnecessary ones.

OUTPUT RULES (only if NOT skipping):
1. Output ONLY valid SVG code. No markdown fences, no explanation.
2. Start with: <svg viewBox="0 0 800 500" xmlns="http://www.w3.org/2000/svg">
3. First element must be: <rect width="800" height="500" fill="white"/>
4. Use ONLY static SVG — no <script>, no on* attributes, no external URLs.

STYLE:
- Boxes: <rect rx="8" fill="COLOR" stroke="none"/>
- Colors: #1E3A5F (navy), #3B82F6 (blue), #10B981 (green), #F59E0B (amber), #EF4444 (red), #8B5CF6 (purple)
- Text: font-family="Arial, sans-serif" font-size="14" fill="white" (on dark) or fill="#333" (on light)
- Arrows: <line stroke="#666" stroke-width="2"/> or <path stroke="#666" stroke-width="2" fill="none"/>
- Keep it clean and professional

After </svg>, write on new line: CAPTION: [academic figure caption]`,
      `Thesis: "${thesisTitle}"
Section: "${sectionLabel}"  
Subsection: "${subTitle}"
Content: ${content.slice(0, 600)}

SVG:`,
      logger
    );

    const text = res.content.trim();
    if (text === 'SKIP' || (!text.includes('<svg') && text.includes('SKIP'))) return null;

    // Extract SVG
    const svgMatch = text.match(/<svg[\s\S]*?<\/svg>/i);
    if (!svgMatch) return null;

    let svg = svgMatch[0];

    // Ensure viewBox and xmlns
    if (!svg.includes('viewBox')) {
      svg = svg.replace('<svg', '<svg viewBox="0 0 800 500"');
    }
    if (!svg.includes('xmlns')) {
      svg = svg.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
    }

    // Sanitize before storage — removes scripts, event handlers, external refs
    svg = sanitizeSvg(svg);

    // Final validation — must still look like an SVG after sanitization
    if (!svg.includes('<svg') || !svg.includes('</svg>')) {
      logger.warn(`SVG failed post-sanitization validation for "${subTitle}" — skipping`);
      return null;
    }

    // Extract caption
    const captionMatch = text.match(/CAPTION:\s*(.+)/i);
    const caption = captionMatch ? captionMatch[1].trim().slice(0, 200) : `Figure: ${subTitle}`;

    const base64 = Buffer.from(svg, 'utf-8').toString('base64');

    logger.info(`🎨 Diagram ready: "${caption}" (${Math.round(svg.length / 1024)}KB SVG)`);

    return { base64, prompt: `Diagram for: ${subTitle}`, caption, isSvg: true };
  } catch {
    logger.warn(`Diagram generation failed for "${subTitle}" — skipping`);
    return null;
  }
}

/**
 * Convert SVG base64 to PNG buffer using sharp (if available).
 * Falls back to returning null if sharp is not installed.
 */
export async function svgToPng(svgBase64: string): Promise<Buffer | null> {
  try {
    const sharp = (await import('sharp')).default;
    const svgBuf = Buffer.from(svgBase64, 'base64');
    return await sharp(svgBuf).resize(800, 500).png().toBuffer();
  } catch {
    return null;
  }
}
