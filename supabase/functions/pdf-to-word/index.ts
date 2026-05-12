import PdfParse from "npm:pdf-parse@1.1.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

function createWordDoc(title: string, paragraphs: string[]): string {
  const escapedParagraphs = paragraphs.map((line) => {
    if (line === "\f") {
      return '<br style="page-break-after:always">';
    }
    const escaped = line
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
    return `<p style="margin:0 0 6pt 0;line-height:1.5;font-family:Calibri,sans-serif;font-size:11pt">${escaped}</p>`;
  });

  return `<html xmlns:o="urn:schemas-microsoft-com:office:office"
      xmlns:w="urn:schemas-microsoft-com:office:word"
      xmlns="http://www.w3.org/TR/REC-html40">
<head>
  <meta charset="utf-8">
  <title>${title}</title>
  <!--[if gte mso 9]>
  <xml>
    <w:WordDocument>
      <w:View>Print</w:View>
      <w:Zoom>100</w:Zoom>
      <w:DoNotOptimizeForBrowser/>
    </w:WordDocument>
  </xml>
  <![endif]-->
  <style>
    @page { margin: 2.54cm; }
    body { font-family: Calibri, sans-serif; font-size: 11pt; }
    p { margin: 0 0 6pt 0; line-height: 1.5; }
  </style>
</head>
<body>
  ${escapedParagraphs.join("\n")}
</body>
</html>`;
}

function createPptDoc(title: string, slides: string[][]): string {
  const slideHtml = slides.map((lines, i) => {
    const bullets = lines
      .filter((l) => l.trim())
      .map((l) => `    <li>${l.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</li>`)
      .join("\n");
    return `<div class="slide">
  <h2>Page ${i + 1}</h2>
  <ul>
${bullets}
  </ul>
</div>`;
  });

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${title}</title>
  <style>
    @page { margin: 1cm; size: landscape; }
    body { font-family: Calibri, sans-serif; }
    .slide { page-break-after: always; padding: 2cm; }
    .slide h2 { font-size: 24pt; margin-bottom: 12pt; color: #333; }
    .slide ul { font-size: 18pt; line-height: 1.6; }
    .slide li { margin-bottom: 6pt; }
  </style>
</head>
<body>
${slideHtml.join("\n")}
</body>
</html>`;
}

function createXlsDoc(rows: string[]): string {
  const tableRows = rows
    .filter((r) => r.trim() && r !== "\f")
    .map((row) => {
      const cells = row.split(/\s{2,}|\t/).filter((c) => c.trim());
      const tds = cells
        .map((c) => `<td>${c.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</td>`)
        .join("");
      return `<tr>${tds}</tr>`;
    });

  return `<html xmlns:o="urn:schemas-microsoft-com:office:office"
xmlns:x="urn:schemas-microsoft-com:office:excel">
<head>
  <meta charset="utf-8">
  <!--[if gte mso 9]><xml>
  <x:ExcelWorkbook>
    <x:ExcelWorksheets>
      <x:ExcelWorksheet>
        <x:Name>Sheet1</x:Name>
      </x:ExcelWorksheet>
    </x:ExcelWorksheets>
  </x:ExcelWorkbook>
  </xml><![endif]-->
</head>
<body>
  <table>${tableRows.join("\n")}</table>
</body>
</html>`;
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

    // Use pdf-parse to extract text
    const data = await PdfParse(uint8);
    const fullText = data.text || "";

    // Split text into pages using form feed character
    const pageTexts = fullText.split("\f").filter((p: string) => p.trim());

    // If no page breaks found, treat entire text as one page
    const pages: string[][] = pageTexts.length > 0
      ? pageTexts.map((p: string) => p.split("\n").filter((l: string) => l.trim()))
      : fullText.split("\n").filter((l: string) => l.trim()).length > 0
        ? [fullText.split("\n").filter((l: string) => l.trim())]
        : [["No text content found in PDF"]];

    // Build all lines with page breaks
    const allLines: string[] = [];
    for (let i = 0; i < pages.length; i++) {
      allLines.push(...pages[i]);
      if (i < pages.length - 1) {
        allLines.push("\f");
      }
    }

    // Generate the appropriate output format
    if (format === "pptx") {
      const html = createPptDoc(baseName, pages);
      return new Response(html, {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/vnd.ms-powerpoint",
          "Content-Disposition": `attachment; filename="${baseName}.ppt"`,
        },
      });
    }

    if (format === "xlsx") {
      const html = createXlsDoc(allLines);
      return new Response(html, {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/vnd.ms-excel",
          "Content-Disposition": `attachment; filename="${baseName}.xls"`,
        },
      });
    }

    // Default: Word document (.doc)
    const html = createWordDoc(baseName, allLines);
    return new Response(html, {
      headers: {
        ...corsHeaders,
        "Content-Type": "application/msword",
        "Content-Disposition": `attachment; filename="${baseName}.doc"`,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
