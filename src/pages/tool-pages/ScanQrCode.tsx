import ToolPage, { type ProcessResult } from '../ToolPage';
import { useState, useCallback } from 'react';

async function scanQrCode(file: File): Promise<string | null> {
  return new Promise((resolve) => {
    try {
      const reader = new FileReader();
      
      reader.onerror = () => {
        console.error('FileReader error:', reader.error);
        resolve(null);
      };
      
      reader.onload = async () => {
        try {
          if (typeof reader.result !== 'string') {
            resolve(null);
            return;
          }
          
          const img = new Image();
          
          img.onload = async () => {
            try {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const jsQR = (await import('jsqr')) as any;
              const canvas = document.createElement('canvas');
              canvas.width = img.width;
              canvas.height = img.height;
              const ctx = canvas.getContext('2d');
              
              if (!ctx) {
                resolve(null);
                return;
              }
              
              ctx.drawImage(img, 0, 0);
              const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
              const code = jsQR.default(imageData.data, imageData.width, imageData.height);
              resolve(code?.data || null);
            } catch (err) {
              console.error('QR decoding error:', err);
              resolve(null);
            }
          };
          
          img.onerror = () => {
            console.error('Image loading error');
            resolve(null);
          };
          
          img.src = reader.result;
        } catch (err) {
          console.error('FileReader onload error:', err);
          resolve(null);
        }
      };
      
      reader.readAsDataURL(file);
    } catch (err) {
      console.error('QR scanning error:', err);
      resolve(null);
    }
  });
}

async function processor(files: File[]): Promise<ProcessResult> {
  const file = files[0];
  
  // Scan QR code from image
  const result = await scanQrCode(file);
  
  if (result) {
    return {
      info: {
        decoded_value: result,
        file_name: file.name,
        is_url: result.startsWith('http') ? 'Yes' : 'No',
      },
    };
  }
  
  throw new Error('No QR code found in the image. Try a clearer image.');
}

interface QrGeneratorProps {
  options: Record<string, unknown>;
  setOptions: (opts: Record<string, unknown>) => void;
}

function QrGenerator({ options, setOptions }: QrGeneratorProps) {
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generateQr = useCallback(async () => {
    const text = (options.qrText as string) || '';
    if (!text) {
      setError('Please enter text or a URL');
      return;
    }
    
    setIsGenerating(true);
    setError(null);
    try {
      const QRCodeModule = await import('qrcode');
      const QRCode = QRCodeModule.default;
      const canvas = document.createElement('canvas');
      await QRCode.toCanvas(canvas, text, { width: 300 });
      setQrCode(canvas.toDataURL('image/png'));
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to generate QR code';
      console.error('QR generation failed:', err);
      setError(errorMsg);
    } finally {
      setIsGenerating(false);
    }
  }, [options.qrText]);

  const handleDownload = () => {
    if (!qrCode) return;
    const link = document.createElement('a');
    link.href = qrCode;
    link.download = 'qrcode.png';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Enter text or URL to generate QR code
        </label>
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="https://example.com or any text"
            value={(options.qrText as string) || ''}
            onChange={(e) => {
              setOptions({ ...options, qrText: e.target.value });
              setError(null);
            }}
            className="flex-1 px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            onClick={generateQr}
            disabled={!options.qrText || isGenerating}
            className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isGenerating ? 'Generating...' : 'Generate'}
          </button>
        </div>
        {error && <p className="text-sm text-red-500 dark:text-red-400 mt-2">{error}</p>}
      </div>
      
      {qrCode && (
        <div className="text-center">
          <img src={qrCode} alt="Generated QR Code" className="mx-auto mb-4 border border-gray-300 dark:border-gray-600 p-2 bg-white" />
          <button
            onClick={handleDownload}
            className="inline-block px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors"
          >
            Download QR Code
          </button>
        </div>
      )}
    </div>
  );
}

export default function ScanQrCode() {
  const [mode, setMode] = useState<'scan' | 'generate'>('scan');
  const [options, setOptions] = useState<Record<string, unknown>>({});

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 pt-20 transition-colors">
      <div className="bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-gray-800 transition-colors">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">QR Code Tool</h1>
          <div className="flex gap-4">
            <button
              onClick={() => setMode('scan')}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                mode === 'scan'
                  ? 'bg-blue-500 text-white'
                  : 'bg-gray-200 dark:bg-gray-800 text-gray-900 dark:text-white hover:bg-gray-300 dark:hover:bg-gray-700'
              }`}
            >
              Scan QR Code
            </button>
            <button
              onClick={() => setMode('generate')}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                mode === 'generate'
                  ? 'bg-blue-500 text-white'
                  : 'bg-gray-200 dark:bg-gray-800 text-gray-900 dark:text-white hover:bg-gray-300 dark:hover:bg-gray-700'
              }`}
            >
              Generate QR Code
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
        {mode === 'scan' ? (
          <ToolPage processor={processor} />
        ) : (
          <QrGenerator options={options} setOptions={setOptions} />
        )}
      </div>
    </div>
  );
}
