import fs from 'fs';
import path from 'path';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

const ROOT = process.cwd();
const sourcePath = path.join(ROOT, 'docs', 'NOTICE_UTILISATION_COMPLETE.md');
const outPath = path.join(ROOT, 'public', 'docs', 'notice-utilisation-control-center.pdf');

function wrapText(text, maxChars) {
  const lines = [];
  for (const rawLine of text.split('\n')) {
    if (!rawLine.trim()) {
      lines.push('');
      continue;
    }

    const words = rawLine.split(/\s+/);
    let current = '';

    for (const word of words) {
      if ((current + ' ' + word).trim().length > maxChars) {
        lines.push(current.trim());
        current = word;
      } else {
        current = `${current} ${word}`;
      }
    }

    if (current.trim()) {
      lines.push(current.trim());
    }
  }
  return lines;
}

async function generate() {
  const source = fs.readFileSync(sourcePath, 'utf8');
  const text = source
    .replace(/^#\s+/gm, '')
    .replace(/^##\s+/gm, '')
    .replace(/^###\s+/gm, '')
    .replace(/^[-*]\s+/gm, '- ')
    .replace(/`/g, '');

  const lines = wrapText(text, 95);

  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const pageWidth = 595;
  const pageHeight = 842;
  const margin = 48;
  const lineHeight = 14;

  let page = pdf.addPage([pageWidth, pageHeight]);
  let y = pageHeight - margin;

  for (const line of lines) {
    if (y < margin + lineHeight) {
      page = pdf.addPage([pageWidth, pageHeight]);
      y = pageHeight - margin;
    }

    page.drawText(line, {
      x: margin,
      y,
      size: 10.5,
      font,
      color: rgb(0.1, 0.1, 0.1),
      maxWidth: pageWidth - margin * 2,
      lineHeight,
    });

    y -= lineHeight;
  }

  const bytes = await pdf.save();
  fs.writeFileSync(outPath, bytes);
  console.log(`PDF generated: ${outPath}`);
}

generate().catch((error) => {
  console.error('PDF generation failed:', error);
  process.exit(1);
});
