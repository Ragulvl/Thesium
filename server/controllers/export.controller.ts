// Export controller — professional academic formatting for PDF and DOCX.
import { Response } from 'express';
import { svgToPng } from '../services/imageGenerator.js';
import { prisma } from '../config/prisma.js';
import { AuthenticatedRequest } from '../middleware/auth.js';
import {
  Document, Packer, Paragraph, TextRun, HeadingLevel,
  Header, Footer, PageNumber, ImageRun,
  Table, TableRow, TableCell, WidthType, BorderStyle,
  AlignmentType, ShadingType
} from 'docx';
// @ts-expect-error — pdfkit uses CJS export
import PDFDocument from 'pdfkit';
import { exportQuerySchema } from '../validators/thesis.js';

// ── Markdown → Styled Text Runs ──────────────────────────────────────
function parseInlineMarkdown(text: string, baseFont = "Times New Roman", baseSize = 24): TextRun[] {
  const runs: TextRun[] = [];
  // Match **bold**, *italic*, ***bold-italic***
  const regex = /(\*\*\*(.+?)\*\*\*|\*\*(.+?)\*\*|\*(.+?)\*)/g;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    // Text before match
    if (match.index > lastIndex) {
      runs.push(new TextRun({ text: text.slice(lastIndex, match.index), font: baseFont, size: baseSize }));
    }
    if (match[2]) {
      // ***bold-italic***
      runs.push(new TextRun({ text: match[2], bold: true, italics: true, font: baseFont, size: baseSize }));
    } else if (match[3]) {
      // **bold**
      runs.push(new TextRun({ text: match[3], bold: true, font: baseFont, size: baseSize }));
    } else if (match[4]) {
      // *italic*
      runs.push(new TextRun({ text: match[4], italics: true, font: baseFont, size: baseSize }));
    }
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    runs.push(new TextRun({ text: text.slice(lastIndex), font: baseFont, size: baseSize }));
  }

  return runs.length > 0 ? runs : [new TextRun({ text, font: baseFont, size: baseSize })];
}

// ── Markdown Table → DOCX Table ──────────────────────────────────────
function parseMarkdownTable(lines: string[]): Table | null {
  if (lines.length < 2) return null;

  const parseRow = (line: string) =>
    line.split('|').map(cell => cell.trim()).filter(cell => cell.length > 0);

  const headerCells = parseRow(lines[0]);
  if (headerCells.length === 0) return null;

  // Skip separator line (line with dashes)
  const dataStartIdx = lines[1].includes('---') ? 2 : 1;
  const dataRows = lines.slice(dataStartIdx).map(parseRow);

  const tableRows: TableRow[] = [];

  // Header row — bold with shaded background
  tableRows.push(new TableRow({
    children: headerCells.map(cell => new TableCell({
      children: [new Paragraph({
        children: [new TextRun({ text: cell, bold: true, font: "Times New Roman", size: 22 })],
        spacing: { before: 60, after: 60 },
      })],
      shading: { type: ShadingType.SOLID, color: "E8EDF2" },
      width: { size: Math.floor(9000 / headerCells.length), type: WidthType.DXA },
    }))
  }));

  // Data rows
  for (const row of dataRows) {
    if (row.length === 0) continue;
    tableRows.push(new TableRow({
      children: headerCells.map((_, i) => new TableCell({
        children: [new Paragraph({
          children: parseInlineMarkdown(row[i] || '', "Times New Roman", 22),
          spacing: { before: 40, after: 40 },
        })],
        width: { size: Math.floor(9000 / headerCells.length), type: WidthType.DXA },
      }))
    }));
  }

  return new Table({
    rows: tableRows,
    width: { size: 9000, type: WidthType.DXA },
    borders: {
      top: { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" },
      bottom: { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" },
      left: { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" },
      right: { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" },
      insideHorizontal: { style: BorderStyle.SINGLE, size: 1, color: "DDDDDD" },
      insideVertical: { style: BorderStyle.SINGLE, size: 1, color: "DDDDDD" },
    },
  });
}

// ── Main Export Handler ──────────────────────────────────────────────
export const exportThesis = async (req: AuthenticatedRequest, res: Response): Promise<any> => {
  try {
    const { id } = req.params;
    const query = exportQuerySchema.parse(req.query);
    const format = query.format;

    const thesis: any = await prisma.thesis.findUnique({
      where: { id: id as string },
      include: { sections: { orderBy: { order: 'asc' } }, user: true }
    });

    if (!thesis) return res.status(404).json({ error: "Thesis not found" });
    if (thesis.userId !== req.user!.id) return res.status(403).json({ error: "Forbidden" });

    if (format === 'docx') {
      return exportDocx(thesis, req, res);
    } else if (format === 'pdf') {
      return exportPdf(thesis, req, res);
    } else {
      return res.status(400).json({ error: "Invalid format requested." });
    }
  } catch (error: any) {
    if (error.name === 'ZodError') throw error;
    res.status(500).json({ error: "Internal server error" });
  }
};

// ══════════════════════════════════════════════════════════════════════
// DOCX EXPORT
// ══════════════════════════════════════════════════════════════════════
async function exportDocx(thesis: any, req: AuthenticatedRequest, res: Response) {
  const children: any[] = [];

  // ── Title Page ──
  for (let i = 0; i < 3; i++) {
    children.push(new Paragraph({ text: '', spacing: { after: 200 } }));
  }

  children.push(new Paragraph({
    children: [new TextRun({ text: thesis.title, font: "Times New Roman", size: 56, bold: true })],
    alignment: AlignmentType.CENTER,
    spacing: { after: 400 }
  }));

  children.push(new Paragraph({
    children: [new TextRun({ text: '━'.repeat(40), font: "Times New Roman", size: 24, color: "3B82F6" })],
    alignment: AlignmentType.CENTER,
    spacing: { after: 400 }
  }));

  children.push(new Paragraph({
    children: [new TextRun({ text: `Prepared by: ${thesis.user?.name || 'Student'}`, font: "Times New Roman", size: 28 })],
    alignment: AlignmentType.CENTER,
    spacing: { after: 120 }
  }));

  children.push(new Paragraph({
    children: [new TextRun({ text: `Field of Study: ${thesis.field}`, font: "Times New Roman", size: 24, color: "666666" })],
    alignment: AlignmentType.CENTER,
    spacing: { after: 120 }
  }));

  children.push(new Paragraph({
    children: [new TextRun({ text: `Date: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`, font: "Times New Roman", size: 24, color: "666666" })],
    alignment: AlignmentType.CENTER,
    spacing: { after: 200 }
  }));

  // ── Sections (skip empty ones) ──
  for (const section of thesis.sections) {
    // Skip sections with no content — prevents blank pages
    if (!section.content || section.content.trim().length === 0) continue;
    // Section heading with decorative line — no page breaks
    children.push(new Paragraph({
      children: [new TextRun({ text: section.label.toUpperCase(), font: "Times New Roman", size: 30, bold: true, color: "1E3A5F" })],
      heading: HeadingLevel.HEADING_1,
      spacing: { before: 300, after: 40 },
    }));

    // Decorative separator under section heading
    children.push(new Paragraph({
      children: [new TextRun({ text: '─'.repeat(60), font: "Times New Roman", size: 14, color: "3B82F6" })],
      spacing: { after: 100 }
    }));


    // Get images from pipeline metadata
    const images: any[] = (section as any).pipelineMetadata?.subsectionImages || [];
    let subIdx = -1; // track current subsection index

    const lines = section.content.split('\n');
    let i = 0;

    while (i < lines.length) {
      const line = lines[i].trimEnd();

      // Skip empty lines
      if (!line.trim()) { i++; continue; }

      // Detect markdown table (starts with |)
      if (line.trim().startsWith('|')) {
        const tableLines: string[] = [];
        while (i < lines.length && lines[i].trim().startsWith('|')) {
          tableLines.push(lines[i].trim());
          i++;
        }
        const table = parseMarkdownTable(tableLines);
        if (table) {
          children.push(new Paragraph({ spacing: { before: 120 } })); // space before table
          children.push(table);
          children.push(new Paragraph({ spacing: { after: 120 } })); // space after table
        }
        continue;
      }

      // Bullet list items
      if (line.trim().startsWith('- ') || line.trim().startsWith('• ')) {
        const text = line.trim().replace(/^[-•]\s+/, '');
        children.push(new Paragraph({
          children: [
            new TextRun({ text: '  •  ', font: "Times New Roman", size: 24, bold: true, color: "3B82F6" }),
            ...parseInlineMarkdown(text)
          ],
          spacing: { before: 40, after: 40 },
          indent: { left: 480 }
        }));
        i++; continue;
      }

      // Numbered list items
      const numberedMatch = line.trim().match(/^(\d+)\.\s+(.+)/);
      if (numberedMatch) {
        children.push(new Paragraph({
          children: [
            new TextRun({ text: `${numberedMatch[1]}.  `, font: "Times New Roman", size: 24, bold: true, color: "3B82F6" }),
            ...parseInlineMarkdown(numberedMatch[2])
          ],
          spacing: { before: 40, after: 40 },
          indent: { left: 480 }
        }));
        i++; continue;
      }

      // Heading 3 (###)
      if (line.startsWith('### ')) {
        // Before starting next subsection, insert image for PREVIOUS subsection
        if (subIdx >= 0 && images[subIdx]?.base64) {
          try {
            const imgData = images[subIdx];
            let imgBuf: Buffer | null = null;
            if (imgData.isSvg) {
              imgBuf = await svgToPng(imgData.base64);
            } else {
              imgBuf = Buffer.from(imgData.base64, 'base64');
            }
            if (imgBuf) {
            children.push(new Paragraph({
              children: [new ImageRun({ data: imgBuf, transformation: { width: 500, height: 312 }, type: 'png' })],
              alignment: AlignmentType.CENTER,
            }));
            children.push(new Paragraph({
              children: [new TextRun({ text: imgData.caption || `Figure ${subIdx + 1}`, font: "Times New Roman", size: 20, italics: true, color: "666666" })],
              alignment: AlignmentType.CENTER,
              spacing: { after: 120 }
            }));
            }
          } catch { /* skip broken image */ }
        }
        subIdx++;

        children.push(new Paragraph({
          children: [new TextRun({ text: line.replace('### ', ''), font: "Times New Roman", size: 26, bold: true, color: "2D4A6F" })],
          heading: HeadingLevel.HEADING_3,
          spacing: { before: 140, after: 40 }
        }));
        i++; continue;
      }

      // Heading 2 (##)
      if (line.startsWith('## ')) {
        children.push(new Paragraph({
          children: [new TextRun({ text: line.replace('## ', ''), font: "Times New Roman", size: 28, bold: true, color: "1E3A5F" })],
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 160, after: 50 }
        }));
        i++; continue;
      }

      // Heading 1 (#)
      if (line.startsWith('# ')) {
        children.push(new Paragraph({
          children: [new TextRun({ text: line.replace('# ', ''), font: "Times New Roman", size: 32, bold: true, color: "1E3A5F" })],
          heading: HeadingLevel.HEADING_1,
          spacing: { before: 200, after: 60 }
        }));
        i++; continue;
      }

      // Regular paragraph with inline markdown support
      children.push(new Paragraph({
        children: parseInlineMarkdown(line.trim()),
        spacing: { line: 340, before: 30, after: 30 },
      }));
      i++;
    }

    // Insert image for the LAST subsection of this section
    if (subIdx >= 0 && images[subIdx]?.base64) {
      try {
      const lastImgData = images[subIdx];
      let lastImgBuf: Buffer | null = null;
      if (lastImgData.isSvg) {
        lastImgBuf = await svgToPng(lastImgData.base64);
      } else {
        lastImgBuf = Buffer.from(lastImgData.base64, 'base64');
      }
      if (lastImgBuf) {
        children.push(new Paragraph({
          children: [new ImageRun({ data: lastImgBuf, transformation: { width: 500, height: 312 }, type: 'png' })],
          alignment: AlignmentType.CENTER,
        }));
        children.push(new Paragraph({
          children: [new TextRun({ text: lastImgData.caption || `Figure ${subIdx + 1}`, font: "Times New Roman", size: 20, italics: true, color: "666666" })],
          alignment: AlignmentType.CENTER,
          spacing: { after: 120 }
        }));
      }
      } catch { /* skip broken image */ }
    }
  }

  const doc = new Document({
    styles: {
      default: {
        document: { run: { font: "Times New Roman", size: 24 } },
        heading1: { run: { font: "Times New Roman", size: 30, bold: true, color: "1E3A5F" }, paragraph: { spacing: { before: 300, after: 100 } } },
        heading2: { run: { font: "Times New Roman", size: 26, bold: true, color: "1E3A5F" }, paragraph: { spacing: { before: 160, after: 50 } } },
        heading3: { run: { font: "Times New Roman", size: 24, bold: true, color: "2D4A6F" }, paragraph: { spacing: { before: 140, after: 40 } } },
        title:    { run: { font: "Times New Roman", size: 48, bold: true } }
      }
    },
    sections: [{
      properties: {
        page: { margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } }
      },
      headers: {
        default: new Header({
          children: [new Paragraph({
            children: [
              new TextRun({ text: thesis.title, font: "Times New Roman", size: 18, color: "999999", italics: true }),
            ],
            alignment: AlignmentType.RIGHT
          })]
        })
      },
      footers: {
        default: new Footer({
          children: [new Paragraph({
            children: [
              new TextRun({ text: '── ', font: "Times New Roman", size: 18, color: "CCCCCC" }),
              new TextRun({ children: [PageNumber.CURRENT], font: "Times New Roman", size: 20 }),
              new TextRun({ text: ' ──', font: "Times New Roman", size: 18, color: "CCCCCC" }),
            ],
            alignment: AlignmentType.CENTER
          })]
        })
      },
      children
    }]
  });

  const buffer = await Packer.toBuffer(doc);
  res.setHeader('Content-Disposition', `attachment; filename="${thesis.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.docx"`);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  return res.send(buffer);
}

// ══════════════════════════════════════════════════════════════════════
// PDF EXPORT
// ══════════════════════════════════════════════════════════════════════
async function exportPdf(thesis: any, req: AuthenticatedRequest, res: Response) {
  const doc = new PDFDocument({
    margin: 72, // 1 inch margins
    size: 'A4',
    info: {
      Title: thesis.title,
      Author: thesis.user?.name || 'Student',
    }
  });

  res.setHeader('Content-Disposition', `attachment; filename="${thesis.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.pdf"`);
  res.setHeader('Content-Type', 'application/pdf');
  doc.pipe(res);

  const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const accentColor = '#1E3A5F';
  const lightAccent = '#3B82F6';

  // ── Title Page ──
  doc.moveDown(3);
  doc.font('Helvetica-Bold').fontSize(28).fillColor(accentColor).text(thesis.title, { align: 'center' });
  doc.moveDown(0.5);

  // Decorative line
  const lineY = doc.y;
  doc.moveTo(doc.page.margins.left + 100, lineY).lineTo(doc.page.width - doc.page.margins.right - 100, lineY)
    .strokeColor(lightAccent).lineWidth(2).stroke();
  doc.moveDown(1);

  doc.font('Helvetica').fontSize(14).fillColor('#444444').text(`Prepared by: ${thesis.user?.name || 'Student'}`, { align: 'center' });
  doc.moveDown(0.3);
  doc.fontSize(12).fillColor('#888888').text(`Field of Study: ${thesis.field}`, { align: 'center' });
  doc.moveDown(0.3);
  doc.text(`Date: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`, { align: 'center' });

  // ── Sections (skip empty ones) ──
  for (const section of thesis.sections) {
    // Skip sections with no content — prevents blank pages
    if (!section.content || section.content.trim().length === 0) continue;

    // Just add spacing between sections — no page break
    doc.moveDown(1.2);

    // Auto page break if near bottom
    if (doc.y > doc.page.height - doc.page.margins.bottom - 120) {
      doc.addPage();
    }

    // Section heading — bold with accent line underneath
    doc.font('Helvetica-Bold').fontSize(18).fillColor(accentColor).text(section.label.toUpperCase());
    const headingY = doc.y + 2;
    doc.moveTo(doc.page.margins.left, headingY).lineTo(doc.page.margins.left + pageWidth, headingY)
      .strokeColor(lightAccent).lineWidth(1).stroke();
    doc.moveDown(0.4);

    // Get images from pipeline metadata
    const pdfImages: any[] = (section as any).pipelineMetadata?.subsectionImages || [];
    let pdfSubIdx = -1;

    const lines = section.content.split('\n');
    let i = 0;

    while (i < lines.length) {
      const line = lines[i].trimEnd();
      if (!line.trim()) { i++; continue; }

      // Check if we need a new page (leave at least 80pt at bottom)
      if (doc.y > doc.page.height - doc.page.margins.bottom - 80) {
        doc.addPage();
      }

      // Markdown table
      if (line.trim().startsWith('|')) {
        const tableLines: string[] = [];
        while (i < lines.length && lines[i].trim().startsWith('|')) {
          tableLines.push(lines[i].trim());
          i++;
        }
        renderPdfTable(doc, tableLines, pageWidth, accentColor);
        doc.moveDown(0.5);
        continue;
      }

      // Bullet list
      if (line.trim().startsWith('- ') || line.trim().startsWith('• ')) {
        const text = line.trim().replace(/^[-•]\s+/, '');
        doc.font('Helvetica').fontSize(11).fillColor(lightAccent).text('  •  ', { continued: true });
        doc.fillColor('#333333').text(stripMarkdown(text), { lineGap: 3 });
        doc.moveDown(0.15);
        i++; continue;
      }

      // Numbered list
      const numMatch = line.trim().match(/^(\d+)\.\s+(.+)/);
      if (numMatch) {
        doc.font('Helvetica-Bold').fontSize(11).fillColor(lightAccent).text(`  ${numMatch[1]}.  `, { continued: true });
        doc.font('Helvetica').fillColor('#333333').text(stripMarkdown(numMatch[2]), { lineGap: 3 });
        doc.moveDown(0.15);
        i++; continue;
      }

      // ### Heading 3
      if (line.startsWith('### ')) {
        // Insert image for PREVIOUS subsection before starting next
        if (pdfSubIdx >= 0 && pdfImages[pdfSubIdx]?.base64) {
          try {
            const pdfImgData = pdfImages[pdfSubIdx];
            let pdfImgBuf: Buffer | null = null;
            if (pdfImgData.isSvg) {
              pdfImgBuf = await svgToPng(pdfImgData.base64);
            } else {
              pdfImgBuf = Buffer.from(pdfImgData.base64, 'base64');
            }
            if (pdfImgBuf) {
              if (doc.y > doc.page.height - doc.page.margins.bottom - 350) doc.addPage();
              doc.moveDown(0.3);
              doc.image(pdfImgBuf, { fit: [pageWidth * 0.85, 280], align: 'center' });
              doc.moveDown(0.3);
              doc.font('Helvetica-Oblique').fontSize(9).fillColor('#666666')
                .text(pdfImgData.caption || `Figure ${pdfSubIdx + 1}`, { align: 'center' });
              doc.moveDown(0.5);
            }
          } catch { /* skip broken image */ }
        }
        pdfSubIdx++;

        doc.moveDown(0.4);
        doc.font('Helvetica-Bold').fontSize(13).fillColor('#2D4A6F').text(line.replace('### ', ''));
        doc.moveDown(0.2);
        i++; continue;
      }

      // ## Heading 2
      if (line.startsWith('## ')) {
        doc.moveDown(0.5);
        doc.font('Helvetica-Bold').fontSize(15).fillColor(accentColor).text(line.replace('## ', ''));
        doc.moveDown(0.3);
        i++; continue;
      }

      // # Heading 1
      if (line.startsWith('# ')) {
        doc.moveDown(0.6);
        doc.font('Helvetica-Bold').fontSize(18).fillColor(accentColor).text(line.replace('# ', ''));
        doc.moveDown(0.4);
        i++; continue;
      }

      // Regular paragraph
      doc.font('Helvetica').fontSize(11).fillColor('#333333').text(stripMarkdown(line.trim()), {
        lineGap: 4,
        align: 'justify'
      });
      doc.moveDown(0.25);
      i++;
    }

    // Insert image for LAST subsection
    if (pdfSubIdx >= 0 && pdfImages[pdfSubIdx]?.base64) {
      try {
        const lastPdfImgData = pdfImages[pdfSubIdx];
        let lastPdfImgBuf: Buffer | null = null;
        if (lastPdfImgData.isSvg) {
          lastPdfImgBuf = await svgToPng(lastPdfImgData.base64);
        } else {
          lastPdfImgBuf = Buffer.from(lastPdfImgData.base64, 'base64');
        }
        if (lastPdfImgBuf) {
          if (doc.y > doc.page.height - doc.page.margins.bottom - 350) doc.addPage();
          doc.moveDown(0.3);
          doc.image(lastPdfImgBuf, { fit: [pageWidth * 0.85, 280], align: 'center' });
          doc.moveDown(0.3);
          doc.font('Helvetica-Oblique').fontSize(9).fillColor('#666666')
            .text(lastPdfImgData.caption || `Figure ${pdfSubIdx + 1}`, { align: 'center' });
          doc.moveDown(0.5);
        }
      } catch { /* skip broken image */ }
    }
  }

  doc.end();
}

// ── PDF Table Renderer ───────────────────────────────────────────────
function renderPdfTable(doc: any, lines: string[], pageWidth: number, accentColor: string) {
  const parseRow = (line: string) =>
    line.split('|').map(cell => cell.trim()).filter(cell => cell.length > 0);

  const headers = parseRow(lines[0]);
  const dataStart = lines[1]?.includes('---') ? 2 : 1;
  const rows = lines.slice(dataStart).map(parseRow);

  if (headers.length === 0) return;

  const colWidth = pageWidth / headers.length;
  const cellPadding = 6;
  const rowHeight = 24;
  const startX = doc.page.margins.left;
  let y = doc.y + 4;

  // Header row — filled background
  doc.rect(startX, y, pageWidth, rowHeight).fillAndStroke('#E8EDF2', '#CCCCCC');
  headers.forEach((h, i) => {
    doc.font('Helvetica-Bold').fontSize(10).fillColor(accentColor)
      .text(h, startX + i * colWidth + cellPadding, y + 6, { width: colWidth - cellPadding * 2 });
  });
  y += rowHeight;

  // Data rows
  for (const row of rows) {
    if (row.length === 0) continue;
    doc.rect(startX, y, pageWidth, rowHeight).stroke('#DDDDDD');
    headers.forEach((_, i) => {
      doc.font('Helvetica').fontSize(10).fillColor('#333333')
        .text(stripMarkdown(row[i] || ''), startX + i * colWidth + cellPadding, y + 6, { width: colWidth - cellPadding * 2 });
    });
    y += rowHeight;
  }

  doc.y = y + 8;
}

// ── Strip markdown formatting for plain text ─────────────────────────
function stripMarkdown(text: string): string {
  return text
    .replace(/\*\*\*(.+?)\*\*\*/g, '$1')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/`(.+?)`/g, '$1');
}
