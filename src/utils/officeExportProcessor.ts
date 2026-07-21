// Client-side PDF -> Word / PowerPoint / Excel export. Runs entirely in the
// browser (pdfjs-dist for extraction, docx/pptxgenjs/exceljs for generation) -
// replaces the old Supabase Edge Function that used to do this server-side.

export interface TextItem {
  str: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PageLayout {
  items: TextItem[];
}

export async function extractPdfLayout(file: File | Blob): Promise<PageLayout[]> {
  const arrayBuffer = await file.arrayBuffer();
  const pdfjsLib = await import('pdfjs-dist');

  // Must be prefixed with the app's base path, not an absolute root path -
  // this app is deployed under /toolkit/, not domain root.
  pdfjsLib.GlobalWorkerOptions.workerSrc = `${import.meta.env.BASE_URL}pdf.worker.min.mjs`;

  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
  const pages: PageLayout[] = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    const items: TextItem[] = (textContent.items as Array<Record<string, unknown>>)
      .filter((item) => typeof item.str === 'string' && (item.str as string).trim())
      .map((item) => {
        const transform = item.transform as number[];
        return {
          str: item.str as string,
          x: transform[4],
          y: transform[5],
          width: (item.width as number) ?? 0,
          height: (item.height as number) ?? 0,
        };
      });

    pages.push({ items });
  }

  return pages;
}

// Groups items by approximate Y position into visual lines, sorted top to
// bottom then left to right within each line. Items on the same visual line
// share (near-)identical baselines, so a tight threshold tolerates
// floating-point jitter without merging distinct lines together.
export function groupLines(items: TextItem[], yThreshold = 3): { y: number; items: TextItem[] }[] {
  const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x);
  const lines: { y: number; items: TextItem[] }[] = [];

  sorted.forEach((it) => {
    const line = lines.find((l) => Math.abs(l.y - it.y) < yThreshold);
    if (line) {
      line.items.push(it);
    } else {
      lines.push({ y: it.y, items: [it] });
    }
  });

  return lines.map((l) => ({ y: l.y, items: l.items.sort((a, b) => a.x - b.x) }));
}

function paragraphsFromPage(page: PageLayout): string[] {
  // Merge wrapped continuation lines back into one flowing paragraph: a new
  // paragraph starts at a bullet, or after a real vertical gap (blank line /
  // section break); anything else is a wrapped continuation of the previous
  // line and gets joined onto it.
  const lines = groupLines(page.items);
  const paragraphTexts: string[] = [];
  let currentText = '';
  let lastY: number | null = null;

  lines.forEach((line) => {
    const lineText = line.items.map((it) => it.str).join(' ').trim();
    if (!lineText) return;

    const isBullet = lineText.startsWith('•');
    const bigGap = lastY !== null && Math.abs(lastY - line.y) > 20;

    if (lastY === null || isBullet || bigGap) {
      if (currentText) paragraphTexts.push(currentText);
      currentText = lineText;
    } else {
      currentText += ' ' + lineText;
    }
    lastY = line.y;
  });
  if (currentText) paragraphTexts.push(currentText);

  return paragraphTexts;
}

export async function buildDocxFromPdf(baseName: string, pages: PageLayout[]): Promise<Blob> {
  const docx = await import('docx');
  const { Document, Packer, Paragraph, HeadingLevel } = docx;

  const children: InstanceType<typeof Paragraph>[] = [];

  pages.forEach((page, pageIdx) => {
    if (pageIdx === 0) {
      children.push(
        new Paragraph({ text: baseName, heading: HeadingLevel.HEADING_1, spacing: { after: 200 } })
      );
    }

    paragraphsFromPage(page).forEach((text) => {
      children.push(new Paragraph({ text, spacing: { after: 120, line: 280 } }));
    });

    if (pageIdx < pages.length - 1) {
      children.push(new Paragraph({ pageBreakBefore: true }));
    }
  });

  const doc = new Document({ sections: [{ children }] });
  return Packer.toBlob(doc);
}

export async function buildPptxFromPdf(pages: PageLayout[]): Promise<Blob> {
  const PptxGenJS = (await import('pptxgenjs')).default;
  const pres = new PptxGenJS();

  pages.forEach((page, pageIdx) => {
    const slide = pres.addSlide();
    slide.addText(`Slide ${pageIdx + 1}`, {
      x: 0.4,
      y: 0.3,
      w: 9,
      fontSize: 20,
      bold: true,
      color: '363636',
    });

    const lines = groupLines(page.items)
      .map((line) => line.items.map((it) => it.str).join(' ').trim())
      .filter(Boolean);

    if (lines.length > 0) {
      slide.addText(
        lines.map((text) => ({ text, options: { bullet: true, breakLine: true } })),
        { x: 0.4, y: 1.1, w: 9, h: 4.8, fontSize: 14, color: '363636', valign: 'top' }
      );
    }
  });

  const blob = await pres.write({ outputType: 'blob' });
  return blob as Blob;
}

export async function buildXlsxFromPdf(pages: PageLayout[]): Promise<Blob> {
  const { Workbook } = await import('exceljs');
  const workbook = new Workbook();
  const sheet = workbook.addWorksheet('Extracted Text');

  // Text position in a PDF isn't real cell/column metadata - a multi-column
  // layout (e.g. a resume with a right-aligned date on the same line as a
  // left-aligned heading) emits separate items at the same Y that aren't
  // actually different spreadsheet columns. Joining each line into one
  // column-A string avoids fragmenting it across dozens of columns; a blank
  // row marks the boundary between PDF pages.
  pages.forEach((page, pageIdx) => {
    groupLines(page.items).forEach((line) => {
      const text = line.items.map((item) => item.str).join(' ').trim();
      if (text) sheet.addRow([text]);
    });

    if (pageIdx < pages.length - 1) {
      sheet.addRow([]);
    }
  });

  const buffer = await workbook.xlsx.writeBuffer();
  return new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}
