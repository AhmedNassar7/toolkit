import PdfParse from "npm:pdf-parse@1.1.1";
import * as PDFJS from "npm:pdfjs-dist@4.0.269";
import * as docx from "npm:docx@8.12.2";
import { Buffer } from "node:buffer";

declare const Deno: {
  serve: (handler: (req: Request) => Response | Promise<Response>) => void;
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

// Set up PDF.js worker
PDFJS.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS.version}/pdf.worker.min.js`;

interface TextItem {
  str: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

interface PageLayout {
  items: TextItem[];
}

async function extractPdfWithLayout(uint8: Uint8Array): Promise<PageLayout[]> {
  const pdf = await PDFJS.getDocument({ data: uint8 }).promise;
  const pages: PageLayout[] = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    const items: TextItem[] = (textContent.items as any[])
      .filter((item) => item.str && item.str.trim())
      .map((item) => ({
        str: item.str,
        x: item.transform[4],
        y: item.transform[5],
        width: item.width,
        height: item.height,
      }));

    pages.push({ items });
  }

  return pages;
}

function detectTables(pageItems: TextItem[]): TextItem[][] {
  if (pageItems.length < 2) return [pageItems];

  // Sort by Y position (top to bottom), then X (left to right)
  const sorted = [...pageItems].sort((a, b) => {
    const yDiff = Math.abs(b.y - a.y);
    if (yDiff > 10) return b.y - a.y;
    return a.x - b.x;
  });

  // Group items by approximate Y position (within 15 units)
  const rows: TextItem[][] = [];
  let currentRow: TextItem[] = [];

  sorted.forEach((item) => {
    if (
      currentRow.length === 0 ||
      Math.abs(item.y - currentRow[0].y) < 15
    ) {
      currentRow.push(item);
    } else {
      rows.push(currentRow);
      currentRow = [item];
    }
  });

  if (currentRow.length) rows.push(currentRow);

  return rows;
}

function groupLines(items: TextItem[], xGapThreshold = 8, yThreshold = 15) {
  // Group by approximate Y position into lines
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

  // Sort items within lines by X and merge nearby items into words
  return lines.map((l) => ({
    y: l.y,
    items: l.items.sort((a, b) => a.x - b.x),
  }));
}

function buildTableFromRows(rows: TextItem[][]) {
  // Determine column x positions by inspecting first few rows
  const xs: number[] = [];
  rows.forEach((row) => {
    row.forEach((cell) => {
      xs.push(cell.x);
    });
  });
  if (xs.length === 0) return null;
  // cluster xs into columns
  xs.sort((a, b) => a - b);
  const cols: number[] = [xs[0]];
  const colGap = 20; // threshold to start a new column
  xs.forEach((x) => {
    if (Math.abs(x - cols[cols.length - 1]) > colGap) cols.push(x);
  });

  const table: string[][] = rows.map((row) => {
    const cells = cols.map(() => "");
    row.forEach((item) => {
      // find nearest column
      let bestIdx = 0;
      let bestDist = Infinity;
      cols.forEach((cx, idx) => {
        const d = Math.abs(item.x - cx);
        if (d < bestDist) {
          bestDist = d;
          bestIdx = idx;
        }
      });
      if (cells[bestIdx]) cells[bestIdx] += " " + item.str.trim();
      else cells[bestIdx] = item.str.trim();
    });
    return cells.map((c) => c.trim());
  });

  return { cols, table };
}

function createWordDoc(
  title: string,
  pages: PageLayout[]
): Buffer {
  const sections: docx.ISectionOptions[] = [];

  pages.forEach((page, pageIdx) => {
    const elements: docx.ParagraphLike[] = [];

    // Add page title
    if (pageIdx === 0) {
      elements.push(
        new docx.Paragraph({
          text: title,
          heading: docx.HeadingLevel.HEADING_1,
          spacing: { after: 200 },
        })
      );
    }

    // Group items into lines to better reconstruct paragraphs
    const lines = groupLines(page.items);

    // Try detect tables from raw items
    const rows = detectTables(page.items);
    const maybeTable = rows.length > 1 && rows.some((r) => r.length > 1) ? buildTableFromRows(rows) : null;

    if (maybeTable && maybeTable.table.length > 0) {
      const tableRows = maybeTable.table.map(
        (r) =>
          new docx.TableRow({
            cells: r.map((cellText) =>
              new docx.TableCell({
                children: [
                  new docx.Paragraph({ text: cellText }),
                ],
              })
            ),
          })
      );

      elements.push(
        new docx.Table({
          rows: tableRows,
          width: { size: 100, type: docx.WidthType.PERCENTAGE },
        })
      );
    } else {
      // Build paragraphs by joining lines, adding paragraph breaks for larger vertical gaps
      const mergedParagraphs: string[] = [];
      let currentPara = "";
      let lastY: number | null = null;

      for (const line of lines) {
        const lineText = line.items.map((it, idx) => {
          // Add a space if next item is sufficiently far from previous
          return it.str;
        }).join(" ");

        if (lastY === null) {
          currentPara = lineText;
        } else {
          // if gap between lastY and current line is large, start new paragraph
          if (Math.abs(lastY - line.y) > 20) {
            mergedParagraphs.push(currentPara.trim());
            currentPara = lineText;
          } else {
            currentPara += " " + lineText;
          }
        }
        lastY = line.y;
      }

      if (currentPara.trim()) mergedParagraphs.push(currentPara.trim());

      mergedParagraphs.forEach((p) => {
        elements.push(
          new docx.Paragraph({
            text: p,
            spacing: { line: 280 },
          })
        );
      });
    }

    // Add page break if not last page
    if (pageIdx < pages.length - 1) {
      elements.push(new docx.Paragraph({ pageBreakBefore: true }));
    }

    sections.push({
      children: elements,
    });
  });

  const doc = new docx.Document({
    sections: [{ children: sections.flatMap((s) => s.children) }],
  });

  return docx.Packer.toBuffer(doc);
}

function createPptDoc(
  title: string,
  pages: PageLayout[]
): Buffer {
  const sections: docx.ParagraphLike[] = [];

  pages.forEach((page, pageIdx) => {
    sections.push(
      new docx.Paragraph({
        text: `Slide ${pageIdx + 1}`,
        heading: docx.HeadingLevel.HEADING_2,
        spacing: { before: 200, after: 100 },
      })
    );

    page.items.forEach((item) => {
      sections.push(
        new docx.Paragraph({
          text: item.str,
          bullet: { level: 0 },
          spacing: { line: 240, after: 100 },
        })
      );
    });

    if (pageIdx < pages.length - 1) {
      sections.push(new docx.Paragraph({ pageBreakBefore: true }));
    }
  });

  const doc = new docx.Document({
    sections: [{ children: sections }],
  });

  return docx.Packer.toBuffer(doc);
}

function createXlsDoc(pages: PageLayout[]): Buffer {
  const rows = pages.flatMap((page) =>
    detectTables(page.items)
  );

  const tableRows = rows.map(
    (row) =>
      new docx.TableRow({
        cells: row.map(
          (item) =>
            new docx.TableCell({
              children: [
                new docx.Paragraph({
                  text: item.str,
                  spacing: { after: 0 },
                }),
              ],
            })
        ),
      })
  );

  const doc = new docx.Document({
    sections: [
      {
        children: [
          new docx.Table({
            rows: tableRows,
            width: { size: 100, type: docx.WidthType.PERCENTAGE },
          }),
        ],
      },
    ],
  });

  return docx.Packer.toBuffer(doc);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const format = (formData.get("format") as string) || "docx";

    if (!file) {
      return new Response(
        JSON.stringify({ error: "No file provided" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const uint8 = new Uint8Array(arrayBuffer);
    const baseName = file.name.replace(/\.pdf$/i, "");

    // Extract PDF with layout preservation
    const pages = await extractPdfWithLayout(uint8);

    if (!pages || pages.length === 0) {
      throw new Error("Could not extract content from PDF");
    }

    // Generate the appropriate output format
    let buffer: Buffer;
    let contentType: string;
    let ext: string;

    if (format === "pptx") {
      buffer = createPptDoc(baseName, pages);
      contentType = "application/vnd.openxmlformats-officedocument.presentationml.presentation";
      ext = ".pptx";
    } else if (format === "xlsx") {
      buffer = createXlsDoc(pages);
      contentType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
      ext = ".xlsx";
    } else {
      // Default: Word document (.docx)
      buffer = createWordDoc(baseName, pages);
      contentType = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
      ext = ".docx";
    }

    // Convert Node Buffer to an ArrayBuffer view compatible with the web Response body
    const responseBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);

    return new Response(responseBuffer, {
      headers: {
        ...corsHeaders,
        "Content-Type": contentType,
        "Content-Disposition": `attachment; filename="${baseName}${ext}"`,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("PDF conversion error:", message);
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
