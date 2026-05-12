import ToolPage, { type ProcessResult } from '../ToolPage';

// Character replacements for WinAnsi compatibility (use Unicode escapes to avoid parse issues)
const CHAR_REPLACEMENTS: Record<string, string> = {
  '\u2192': '->',      // →
  '\u2190': '<-',      // ←
  '\u2191': '↑',       // ↑
  '\u2193': '↓',       // ↓
  '\u2022': '*',       // •
  '\u2013': '-',       // –
  '\u2014': '-',       // —
  '\u201C': '"',      // “
  '\u201D': '"',      // ”
  '\u2018': "'",      // ‘
  '\u2019': "'",      // ’
  '\u2026': '...',     // …
  '\u20AC': 'EUR',     // €
  '\u00A9': '(c)',     // ©
  '\u00AE': '(R)',     // ®
  '\u2122': '(TM)',    // ™
  '\u00A7': 'S',       // §
  '\u00B6': 'P',       // ¶
  '\u2020': '+',       // †
  '\u2021': '++',      // ‡
  '\u00B0': '*',       // °
  '\u00F7': '/',       // ÷
  '\u00D7': '*',       // ×
  '\u00B1': '+/-',     // ±
  '\u2260': '!=',      // ≠
  '\u2264': '<=',      // ≤
  '\u2265': '>=',      // ≥
  '\u2248': '~=',      // ≈
  '\u221E': 'inf',     // ∞
  '\u221A': 'sqrt',    // √
  '\u2211': 'sum',     // ∑
  '\u00E9': 'e',       // é
  '\u00E8': 'e',       // è
  '\u00EA': 'e',       // ê
  '\u00EB': 'e',       // ë
  '\u00E1': 'a',       // á
  '\u00E0': 'a',       // à
  '\u00E2': 'a',       // â
  '\u00E4': 'a',       // ä
  '\u00E3': 'a',       // ã
  '\u00E5': 'a',       // å
  '\u00F3': 'o',       // ó
  '\u00F2': 'o',       // ò
  '\u00F4': 'o',       // ô
  '\u00F6': 'o',       // ö
  '\u00F5': 'o',       // õ
  '\u00FA': 'u',       // ú
  '\u00F9': 'u',       // ù
  '\u00FB': 'u',       // û
  '\u00FC': 'u',       // ü
  '\u00ED': 'i',       // í
  '\u00EC': 'i',       // ì
  '\u00EE': 'i',       // î
  '\u00EF': 'i',       // ï
  '\u00E7': 'c',       // ç
  '\u00F1': 'n',       // ñ
};

// Sanitize text to only include WinAnsi-compatible characters
function sanitizeText(text: string): string {
  let result = text;
  
  // Replace known special characters
  for (const [char, replacement] of Object.entries(CHAR_REPLACEMENTS)) {
    result = result.split(char).join(replacement);
  }
  
  // Replace any remaining non-ASCII characters with a placeholder
  result = result.replace(/[^\x20-\x7E\n\r\t]/g, '?');
  
  return result;
}

// Extract text from DOCX file
async function extractDocxText(file: File): Promise<string> {
  try {
    const JSZip = await import('jszip');
    const zip = new JSZip.default();
    const contents = await zip.loadAsync(file);

    // Read document.xml from DOCX
    const docXml = await contents.file('word/document.xml')?.async('text');
    if (!docXml) {
      return `[Unable to extract text from ${file.name}]`;
    }

    // Parse XML and extract text from paragraphs and runs
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(docXml, 'application/xml');

    // Extract all text nodes from paragraphs (w:p elements)
    const paragraphs: string[] = [];

    xmlDoc.querySelectorAll('w\\:p, p').forEach((paragraph) => {
      const textInPara = Array.from(paragraph.querySelectorAll('w\\:t, t'))
        .map((node) => node.textContent || '')
        .join('');
      if (textInPara.trim()) {
        paragraphs.push(textInPara);
      }
    });

    return paragraphs.length > 0 ? paragraphs.join('\n') : `[${file.name} appears to be empty]`;
  } catch {
    return `[Could not parse DOCX file: ${file.name}]`;
  }
}

// Extract text from images (basic support - filename as caption)
async function extractImageText(file: File): Promise<string> {
  return `[Image file: ${file.name}]`;
}

// Parse and extract text based on file type
async function extractFileContent(file: File): Promise<string> {
  const ext = file.name.split('.').pop()?.toLowerCase();

  if (ext === 'docx') {
    return extractDocxText(file);
  } else if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext || '')) {
    return extractImageText(file);
  } else {
    // For unsupported formats, show file info
    return `File: ${file.name}\nType: ${file.type || 'Unknown'}\nSize: ${(file.size / 1024).toFixed(1)} KB`;
  }
}

// Word wrap text to fit in PDF
function wrapText(text: string, maxWidth: number, fontSize: number = 11): string[] {
  const lines: string[] = [];
  const textLines = text.split('\n');

  for (const line of textLines) {
    if (line.length === 0) {
      lines.push('');
      continue;
    }

    // Estimate chars per line (rough: ~80-90 chars per 595px at 11pt)
    const charsPerLine = Math.floor(maxWidth / (fontSize * 0.5));
    let currentLine = '';

    for (const char of line) {
      if ((currentLine + char).length > charsPerLine) {
        if (currentLine) lines.push(currentLine);
        currentLine = char;
      } else {
        currentLine += char;
      }
    }
    if (currentLine) lines.push(currentLine);
  }

  return lines;
}

async function processor(files: File[]): Promise<ProcessResult> {
  const file = files[0];
  const { PDFDocument, rgb } = await import('pdf-lib');

  const pdfDoc = await PDFDocument.create();
  const pageWidth = 595.28; // A4
  const pageHeight = 841.89;
  const margin = 50;
  const maxWidth = pageWidth - margin * 2;

  // Extract content from file
  let content = await extractFileContent(file);
  
  // Sanitize content to remove non-WinAnsi characters
  content = sanitizeText(content);

  // Create pages and add content
  const font = await pdfDoc.embedFont('Helvetica');
  const boldFont = await pdfDoc.embedFont('Helvetica');
  const fontSize = 11;
  const lineHeight = fontSize * 1.5;

  let currentPage = pdfDoc.addPage([pageWidth, pageHeight]);
  let yPosition = pageHeight - margin;

  // Add title with filename
  currentPage.drawText(sanitizeText(file.name), {
    x: margin,
    y: yPosition,
    size: 14,
    font: boldFont,
    color: rgb(0, 0, 0),
  });
  yPosition -= lineHeight * 1.5;

  // Wrap and add content text
  const wrappedLines = wrapText(content, maxWidth, fontSize);

  for (const line of wrappedLines) {
    // Check if we need a new page
    if (yPosition - lineHeight < margin) {
      currentPage = pdfDoc.addPage([pageWidth, pageHeight]);
      yPosition = pageHeight - margin;
    }

    currentPage.drawText(line, {
      x: margin,
      y: yPosition,
      size: fontSize,
      font,
      color: rgb(0.1, 0.1, 0.1),
    });
    yPosition -= lineHeight;
  }

  // Add footer with conversion info
  const pages = pdfDoc.getPages();
  pages.forEach((page, index) => {
    page.drawText(sanitizeText(`Converted from: ${file.name} | Page ${index + 1} of ${pages.length}`), {
      x: margin,
      y: margin - 20,
      size: 8,
      font,
      color: rgb(0.6, 0.6, 0.6),
    });
  });

  const bytes = await pdfDoc.save();
  const blob = new Blob([new Uint8Array(bytes)], { type: 'application/pdf' });

  return {
    singleBlob: {
      blob,
      name: file.name.replace(/\.[^.]+$/, '.pdf'),
    },
    info: {
      source_file: file.name,
      source_size: (file.size / 1024).toFixed(1) + ' KB',
      pages: pdfDoc.getPageCount(),
    },
  };
}

export default function ConvertToPdf() {
  return <ToolPage processor={processor} />;
}
