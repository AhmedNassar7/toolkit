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

// Parse DOCX into structured paragraphs and runs so layout can be preserved
type Run = { text: string; bold?: boolean; italic?: boolean };
type Paragraph = { runs: Run[]; isHeading?: number; isList?: boolean; listLevel?: number; isBullet?: boolean };

async function extractDocxText(file: File): Promise<Paragraph[] | string> {
  try {
    const JSZip = await import('jszip');
    const zip = new JSZip.default();
    const contents = await zip.loadAsync(file);

    const docXml = await contents.file('word/document.xml')?.async('text');
    if (!docXml) return `[Unable to extract text from ${file.name}]`;

    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(docXml, 'application/xml');

    const paragraphs: Paragraph[] = [];

    xmlDoc.querySelectorAll('w\\:p, p').forEach((p) => {
      // Detect paragraph style (heading)
      const pStyle = p.querySelector('w\\:pPr > w\\:pStyle');
      let isHeading: number | undefined;
      if (pStyle) {
        const val = pStyle.getAttribute('w:val') || pStyle.getAttribute('val') || '';
        const m = val.match(/Heading(\\d+)/i);
        if (m) isHeading = parseInt(m[1], 10);
      }

      // Detect numbering (lists)
      const numPr = p.querySelector('w\\:numPr');
      const isList = !!numPr;

      // Aggregate runs
      const runs: Run[] = [];
      p.querySelectorAll('w\\:r, r').forEach((r) => {
        const t = r.querySelector('w\\:t, t');
        if (!t || !t.textContent) return;
        const text = t.textContent || '';
        const bold = !!r.querySelector('w\\:b, b');
        const italic = !!r.querySelector('w\\:i, i');
        runs.push({ text, bold, italic });
      });

      // If runs empty but there are text nodes directly under p (like w:t), collect them
      if (runs.length === 0) {
        const directText = Array.from(p.querySelectorAll('w\\:t, t')).map((n) => n.textContent || '').join('');
        if (directText.trim()) runs.push({ text: directText });
      }

      if (runs.length > 0) {
        paragraphs.push({ runs, isHeading, isList: isList || undefined, listLevel: isList ? 0 : undefined, isBullet: undefined });
      }
    });

    return paragraphs.length > 0 ? paragraphs : `[${file.name} appears to be empty]`;
  } catch (err) {
    return `[Could not parse DOCX file: ${file.name}]`;
  }
}

// Extract text from images (basic support - filename as caption)
async function extractImageText(file: File): Promise<string> {
  return `[Image file: ${file.name}]`;
}

// Extract slide text from a .pptx (OOXML zip of ppt/slides/slideN.xml, text in <a:t>)
async function extractPptxText(file: File): Promise<Paragraph[] | string> {
  try {
    const JSZip = await import('jszip');
    const zip = new JSZip.default();
    const contents = await zip.loadAsync(file);

    const slideFiles = Object.keys(contents.files)
      .filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
      .sort((a, b) => {
        const na = parseInt(a.match(/slide(\d+)\.xml/)?.[1] || '0', 10);
        const nb = parseInt(b.match(/slide(\d+)\.xml/)?.[1] || '0', 10);
        return na - nb;
      });

    if (slideFiles.length === 0) return `[No slides found in ${file.name}]`;

    const parser = new DOMParser();
    const paragraphs: Paragraph[] = [];

    for (let i = 0; i < slideFiles.length; i++) {
      const xml = await contents.file(slideFiles[i])?.async('text');
      if (!xml) continue;
      const xmlDoc = parser.parseFromString(xml, 'application/xml');

      paragraphs.push({ runs: [{ text: `Slide ${i + 1}` }], isHeading: 2 });

      xmlDoc.querySelectorAll('a\\:t, t').forEach((t) => {
        const text = t.textContent?.trim();
        if (text) paragraphs.push({ runs: [{ text }], isList: true });
      });
    }

    return paragraphs.length > 1 ? paragraphs : `[${file.name} contains no readable text]`;
  } catch {
    return `[Could not parse PPTX file: ${file.name}]`;
  }
}

// Extract cell data from an .xlsx (OOXML zip of xl/worksheets/sheetN.xml + xl/sharedStrings.xml)
async function extractXlsxText(file: File): Promise<Paragraph[] | string> {
  try {
    const JSZip = await import('jszip');
    const zip = new JSZip.default();
    const contents = await zip.loadAsync(file);
    const parser = new DOMParser();

    const sharedStrings: string[] = [];
    const sharedStringsXml = await contents.file('xl/sharedStrings.xml')?.async('text');
    if (sharedStringsXml) {
      const doc = parser.parseFromString(sharedStringsXml, 'application/xml');
      doc.querySelectorAll('si').forEach((si) => {
        const text = Array.from(si.querySelectorAll('t')).map((t) => t.textContent || '').join('');
        sharedStrings.push(text);
      });
    }

    const sheetFiles = Object.keys(contents.files)
      .filter((name) => /^xl\/worksheets\/sheet\d+\.xml$/.test(name))
      .sort((a, b) => {
        const na = parseInt(a.match(/sheet(\d+)\.xml/)?.[1] || '0', 10);
        const nb = parseInt(b.match(/sheet(\d+)\.xml/)?.[1] || '0', 10);
        return na - nb;
      });

    if (sheetFiles.length === 0) return `[No worksheets found in ${file.name}]`;

    const paragraphs: Paragraph[] = [];

    for (let i = 0; i < sheetFiles.length; i++) {
      const xml = await contents.file(sheetFiles[i])?.async('text');
      if (!xml) continue;
      const xmlDoc = parser.parseFromString(xml, 'application/xml');

      paragraphs.push({ runs: [{ text: `Sheet ${i + 1}` }], isHeading: 2 });

      xmlDoc.querySelectorAll('row').forEach((row) => {
        const cells: string[] = [];
        row.querySelectorAll('c').forEach((c) => {
          const type = c.getAttribute('t');
          let value = '';
          if (type === 's') {
            const idx = parseInt(c.querySelector('v')?.textContent || '-1', 10);
            value = sharedStrings[idx] ?? '';
          } else if (type === 'inlineStr') {
            value = c.querySelector('is t')?.textContent || '';
          } else {
            value = c.querySelector('v')?.textContent || '';
          }
          if (value) cells.push(value);
        });
        if (cells.length > 0) paragraphs.push({ runs: [{ text: cells.join('  |  ') }] });
      });
    }

    return paragraphs.length > 1 ? paragraphs : `[${file.name} contains no readable cell data]`;
  } catch {
    return `[Could not parse XLSX file: ${file.name}]`;
  }
}

// Extract visible text from an .html/.htm file via DOMParser
async function extractHtmlText(file: File): Promise<string> {
  try {
    const raw = await file.text();
    const doc = new DOMParser().parseFromString(raw, 'text/html');
    const blockTags = new Set([
      'P', 'DIV', 'BR', 'LI', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6',
      'TR', 'TABLE', 'SECTION', 'ARTICLE', 'HEADER', 'FOOTER', 'UL', 'OL',
    ]);

    let text = '';
    const walk = (node: Node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        text += node.textContent;
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        const el = node as Element;
        if (el.tagName === 'SCRIPT' || el.tagName === 'STYLE') return;
        node.childNodes.forEach(walk);
        if (blockTags.has(el.tagName)) text += '\n';
      }
    };
    walk(doc.body || doc.documentElement);

    const normalized = text
      .split('\n')
      .map((line) => line.replace(/[ \t]+/g, ' ').trim())
      .filter((line, i, arr) => line.length > 0 || (i > 0 && arr[i - 1].length > 0))
      .join('\n');

    return normalized.trim() || `[${file.name} contains no visible text]`;
  } catch {
    return `[Could not parse HTML file: ${file.name}]`;
  }
}

// Parse and extract text based on file type
async function extractFileContent(file: File): Promise<Paragraph[] | string> {
  const ext = file.name.split('.').pop()?.toLowerCase();

  if (ext === 'docx') {
    return extractDocxText(file);
  } else if (ext === 'pptx') {
    return extractPptxText(file);
  } else if (ext === 'xlsx') {
    return extractXlsxText(file);
  } else if (ext === 'html' || ext === 'htm') {
    return extractHtmlText(file);
  } else if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext || '')) {
    return extractImageText(file);
  } else if (['doc', 'ppt', 'xls'].includes(ext || '')) {
    return `[Legacy binary .${ext} format is not supported. Please save this file as .${ext}x (Office Open XML) and try again.]`;
  } else {
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
  const { PDFDocument, rgb } = await import('pdf-lib-with-encrypt');

  const pdfDoc = await PDFDocument.create();
  const pageWidth = 595.28; // A4
  const pageHeight = 841.89;
  const margin = 50;
  const maxWidth = pageWidth - margin * 2;

  // Extract content from file
  const content = await extractFileContent(file);

  // Create pages and add content
  const regularFont = await pdfDoc.embedFont('Helvetica');
  const boldFont = await pdfDoc.embedFont('Helvetica-Bold');
  const italicFont = await pdfDoc.embedFont('Helvetica-Oblique');
  const boldItalicFont = await pdfDoc.embedFont('Helvetica-BoldOblique');

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
  yPosition -= 20;

  // Helper: ensure there's space or add a new page
  function ensureSpace(required: number) {
    if (yPosition - required < margin) {
      currentPage = pdfDoc.addPage([pageWidth, pageHeight]);
      yPosition = pageHeight - margin;
    }
  }

  // Helper: split text to fit width using font measurements
  function splitTextToFit(text: string, fontObj: any, size: number, remainingWidth: number) {
    if (!text) return ['', ''];
    let low = 0;
    let high = text.length;
    // binary search for fitting length
    while (low < high) {
      const mid = Math.ceil((low + high) / 2);
      const substr = text.slice(0, mid);
      const w = fontObj.widthOfTextAtSize(substr, size);
      if (w <= remainingWidth) low = mid;
      else high = mid - 1;
      if (low + 1 === high) {
        const w2 = fontObj.widthOfTextAtSize(text.slice(0, high), size);
        if (w2 <= remainingWidth) low = high;
        break;
      }
    }
    if (low === 0) return [text, ''];
    return [text.slice(0, low), text.slice(low)];
  }

  // If content is plain string (non-docx), fall back to previous simple rendering
  if (typeof content === 'string') {
    const sanitized = sanitizeText(content);
    const fontSize = 11;
    const lineHeight = fontSize * 1.5;
    const lines = wrapText(sanitized, maxWidth, fontSize);
    for (const line of lines) {
      ensureSpace(lineHeight);
      currentPage.drawText(line, { x: margin, y: yPosition, size: fontSize, font: regularFont, color: rgb(0.1, 0.1, 0.1) });
      yPosition -= lineHeight;
    }
  } else {
    // content is structured paragraphs
    const paragraphs = content as Paragraph[];
    for (const para of paragraphs) {
      // Determine style
      const headingLevel = para.isHeading || 0;
      const isList = !!para.isList;
      const fontSize = headingLevel ? Math.max(18 - (headingLevel - 1) * 2, 12) : 11;
      const lineHeight = fontSize * 1.4;
      const indent = isList ? 20 : 0;

      // Build sequence of segments from runs
      const segments = para.runs.map((r) => {
        const clean = sanitizeText(r.text);
        const useFont = r.bold && r.italic ? boldItalicFont : r.bold ? boldFont : r.italic ? italicFont : regularFont;
        return { text: clean, fontObj: useFont };
      });

      // Layout segments into lines by measuring widths
      let x = margin + indent;
      let remainingWidth = maxWidth - indent;

      // If list, prefix bullet
      let prefix = '';
      if (isList) prefix = '• ';

      // Start a new line buffer
      let lineBuffer: Array<{ text: string; fontObj: any }> = [];

      // Helper to flush line buffer to page
      function flushLine() {
        if (lineBuffer.length === 0) return;
        ensureSpace(lineHeight);
        let drawX = x;
        for (const seg of lineBuffer) {
          currentPage.drawText(seg.text, { x: drawX, y: yPosition, size: fontSize, font: seg.fontObj, color: rgb(0.1, 0.1, 0.1) });
          drawX += seg.fontObj.widthOfTextAtSize(seg.text, fontSize);
        }
        yPosition -= lineHeight;
        lineBuffer = [];
      }

      // If there is a prefix, try to put it first
      if (prefix) {
        const pFont = regularFont;
        const pWidth = pFont.widthOfTextAtSize(prefix, fontSize);
        if (pWidth <= remainingWidth) {
          lineBuffer.push({ text: prefix, fontObj: pFont });
          remainingWidth -= pWidth;
        }
      }

      for (const seg of segments) {
        let text = seg.text;
        while (text.length > 0) {
          const w = seg.fontObj.widthOfTextAtSize(text, fontSize);
          const currentUsed = lineBuffer.reduce((acc, s) => acc + s.fontObj.widthOfTextAtSize(s.text, fontSize), 0);
          const avail = maxWidth - indent - currentUsed;
          if (w <= avail) {
            // fits entirely
            lineBuffer.push({ text, fontObj: seg.fontObj });
            text = '';
          } else {
            // needs split
            const [fit, rest] = splitTextToFit(text, seg.fontObj, fontSize, avail);
            if (fit.length === 0) {
              // single character doesn't fit (force on next line)
              flushLine();
              continue;
            }
            lineBuffer.push({ text: fit, fontObj: seg.fontObj });
            text = rest;
            // flush and continue building next line
            flushLine();
          }
        }
      }

      // flush remaining
      flushLine();

      // add paragraph spacing
      yPosition -= lineHeight * 0.4;
    }
  }

  // Add footer with conversion info
  const pages = pdfDoc.getPages();
  pages.forEach((page, index) => {
    page.drawText(sanitizeText(`Converted from: ${file.name} | Page ${index + 1} of ${pages.length}`), {
      x: margin,
      y: margin - 20,
      size: 8,
      font: regularFont,
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
      method: 'Local text extraction (basic fidelity)',
    },
  };
}

export default function ConvertToPdf() {
  async function wrappedProcessor(files: File[]) {
    const file = files[0];

    // DOCX prefers the server for high-fidelity conversion, but falls back to
    // local (lower-fidelity, text-only) extraction when no server is configured
    // or it's unreachable, rather than failing outright.
    if (file.name.toLowerCase().endsWith('.docx')) {
      const serverUrl = import.meta.env.VITE_CONVERT_API_URL || (import.meta.env.DEV ? 'http://localhost:3000/convert' : '');
      if (serverUrl) {
        const form = new FormData();
        form.append('file', file, file.name);
        try {
          const res = await fetch(serverUrl, { method: 'POST', body: form });
          if (!res.ok) throw new Error(await res.text());
          const blob = await res.blob();
          return {
            singleBlob: { blob, name: file.name.replace(/\.[^.]+$/, '.pdf') },
            info: { source_file: file.name, method: 'LibreOffice server (high fidelity)' },
          };
        } catch {
          // fall through to local extraction below
        }
      }
    }

    return processor(files);
  }

  return <ToolPage processor={wrappedProcessor} />;
}
