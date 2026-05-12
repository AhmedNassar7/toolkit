declare module 'qrcode' {
  export interface QRCodeToCanvasOptions {
    width?: number;
  }

  export interface QRCodeStatic {
    toCanvas(
      canvas: HTMLCanvasElement,
      text: string,
      options?: QRCodeToCanvasOptions
    ): Promise<void>;
  }

  const QRCode: QRCodeStatic;
  export default QRCode;
}
