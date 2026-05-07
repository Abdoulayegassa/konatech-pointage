declare module 'qrcode' {
  type QrErrorCorrectionLevel = 'L' | 'M' | 'Q' | 'H';

  type QrCodeRenderOptions = {
    width?: number;
    margin?: number;
    errorCorrectionLevel?: QrErrorCorrectionLevel;
    color?: {
      dark?: string;
      light?: string;
    };
  };

  function toCanvas(
    canvasElement: HTMLCanvasElement,
    text: string,
    options?: QrCodeRenderOptions,
  ): Promise<void>;

  function toDataURL(
    text: string,
    options?: QrCodeRenderOptions,
  ): Promise<string>;

  const QRCode: {
    toCanvas: typeof toCanvas;
    toDataURL: typeof toDataURL;
  };

  export default QRCode;
}
