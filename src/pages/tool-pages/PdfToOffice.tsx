import { useParams } from 'react-router-dom';
import ToolPage, { type ProcessResult } from '../ToolPage';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

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

// LibreOffice has no PDF import filter for Calc, so PDF -> XLSX can't go
// through the convert-service and always uses the Supabase fallback below.
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

async function convertViaSupabase(file: File, format: string): Promise<Blob> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('format', format);

  const response = await fetch(`${SUPABASE_URL}/functions/v1/pdf-to-word`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: formData,
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: 'Conversion failed' }));
    throw new Error(err.error || `Server error: ${response.status}`);
  }

  return response.blob();
}

async function processor(files: File[], _options?: Record<string, unknown>, toolId?: string): Promise<ProcessResult> {
  const file = files[0];
  const format = formatMap[toolId || 'pdf-to-word'] || 'docx';
  const ext = extMap[format] || '.doc';

  // Prefer the LibreOffice-backed convert-service for real layout fidelity
  // (fonts, images, tables, real slide geometry); fall back to the Supabase
  // edge function's text-only reconstruction if the server isn't configured,
  // unreachable, or can't handle this format (e.g. PDF -> XLSX).
  let blob: Blob;
  let method: string;

  if (SERVER_CAPABLE_FORMATS.has(format) && convertServiceUrl()) {
    try {
      blob = await convertViaServer(file, format);
      method = 'LibreOffice server (high fidelity)';
    } catch {
      blob = await convertViaSupabase(file, format);
      method = 'Local text extraction (basic fidelity)';
    }
  } else {
    blob = await convertViaSupabase(file, format);
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
