import ToolPage, { type ProcessResult } from '../ToolPage';

async function processor(files: File[]): Promise<ProcessResult> {
  const file = files[0];
  // For non-PDF files, we create a simple PDF wrapper
  // In production, this would use a server-side conversion service
  const { PDFDocument, rgb } = await import('pdf-lib');
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595.28, 841.89]); // A4
  const font = await pdfDoc.embedFont('Helvetica');

  page.drawText(`Converted from: ${file.name}`, {
    x: 50,
    y: 780,
    size: 14,
    font,
  });

  page.drawText(`File size: ${(file.size / 1024).toFixed(1)} KB`, {
    x: 50,
    y: 760,
    size: 12,
    font,
    color: rgb(0.4, 0.4, 0.4),
  });

  page.drawText(
    'Note: Full conversion requires server-side processing.',
    { x: 50, y: 740, size: 10, font }
  );

  const bytes = await pdfDoc.save();
  const blob = new Blob([bytes], { type: 'application/pdf' });

  return {
    singleBlob: {
      blob,
      name: file.name.replace(/\.[^.]+$/, '.pdf'),
    },
    info: { source_file: file.name, source_size: (file.size / 1024).toFixed(1) + ' KB' },
  };
}

export default function ConvertToPdf() {
  return <ToolPage processor={processor} />;
}
