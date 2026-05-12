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
  docx: '.doc',
  pptx: '.ppt',
  xlsx: '.xls',
};

async function processor(files: File[], _options?: Record<string, unknown>, toolId?: string): Promise<ProcessResult> {
  const file = files[0];
  const format = formatMap[toolId || 'pdf-to-word'] || 'docx';
  const ext = extMap[format] || '.doc';

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

  const blob = await response.blob();
  const baseName = file.name.replace(/\.pdf$/i, '');
  const outputName = baseName + ext;

  return {
    singleBlob: { blob, name: outputName },
    info: {
      source: file.name,
      format: format.toUpperCase(),
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
