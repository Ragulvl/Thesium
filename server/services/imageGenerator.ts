// Image generation service — uses LLM to generate SVG diagrams for thesis figures.
// No external API needed — the LLM creates SVG code, stored as base64 SVG.
// Export controller handles rendering SVG in PDF (via PDFKit) and DOCX (via sharp if available).
import { callModelWithRetry } from './openRouter.js';
import { MODELS } from '../config/models.js';
import { logger } from '../config/logger.js';

export interface GeneratedImage {
  base64: string;       // base64-encoded SVG
  prompt: string;       // the prompt used
  caption: string;      // short caption for the image
  isSvg: true;          // flag for export to handle correctly
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
    const res = await callModelWithRetry(MODELS.FAST,
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

    // Extract caption
    const captionMatch = text.match(/CAPTION:\s*(.+)/i);
    const caption = captionMatch ? captionMatch[1].trim() : `Figure: ${subTitle}`;

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
