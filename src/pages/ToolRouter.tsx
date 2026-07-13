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
import ComingSoon from './tool-pages/ComingSoon';
import ConvertToPdf from './tool-pages/ConvertToPdf';
import PdfToOffice from './tool-pages/PdfToOffice';
import ScanQrCode from './tool-pages/ScanQrCode';
import UnlockPdf from './tool-pages/UnlockPdf';
import CropPdf from './tool-pages/CropPdf';
import RepairPdf from './tool-pages/RepairPdf';
import OrganizePdf from './tool-pages/OrganizePdf';

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
  // Office conversions
  'pdf-to-word': PdfToOffice,
  'pdf-to-powerpoint': PdfToOffice,
  'pdf-to-excel': PdfToOffice,
  // File to PDF conversions
  'word-to-pdf': ConvertToPdf,
  'powerpoint-to-pdf': ConvertToPdf,
  'excel-to-pdf': ConvertToPdf,
  'html-to-pdf': ConvertToPdf,
  // Edit tools - not yet implemented, honestly labeled
  'edit-pdf': ComingSoon,
  'sign-pdf': ComingSoon,
  'pdf-forms': ComingSoon,
  // Organize
  'organize-pdf': OrganizePdf,
  'crop-pdf': CropPdf,
  // Optimize
  'repair-pdf': RepairPdf,
  'pdf-to-pdfa': ComingSoon,
  // Security
  'unlock-pdf': UnlockPdf,
  'redact-pdf': ComingSoon,
  // Intelligence - not yet implemented, honestly labeled
  'scan-to-pdf': JpgToPdf,
  'ocr-pdf': ComingSoon,
  'compare-pdf': ComingSoon,
  'ai-summarizer': ComingSoon,
  'translate-pdf': ComingSoon,
  // QR Code
  'qr-code': ScanQrCode,
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
