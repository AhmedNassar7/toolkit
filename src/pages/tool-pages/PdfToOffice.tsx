import { useParams } from 'react-router-dom';
import ToolPage, { type ProcessResult } from '../ToolPage';
import { extractPdfLayout, buildDocxFromPdf, buildPptxFromPdf, buildXlsxFromPdf } from '../../utils/officeExportProcessor';

const formatMap: Record<string, string> = {
  'pdf-to-word': 'docx',
  'pdf-to-powerpoint': 'pptx',
  'pdf-to-excel': 'xlsx',
};

const extMap: Record<string, string> = {
  docx: '.docx',
  pptx: '.pptx',
  xlsx: '.xlsx',
};

// LibreOffice has no PDF import filter for Calc, so PDF -> XLSX always uses
// the local (client-side) fallback below.
const SERVER_CAPABLE_FORMATS = new Set(['docx', 'pptx']);

function convertServiceUrl(): string {
  const base = import.meta.env.VITE_CONVERT_API_URL || (import.meta.env.DEV ? 'http://localhost:3000/convert' : '');
  return base as string;
}

async function convertViaServer(file: File, format: string): Promise<Blob> {
  const form = new FormData();
  form.append('file', file, file.name);
  form.append('target', format);
  const res = await fetch(convertServiceUrl(), { method: 'POST', body: form });
  if (!res.ok) throw new Error(await res.text().catch(() => 'Conversion failed'));
  return res.blob();
}

async function convertLocally(file: File, format: string): Promise<Blob> {
  const pages = await extractPdfLayout(file);
  const baseName = file.name.replace(/\.pdf$/i, '');

  if (format === 'pptx') return buildPptxFromPdf(pages);
  if (format === 'xlsx') return buildXlsxFromPdf(pages);
  return buildDocxFromPdf(baseName, pages);
}

async function processor(files: File[], _options?: Record<string, unknown>, toolId?: string): Promise<ProcessResult> {
  const file = files[0];
  const format = formatMap[toolId || 'pdf-to-word'] || 'docx';
  const ext = extMap[format] || '.doc';

  // Prefer the LibreOffice-backed convert-service for real layout fidelity
  // (fonts, images, tables, real slide geometry); fall back to local,
  // in-browser text extraction if the server isn't configured, unreachable,
  // or can't handle this format (e.g. PDF -> XLSX). Nothing ever leaves the
  // browser in the fallback path.
  let blob: Blob;
  let method: string;

  if (SERVER_CAPABLE_FORMATS.has(format) && convertServiceUrl()) {
    try {
      blob = await convertViaServer(file, format);
      method = 'LibreOffice server (high fidelity)';
    } catch {
      blob = await convertLocally(file, format);
      method = 'Local text extraction (basic fidelity)';
    }
  } else {
    blob = await convertLocally(file, format);
    method = 'Local text extraction (basic fidelity)';
  }

  const baseName = file.name.replace(/\.pdf$/i, '');
  const outputName = baseName + ext;

  return {
    singleBlob: { blob, name: outputName },
    info: {
      source: file.name,
      format: format.toUpperCase(),
      method,
      output_size: (blob.size / 1024).toFixed(1) + ' KB',
    },
  };
}

export default function PdfToOffice() {
  const { toolId } = useParams<{ toolId: string }>();

  return (
    <ToolPage
      processor={(files, options) => processor(files, options, toolId)}
    />
  );
}
