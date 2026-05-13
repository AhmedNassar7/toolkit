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

    // Detect and create tables from layout
    const rows = detectTables(page.items);

    if (rows.length > 1 && rows.some((r) => r.length > 1)) {
      // Likely a table
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

      elements.push(
        new docx.Table({
          rows: tableRows,
          width: { size: 100, type: docx.WidthType.PERCENTAGE },
        })
      );
    } else {
      // Regular text
      page.items.forEach((item) => {
        elements.push(
          new docx.Paragraph({
            text: item.str,
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

    return new Response(buffer, {
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
