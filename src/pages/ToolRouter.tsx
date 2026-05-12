import { useParams } from 'react-router-dom';
import CompressPdf from './tool-pages/CompressPdf';
import MergePdf from './tool-pages/MergePdf';
import SplitPdf from './tool-pages/SplitPdf';
import RotatePdf from './tool-pages/RotatePdf';
import WatermarkPdf from './tool-pages/WatermarkPdf';
import PageNumbers from './tool-pages/PageNumbers';
import PdfToJpg from './tool-pages/PdfToJpg';
import JpgToPdf from './tool-pages/JpgToPdf';
import ProtectPdf from './tool-pages/ProtectPdf';
import GenericTool from './tool-pages/GenericTool';
import ConvertToPdf from './tool-pages/ConvertToPdf';
import PdfToOffice from './tool-pages/PdfToOffice';

const toolComponents: Record<string, React.ComponentType> = {
  'compress-pdf': CompressPdf,
  'merge-pdf': MergePdf,
  'split-pdf': SplitPdf,
  'rotate-pdf': RotatePdf,
  'watermark': WatermarkPdf,
  'page-numbers': PageNumbers,
  'pdf-to-jpg': PdfToJpg,
  'jpg-to-pdf': JpgToPdf,
  'protect-pdf': ProtectPdf,
  // Office conversions (demo)
  'pdf-to-word': PdfToOffice,
  'pdf-to-powerpoint': PdfToOffice,
  'pdf-to-excel': PdfToOffice,
  // File to PDF conversions
  'word-to-pdf': ConvertToPdf,
  'powerpoint-to-pdf': ConvertToPdf,
  'excel-to-pdf': ConvertToPdf,
  'html-to-pdf': ConvertToPdf,
  // Edit tools
  'edit-pdf': GenericTool,
  'sign-pdf': GenericTool,
  'pdf-forms': GenericTool,
  // Organize
  'organize-pdf': GenericTool,
  'crop-pdf': GenericTool,
  // Optimize
  'repair-pdf': GenericTool,
  'pdf-to-pdfa': GenericTool,
  // Security
  'unlock-pdf': GenericTool,
  'redact-pdf': GenericTool,
  // Intelligence
  'scan-to-pdf': JpgToPdf,
  'ocr-pdf': GenericTool,
  'compare-pdf': GenericTool,
  'ai-summarizer': GenericTool,
  'translate-pdf': GenericTool,
};

export default function ToolRouter() {
  const { toolId } = useParams<{ toolId: string }>();
  const Component = toolId ? toolComponents[toolId] : null;

  if (!Component) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center pt-16">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Tool Not Found</h2>
          <p className="text-gray-500">The requested tool does not exist.</p>
        </div>
      </div>
    );
  }

  return <Component />;
}
