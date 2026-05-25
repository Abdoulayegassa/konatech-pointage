'use client';

import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

type AttendanceEntryQrCardProps = {
  attendanceEntryPath: string;
  initialAttendanceEntryUrl: string;
};

type FeedbackState = {
  tone: 'success' | 'error';
  message: string;
} | null;

type PosterDimensions = {
  width: number;
  height: number;
};

type TextBlockOptions = {
  centerX: number;
  fillStyle: string;
  font: string;
  lineHeight: number;
  maxLines?: number;
  maxWidth: number;
  topY: number;
  tracking?: number;
  value: string;
};

type QrZoneOptions = {
  centerX: number;
  qrCardSize: number;
  qrImage: HTMLImageElement;
  qrInset: number;
  zoneHeight: number;
  zoneTopY: number;
};

const qrCodeOptions = {
  margin: 1,
  errorCorrectionLevel: 'M' as const,
  color: {
    dark: '#10323c',
    light: '#ffffff',
  },
};

const a4PosterDimensions: PosterDimensions = {
  width: 2480,
  height: 3508,
};
const previewPosterDimensions: PosterDimensions = {
  width: 860,
  height: 1216,
};
const posterPalette = {
  accent: '#f46e28',
  accentDeep: '#db5d16',
  accentSoft: '#fff1e7',
  accentBorder: '#f7a467',
  backgroundTop: '#fffdfb',
  backgroundBottom: '#ffffff',
  text: '#10323c',
  textSoft: '#26424a',
  muted: '#6b7280',
  line: '#e2e8f0',
  lineStrong: '#f4c6a4',
  surface: '#ffffff',
  surfaceMuted: '#fff8f3',
};

function normalizeAttendanceEntryUrl(
  initialAttendanceEntryUrl: string,
  attendanceEntryPath: string,
) {
  if (typeof window === 'undefined') {
    return initialAttendanceEntryUrl;
  }

  if (/^https?:\/\//i.test(initialAttendanceEntryUrl)) {
    return initialAttendanceEntryUrl;
  }

  try {
    return new URL(
      initialAttendanceEntryUrl,
      window.location.origin,
    ).toString();
  } catch {
    return new URL(attendanceEntryPath, window.location.origin).toString();
  }
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();

    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Image loading failed.'));
    image.src = src;
  });
}

function drawSpacedCenteredText(
  context: CanvasRenderingContext2D,
  value: string,
  centerX: number,
  baselineY: number,
  tracking: number,
) {
  const characters = [...value];
  const totalWidth = characters.reduce((width, character, index) => {
    return (
      width + context.measureText(character).width + (index > 0 ? tracking : 0)
    );
  }, 0);
  let cursorX = centerX - totalWidth / 2;

  characters.forEach((character, index) => {
    context.fillText(character, cursorX, baselineY);
    cursorX += context.measureText(character).width;

    if (index < characters.length - 1) {
      cursorX += tracking;
    }
  });
}

function drawRoundedRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  context.beginPath();
  context.moveTo(x + radius, y);
  context.lineTo(x + width - radius, y);
  context.quadraticCurveTo(x + width, y, x + width, y + radius);
  context.lineTo(x + width, y + height - radius);
  context.quadraticCurveTo(
    x + width,
    y + height,
    x + width - radius,
    y + height,
  );
  context.lineTo(x + radius, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - radius);
  context.lineTo(x, y + radius);
  context.quadraticCurveTo(x, y, x + radius, y);
  context.closePath();
}

function getFontMetrics(
  context: CanvasRenderingContext2D,
  fallbackFontSize: number,
) {
  const metrics = context.measureText('Ag');
  const fallbackHeight = Math.max(1, Math.round(fallbackFontSize));
  const ascent =
    Math.round(metrics.actualBoundingBoxAscent) ||
    Math.round(fallbackHeight * 0.8);
  const descent =
    Math.round(metrics.actualBoundingBoxDescent) ||
    Math.max(1, fallbackHeight - ascent);

  return {
    ascent,
    descent,
    height: Math.max(1, ascent + descent),
  };
}

function clampTextToWidth(
  context: CanvasRenderingContext2D,
  value: string,
  maxWidth: number,
) {
  if (context.measureText(value).width <= maxWidth) {
    return value;
  }

  const ellipsis = '...';
  let candidate = value;

  while (candidate.length > 0) {
    const nextValue = `${candidate}${ellipsis}`;

    if (context.measureText(nextValue).width <= maxWidth) {
      return nextValue;
    }

    candidate = candidate.slice(0, -1);
  }

  return ellipsis;
}

function createWrappedLines(
  context: CanvasRenderingContext2D,
  value: string,
  maxWidth: number,
  maxLines = Number.POSITIVE_INFINITY,
) {
  const words = value.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let currentLine = '';

  if (words.length === 0) {
    return lines;
  }

  words.forEach((word) => {
    const candidate = currentLine ? `${currentLine} ${word}` : word;

    if (context.measureText(candidate).width <= maxWidth) {
      currentLine = candidate;
      return;
    }

    if (!currentLine) {
      lines.push(clampTextToWidth(context, word, maxWidth));
      return;
    }

    lines.push(currentLine);
    currentLine = word;
  });

  if (currentLine) {
    lines.push(currentLine);
  }

  if (lines.length <= maxLines) {
    return lines;
  }

  const visibleLines = lines.slice(0, maxLines);
  const hiddenTail = lines.slice(maxLines - 1).join(' ');
  visibleLines[maxLines - 1] = clampTextToWidth(context, hiddenTail, maxWidth);

  return visibleLines;
}

function measureTextLayout(
  context: CanvasRenderingContext2D,
  {
    font,
    lineHeight,
    maxLines,
    maxWidth,
    value,
  }: Pick<
    TextBlockOptions,
    'font' | 'lineHeight' | 'maxLines' | 'maxWidth' | 'value'
  >,
) {
  context.font = font;

  const fallbackFontSize =
    Number.parseInt(
      font.match(/(\d+)px/) ? font.match(/(\d+)px/)![1] : '16',
      10,
    ) || 16;
  const metrics = getFontMetrics(context, fallbackFontSize);
  const lines = createWrappedLines(
    context,
    value,
    maxWidth,
    maxLines ?? Number.POSITIVE_INFINITY,
  );

  return {
    lines,
    metrics,
    lineHeight,
    height:
      lines.length === 0 ? 0 : metrics.height + (lines.length - 1) * lineHeight,
  };
}

function drawTextBlock(
  context: CanvasRenderingContext2D,
  {
    centerX,
    fillStyle,
    font,
    lineHeight,
    maxLines,
    maxWidth,
    topY,
    tracking = 0,
    value,
  }: TextBlockOptions,
) {
  const layout = measureTextLayout(context, {
    font,
    lineHeight,
    maxLines,
    maxWidth,
    value,
  });

  context.font = font;
  context.fillStyle = fillStyle;

  layout.lines.forEach((line, index) => {
    const baselineY = topY + layout.metrics.ascent + index * lineHeight;

    if (tracking > 0 && line.length > 1) {
      drawSpacedCenteredText(context, line, centerX, baselineY, tracking);
      return;
    }

    context.fillText(line, centerX, baselineY);
  });

  return layout;
}

function drawPosterBackground(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  px: (value: number) => number,
) {
  const background = context.createLinearGradient(0, 0, 0, height);
  background.addColorStop(0, posterPalette.backgroundTop);
  background.addColorStop(1, posterPalette.backgroundBottom);
  context.fillStyle = background;
  context.fillRect(0, 0, width, height);

  context.save();
  context.beginPath();
  context.moveTo(width - px(540), 0);
  context.lineTo(width, 0);
  context.lineTo(width, px(520));
  context.quadraticCurveTo(width - px(140), px(410), width - px(360), px(252));
  context.quadraticCurveTo(width - px(500), px(150), width - px(540), 0);
  context.closePath();
  context.fillStyle = posterPalette.accent;
  context.shadowColor = 'rgba(244,110,40,0.18)';
  context.shadowBlur = px(68);
  context.shadowOffsetY = px(18);
  context.fill();
  context.restore();

  context.save();
  const topGlow = context.createRadialGradient(
    width - px(410),
    px(230),
    px(30),
    width - px(410),
    px(230),
    px(350),
  );
  topGlow.addColorStop(0, 'rgba(255,255,255,0.30)');
  topGlow.addColorStop(1, 'rgba(255,255,255,0)');
  context.fillStyle = topGlow;
  context.beginPath();
  context.arc(width - px(410), px(230), px(350), 0, Math.PI * 2);
  context.fill();
  context.restore();

  context.save();
  context.fillStyle = 'rgba(16,50,60,0.045)';
  context.beginPath();
  context.arc(px(280), px(340), px(150), 0, Math.PI * 2);
  context.fill();
  context.restore();

  const leftDots = [
    [px(142), px(830), px(10)],
    [px(170), px(890), px(7)],
    [px(126), px(950), px(5)],
    [px(180), px(2340), px(9)],
    [px(136), px(2408), px(6)],
    [px(170), px(2476), px(4)],
  ];
  const rightDots = [
    [width - px(150), px(1100), px(10)],
    [width - px(118), px(1164), px(6)],
    [width - px(170), px(1220), px(4)],
    [width - px(164), px(2660), px(8)],
    [width - px(126), px(2720), px(5)],
    [width - px(182), px(2780), px(4)],
  ];

  [...leftDots, ...rightDots].forEach(([x, y, radius], index) => {
    context.save();
    context.beginPath();
    context.arc(x, y, radius, 0, Math.PI * 2);
    context.fillStyle =
      index % 2 === 0 ? 'rgba(244,110,40,0.22)' : 'rgba(16,50,60,0.10)';
    context.fill();
    context.restore();
  });
}

function drawHeader(
  context: CanvasRenderingContext2D,
  width: number,
  currentY: number,
  logoImage: HTMLImageElement,
  px: (value: number) => number,
) {
  const logoWidth = px(644);
  const logoHeight = Math.round(
    logoWidth * (logoImage.naturalHeight / logoImage.naturalWidth),
  );
  const logoX = width / 2 - logoWidth / 2;

  context.save();
  context.shadowColor = 'rgba(15,45,58,0.08)';
  context.shadowBlur = px(20);
  context.shadowOffsetY = px(10);
  context.drawImage(logoImage, logoX, currentY, logoWidth, logoHeight);
  context.restore();

  return {
    height: logoHeight,
  };
}

function drawInstruction(
  context: CanvasRenderingContext2D,
  width: number,
  currentY: number,
  px: (value: number) => number,
) {
  const firstLineLayout = drawTextBlock(context, {
    centerX: width / 2,
    fillStyle: posterPalette.text,
    font: `650 ${px(82)}px "Inter", "Segoe UI", Arial, sans-serif`,
    lineHeight: px(100),
    maxLines: 3,
    maxWidth: width - px(560),
    topY: currentY,
    value: 'Veuillez scanner le QR pour enregistrer votre pr\u00e9sence',
  });

  return {
    height: firstLineLayout.height,
  };
}

function drawQRCode(
  context: CanvasRenderingContext2D,
  {
    centerX,
    qrCardSize,
    qrImage,
    qrInset,
    zoneHeight,
    zoneTopY,
  }: QrZoneOptions,
  px: (value: number) => number,
) {
  const qrFrameX = centerX - qrCardSize / 2;
  const qrFrameY =
    zoneTopY + Math.max(0, Math.round((zoneHeight - qrCardSize) / 2));
  const qrVisualSize = qrCardSize - qrInset * 2;

  context.save();
  context.shadowColor = 'rgba(244,110,40,0.18)';
  context.shadowBlur = px(64);
  context.shadowOffsetY = px(22);
  drawRoundedRect(context, qrFrameX, qrFrameY, qrCardSize, qrCardSize, px(64));
  context.fillStyle = posterPalette.surface;
  context.fill();
  context.restore();

  context.save();
  drawRoundedRect(context, qrFrameX, qrFrameY, qrCardSize, qrCardSize, px(64));
  context.fillStyle = posterPalette.surfaceMuted;
  context.fill();
  context.restore();

  context.save();
  drawRoundedRect(
    context,
    qrFrameX + px(24),
    qrFrameY + px(24),
    qrCardSize - px(48),
    qrCardSize - px(48),
    px(56),
  );
  context.fillStyle = posterPalette.surface;
  context.fill();
  context.restore();

  drawRoundedRect(context, qrFrameX, qrFrameY, qrCardSize, qrCardSize, px(64));
  context.strokeStyle = 'rgba(244,110,40,0.42)';
  context.lineWidth = px(12);
  context.stroke();

  drawRoundedRect(
    context,
    qrFrameX + px(18),
    qrFrameY + px(18),
    qrCardSize - px(36),
    qrCardSize - px(36),
    px(62),
  );
  context.strokeStyle = posterPalette.lineStrong;
  context.lineWidth = px(3);
  context.stroke();

  context.imageSmoothingEnabled = false;
  context.drawImage(
    qrImage,
    qrFrameX + qrInset,
    qrFrameY + qrInset,
    qrVisualSize,
    qrVisualSize,
  );
  context.imageSmoothingEnabled = true;

  return {
    height: zoneHeight,
  };
}

async function renderQrPoster(
  canvas: HTMLCanvasElement,
  value: string,
  dimensions: PosterDimensions = a4PosterDimensions,
) {
  const { width, height } = dimensions;
  const context = canvas.getContext('2d');

  if (!context) {
    throw new Error('Canvas context unavailable.');
  }

  const scale = Math.min(
    width / a4PosterDimensions.width,
    height / a4PosterDimensions.height,
  );
  const px = (value: number) => Math.round(value * scale);

  canvas.width = width;
  canvas.height = height;

  const qrCardSize = px(1592);
  const qrInset = px(136);
  const qrZonePadding = px(54);
  const qrZoneHeight = qrCardSize + qrZonePadding * 2;
  const qrDataUrl = await QRCode.toDataURL(value, {
    ...qrCodeOptions,
    width: qrCardSize - qrInset * 2,
  });
  const qrImage = await loadImage(qrDataUrl);

  context.clearRect(0, 0, width, height);
  drawPosterBackground(context, width, height, px);

  context.textAlign = 'center';
  context.textBaseline = 'alphabetic';
  const logoImage = await loadImage('/konatech-logo.png');
  let currentY = px(410);

  const headerSection = drawHeader(context, width, currentY, logoImage, px);
  currentY += headerSection.height + px(220);

  const instructionSection = drawInstruction(context, width, currentY, px);
  currentY += instructionSection.height + px(150);

  drawQRCode(
    context,
    {
      centerX: width / 2,
      qrCardSize,
      qrImage,
      qrInset,
      zoneHeight: qrZoneHeight,
      zoneTopY: currentY,
    },
    px,
  );

  return canvas.toDataURL('image/png');
}

function dataUrlToBytes(dataUrl: string) {
  const base64Data = dataUrl.split(',')[1] ?? '';
  const binaryString = window.atob(base64Data);
  const bytes = new Uint8Array(binaryString.length);

  for (let index = 0; index < binaryString.length; index += 1) {
    bytes[index] = binaryString.charCodeAt(index);
  }

  return bytes;
}

function createPosterPdfBlob(jpegDataUrl: string) {
  const encoder = new TextEncoder();
  const imageBytes = dataUrlToBytes(jpegDataUrl);
  const pageWidth = 595.28;
  const pageHeight = 841.89;
  const content = [
    'q',
    `${pageWidth.toFixed(2)} 0 0 ${pageHeight.toFixed(2)} 0 0 cm`,
    '/Im0 Do',
    'Q',
  ].join('\n');
  const contentBytes = encoder.encode(content);
  const chunks: ArrayBuffer[] = [];
  const offsets: number[] = [];
  let byteLength = 0;

  function toArrayBuffer(bytes: Uint8Array) {
    const copy = new Uint8Array(bytes.byteLength);

    copy.set(bytes);

    return copy.buffer;
  }

  function append(value: string | Uint8Array) {
    const chunk = typeof value === 'string' ? encoder.encode(value) : value;
    chunks.push(toArrayBuffer(chunk));
    byteLength += chunk.length;
  }

  function appendObject(objectNumber: number, value: string | Uint8Array) {
    offsets[objectNumber] = byteLength;
    append(`${objectNumber} 0 obj\n`);
    append(value);
    append('\nendobj\n');
  }

  append('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
  appendObject(1, '<< /Type /Catalog /Pages 2 0 R >>');
  appendObject(2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
  appendObject(
    3,
    [
      '<< /Type /Page',
      '/Parent 2 0 R',
      `/MediaBox [0 0 ${pageWidth.toFixed(2)} ${pageHeight.toFixed(2)}]`,
      '/Resources << /XObject << /Im0 4 0 R >> >>',
      '/Contents 5 0 R',
      '>>',
    ].join('\n'),
  );

  offsets[4] = byteLength;
  append('4 0 obj\n');
  append(
    [
      '<< /Type /XObject',
      '/Subtype /Image',
      `/Width ${a4PosterDimensions.width}`,
      `/Height ${a4PosterDimensions.height}`,
      '/ColorSpace /DeviceRGB',
      '/BitsPerComponent 8',
      '/Filter /DCTDecode',
      `/Length ${imageBytes.length}`,
      '>>',
      'stream',
      '',
    ].join('\n'),
  );
  append(imageBytes);
  append('\nendstream\nendobj\n');

  appendObject(
    5,
    `<< /Length ${contentBytes.length} >>\nstream\n${content}\nendstream`,
  );

  const xrefOffset = byteLength;
  append(`xref\n0 6\n${'0'.repeat(10)} 65535 f \n`);

  for (let objectNumber = 1; objectNumber <= 5; objectNumber += 1) {
    append(`${String(offsets[objectNumber]).padStart(10, '0')} 00000 n \n`);
  }

  append(
    [
      'trailer',
      '<< /Size 6 /Root 1 0 R >>',
      'startxref',
      String(xrefOffset),
      '%%EOF',
      '',
    ].join('\n'),
  );

  return new Blob(chunks, { type: 'application/pdf' });
}

export function AttendanceEntryQrCard({
  attendanceEntryPath,
  initialAttendanceEntryUrl,
}: AttendanceEntryQrCardProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [attendanceEntryUrl, setAttendanceEntryUrl] = useState(
    initialAttendanceEntryUrl,
  );
  const [feedback, setFeedback] = useState<FeedbackState>(null);
  const [isQrReady, setIsQrReady] = useState(false);

  useEffect(() => {
    setAttendanceEntryUrl(
      normalizeAttendanceEntryUrl(
        initialAttendanceEntryUrl,
        attendanceEntryPath,
      ),
    );
  }, [attendanceEntryPath, initialAttendanceEntryUrl]);

  useEffect(() => {
    const canvas = canvasRef.current;

    if (!canvas) {
      return;
    }

    let isMounted = true;

    setIsQrReady(false);

    renderQrPoster(canvas, attendanceEntryUrl, previewPosterDimensions)
      .then(() => {
        if (!isMounted) {
          return;
        }

        setIsQrReady(true);
      })
      .catch(() => {
        if (!isMounted) {
          return;
        }

        setFeedback({
          tone: 'error',
          message:
            "Le QR code n'a pas pu etre genere. Le lien reste visible ci-dessous.",
        });
      });

    return () => {
      isMounted = false;
    };
  }, [attendanceEntryUrl]);

  async function createQrPosterPdfBlob() {
    const exportCanvas = document.createElement('canvas');
    await renderQrPoster(exportCanvas, attendanceEntryUrl, a4PosterDimensions);

    return createPosterPdfBlob(exportCanvas.toDataURL('image/jpeg', 0.98));
  }

  async function handleDownloadPdf() {
    try {
      const pdfBlob = await createQrPosterPdfBlob();
      const downloadUrl = URL.createObjectURL(pdfBlob);
      const downloadLink = document.createElement('a');

      downloadLink.href = downloadUrl;
      downloadLink.download = 'konatech-attendance-entry-qr-poster.pdf';
      document.body.appendChild(downloadLink);
      downloadLink.click();
      downloadLink.remove();
      URL.revokeObjectURL(downloadUrl);

      setFeedback({
        tone: 'success',
        message: 'Le poster QR premium a ete telecharge.',
      });
    } catch {
      setFeedback({
        tone: 'error',
        message:
          'Le telechargement PDF a echoue. Reessayez depuis ce navigateur.',
      });
    }
  }

  return (
    <Card className="w-full overflow-hidden rounded-[30px] border-slate-200/80 bg-white/95">
      <CardHeader className="space-y-3 border-b border-slate-200/70 pb-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-2">
            <Badge variant="outline">QR officiel</Badge>
            <div className="space-y-1">
              <CardTitle className="text-xl sm:text-2xl">Pointage QR</CardTitle>
              <p className="max-w-xl text-sm leading-5 text-slate-600">
                Poster PDF officiel pour le pointage sur site.
              </p>
            </div>
          </div>

          <div className="inline-flex items-center gap-3 rounded-full border border-accent/15 bg-accent/10 px-4 py-2 shadow-sm">
            <span className="h-2.5 w-2.5 rounded-full bg-accent" />
            <span className="text-sm font-medium text-accent">
              Diffusion sur site
            </span>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4 pt-4">
        <div className="relative overflow-hidden rounded-[26px] border border-accent/15 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(255,248,244,0.92))] p-4 shadow-sm sm:p-5">
          <div className="pointer-events-none absolute -right-12 top-0 h-32 w-32 rounded-full bg-accent/10 blur-2xl" />
          <div className="pointer-events-none absolute -left-10 bottom-0 h-24 w-24 rounded-full bg-primary/10 blur-2xl" />

          <div className="relative mx-auto flex w-full max-w-[440px] flex-col items-center gap-4 rounded-[28px] border border-slate-200/90 bg-[linear-gradient(180deg,rgba(255,255,255,0.99),rgba(248,250,252,0.96))] px-4 py-5 text-center shadow-[0_18px_40px_rgba(15,45,58,0.08)]">
            <div className="inline-flex items-center gap-2 rounded-full border border-accent/15 bg-accent/10 px-3 py-1.5">
              <span className="h-2 w-2 rounded-full bg-accent" />
              <span className="text-xs font-semibold uppercase tracking-[0.14em] text-accent">
                Poster officiel
              </span>
            </div>

            <div className="w-full rounded-[30px] border border-accent/20 bg-white p-3 shadow-[0_14px_32px_rgba(15,45,58,0.10)]">
              <canvas
                ref={canvasRef}
                aria-busy={!isQrReady}
                aria-label="QR code pour ouvrir la page fixe de pointage"
                className="mx-auto block h-auto w-full max-w-[390px]"
              />
            </div>

            <p className="max-w-xs text-sm leading-5 text-slate-600">
              Apercu du poster officiel exporte en PDF premium.
            </p>
          </div>
        </div>

        {feedback ? (
          <div
            className={
              feedback.tone === 'error'
                ? 'rounded-[20px] border border-accent/15 bg-accent/10 px-4 py-3 text-sm font-medium text-accent'
                : 'rounded-[20px] border border-success/15 bg-success/10 px-4 py-3 text-sm font-medium text-success'
            }
          >
            {feedback.message}
          </div>
        ) : null}

        <div className="grid gap-3">
          <Button
            className="w-full"
            disabled={!isQrReady}
            onClick={handleDownloadPdf}
            type="button"
          >
            Telecharger le QR Code
          </Button>
        </div>

        <div className="rounded-[20px] border border-slate-200 bg-slate-50/80 p-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                Lien de pointage
              </p>
              <p className="text-sm leading-5 text-slate-600">
                URL publique du poster.
              </p>
            </div>
            <a
              className="block break-all rounded-[18px] border border-white/70 bg-white px-4 py-3 text-sm font-medium leading-7 text-primary transition duration-200 hover:-translate-y-0.5 hover:shadow-sm"
              href={attendanceEntryUrl}
              rel="noreferrer"
              target="_blank"
            >
              {attendanceEntryUrl}
            </a>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
