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
  margin: 2,
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
  context.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  context.lineTo(x + radius, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - radius);
  context.lineTo(x, y + radius);
  context.quadraticCurveTo(x, y, x + radius, y);
  context.closePath();
}

function drawDiamond(
  context: CanvasRenderingContext2D,
  centerX: number,
  centerY: number,
  size: number,
) {
  context.beginPath();
  context.moveTo(centerX, centerY - size);
  context.lineTo(centerX + size, centerY);
  context.lineTo(centerX, centerY + size);
  context.lineTo(centerX - size, centerY);
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
  visibleLines[maxLines - 1] = clampTextToWidth(
    context,
    hiddenTail,
    maxWidth,
  );

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
    Number.parseInt(font.match(/(\d+)px/) ? font.match(/(\d+)px/)![1] : '16', 10) ||
    16;
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
      lines.length === 0
        ? 0
        : metrics.height + (lines.length - 1) * lineHeight,
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
  px: (value: number) => number,
) {
  const monogramSize = px(178);
  const monogramGap = px(34);
  const monogramX = width / 2 - monogramSize / 2;

  context.save();
  drawRoundedRect(
    context,
    monogramX,
    currentY,
    monogramSize,
    monogramSize,
    px(54),
  );
  context.fillStyle = posterPalette.surface;
  context.shadowColor = 'rgba(15,45,58,0.10)';
  context.shadowBlur = px(36);
  context.shadowOffsetY = px(16);
  context.fill();
  context.restore();

  context.save();
  drawRoundedRect(
    context,
    monogramX,
    currentY,
    monogramSize,
    monogramSize,
    px(54),
  );
  const monogramGradient = context.createLinearGradient(
    monogramX,
    currentY,
    monogramX,
    currentY + monogramSize,
  );
  monogramGradient.addColorStop(0, posterPalette.accent);
  monogramGradient.addColorStop(1, posterPalette.accentDeep);
  context.fillStyle = monogramGradient;
  context.fill();
  context.strokeStyle = posterPalette.accentBorder;
  context.lineWidth = px(5);
  context.stroke();
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillStyle = posterPalette.surface;
  context.font = `800 ${px(88)}px "Poppins", "Segoe UI", Arial, sans-serif`;
  context.fillText('K', width / 2, currentY + monogramSize / 2 + px(4));
  context.restore();

  const brandTopY = currentY + monogramSize + monogramGap;
  const primaryLayout = drawTextBlock(context, {
    centerX: width / 2,
    fillStyle: posterPalette.text,
    font: `800 ${px(70)}px "Poppins", "Segoe UI", Arial, sans-serif`,
    lineHeight: px(78),
    maxLines: 1,
    maxWidth: width - px(260),
    topY: brandTopY,
    tracking: px(12),
    value: 'KONATECH',
  });
  const secondaryTopY = brandTopY + primaryLayout.height + px(10);
  const secondaryLayout = drawTextBlock(context, {
    centerX: width / 2,
    fillStyle: posterPalette.accent,
    font: `700 ${px(42)}px "Inter", "Segoe UI", Arial, sans-serif`,
    lineHeight: px(50),
    maxLines: 1,
    maxWidth: width - px(360),
    topY: secondaryTopY,
    tracking: px(10),
    value: 'ATTENDANCE',
  });

  return {
    height:
      monogramSize +
      monogramGap +
      primaryLayout.height +
      px(10) +
      secondaryLayout.height,
  };
}

function drawTitle(
  context: CanvasRenderingContext2D,
  width: number,
  currentY: number,
  px: (value: number) => number,
) {
  const lineGap = px(8);
  const firstLineLayout = drawTextBlock(context, {
    centerX: width / 2,
    fillStyle: posterPalette.text,
    font: `800 ${px(138)}px "Poppins", "Segoe UI", Arial, sans-serif`,
    lineHeight: px(146),
    maxLines: 1,
    maxWidth: width - px(280),
    topY: currentY,
    value: 'POINTAGE',
  });
  const secondLineTopY = currentY + firstLineLayout.height + lineGap;
  const secondLineLayout = drawTextBlock(context, {
    centerX: width / 2,
    fillStyle: posterPalette.accent,
    font: `800 ${px(138)}px "Poppins", "Segoe UI", Arial, sans-serif`,
    lineHeight: px(146),
    maxLines: 1,
    maxWidth: width - px(280),
    topY: secondLineTopY,
    value: 'NUM\u00c9RIQUE',
  });
  const dividerY = secondLineTopY + secondLineLayout.height + px(34);
  const sideLineWidth = px(248);
  const lineHeight = px(8);
  const diamondSize = px(12);

  context.fillStyle = posterPalette.accent;
  context.fillRect(
    width / 2 - sideLineWidth - px(32),
    dividerY,
    sideLineWidth,
    lineHeight,
  );
  context.fillRect(width / 2 + px(32), dividerY, sideLineWidth, lineHeight);
  drawDiamond(context, width / 2, dividerY + lineHeight / 2, diamondSize);
  context.fill();

  return {
    height: dividerY - currentY + lineHeight,
  };
}

function drawSubtitle(
  context: CanvasRenderingContext2D,
  width: number,
  currentY: number,
  px: (value: number) => number,
) {
  const layout = drawTextBlock(context, {
    centerX: width / 2,
    fillStyle: posterPalette.textSoft,
    font: `500 ${px(50)}px "Inter", "Segoe UI", Arial, sans-serif`,
    lineHeight: px(64),
    maxLines: 2,
    maxWidth: width - px(360),
    topY: currentY,
    value: 'Scannez ce QR Code pour enregistrer votre pr\u00e9sence',
  });

  return {
    height: layout.height,
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
  const qrFrameY = zoneTopY + Math.max(0, Math.round((zoneHeight - qrCardSize) / 2));
  const qrVisualSize = qrCardSize - qrInset * 2;

  context.save();
  context.shadowColor = 'rgba(15,45,58,0.14)';
  context.shadowBlur = px(72);
  context.shadowOffsetY = px(26);
  drawRoundedRect(context, qrFrameX, qrFrameY, qrCardSize, qrCardSize, px(72));
  context.fillStyle = posterPalette.surface;
  context.fill();
  context.restore();

  context.save();
  drawRoundedRect(context, qrFrameX, qrFrameY, qrCardSize, qrCardSize, px(72));
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

  drawRoundedRect(context, qrFrameX, qrFrameY, qrCardSize, qrCardSize, px(72));
  context.strokeStyle = posterPalette.accent;
  context.lineWidth = px(10);
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

function drawBadge(
  context: CanvasRenderingContext2D,
  width: number,
  currentY: number,
  px: (value: number) => number,
) {
  const badgeWidth = px(660);
  const badgeHeight = px(112);
  const badgeX = width / 2 - badgeWidth / 2;
  const shieldSize = px(28);
  const shieldCenterX = badgeX + px(84);
  const shieldCenterY = currentY + badgeHeight / 2;

  context.save();
  drawRoundedRect(context, badgeX, currentY, badgeWidth, badgeHeight, px(44));
  context.fillStyle = posterPalette.accent;
  context.shadowColor = 'rgba(244,110,40,0.22)';
  context.shadowBlur = px(30);
  context.shadowOffsetY = px(14);
  context.fill();
  context.restore();

  context.save();
  context.beginPath();
  context.moveTo(shieldCenterX, shieldCenterY - shieldSize);
  context.lineTo(shieldCenterX + shieldSize * 0.78, shieldCenterY - shieldSize * 0.42);
  context.lineTo(shieldCenterX + shieldSize * 0.64, shieldCenterY + shieldSize * 0.44);
  context.quadraticCurveTo(
    shieldCenterX,
    shieldCenterY + shieldSize * 1.1,
    shieldCenterX - shieldSize * 0.64,
    shieldCenterY + shieldSize * 0.44,
  );
  context.lineTo(shieldCenterX - shieldSize * 0.78, shieldCenterY - shieldSize * 0.42);
  context.closePath();
  context.fillStyle = posterPalette.surface;
  context.fill();

  context.beginPath();
  context.moveTo(shieldCenterX, shieldCenterY - shieldSize * 0.54);
  context.lineTo(shieldCenterX + shieldSize * 0.34, shieldCenterY - shieldSize * 0.14);
  context.lineTo(shieldCenterX + shieldSize * 0.24, shieldCenterY + shieldSize * 0.24);
  context.quadraticCurveTo(
    shieldCenterX,
    shieldCenterY + shieldSize * 0.54,
    shieldCenterX - shieldSize * 0.24,
    shieldCenterY + shieldSize * 0.24,
  );
  context.lineTo(shieldCenterX - shieldSize * 0.34, shieldCenterY - shieldSize * 0.14);
  context.closePath();
  context.fillStyle = 'rgba(244,110,40,0.22)';
  context.fill();
  context.restore();

  const badgeLabelLayout = measureTextLayout(context, {
    font: `800 ${px(38)}px "Inter", "Segoe UI", Arial, sans-serif`,
    lineHeight: px(44),
    maxLines: 1,
    maxWidth: badgeWidth - px(190),
    value: 'ACC\u00c8S S\u00c9CURIS\u00c9',
  });
  const badgeLabelTopY =
    currentY + Math.round((badgeHeight - badgeLabelLayout.height) / 2);

  drawTextBlock(context, {
    centerX: badgeX + px(382),
    fillStyle: posterPalette.surface,
    font: `800 ${px(38)}px "Inter", "Segoe UI", Arial, sans-serif`,
    lineHeight: px(44),
    maxLines: 1,
    maxWidth: badgeWidth - px(190),
    topY: badgeLabelTopY,
    value: 'ACC\u00c8S S\u00c9CURIS\u00c9',
  });

  return {
    height: badgeHeight,
  };
}

function drawFooter(
  context: CanvasRenderingContext2D,
  width: number,
  currentY: number,
  sectionHeight: number,
  px: (value: number) => number,
) {
  const footerBottomY = currentY + sectionHeight;
  const footerTopY = currentY + Math.max(0, sectionHeight - px(392));

  context.save();
  context.beginPath();
  context.moveTo(0, footerTopY + px(84));
  context.quadraticCurveTo(
    width * 0.22,
    footerTopY - px(8),
    width * 0.52,
    footerTopY + px(66),
  );
  context.quadraticCurveTo(
    width * 0.82,
    footerTopY + px(142),
    width,
    footerTopY + px(18),
  );
  context.lineTo(width, footerBottomY);
  context.lineTo(0, footerBottomY);
  context.closePath();
  const footerGradient = context.createLinearGradient(0, footerTopY, 0, footerBottomY);
  footerGradient.addColorStop(0, posterPalette.accent);
  footerGradient.addColorStop(1, posterPalette.accentDeep);
  context.fillStyle = footerGradient;
  context.shadowColor = 'rgba(244,110,40,0.12)';
  context.shadowBlur = px(40);
  context.shadowOffsetY = -px(6);
  context.fill();
  context.restore();

  const accessLayout = measureTextLayout(context, {
    font: `600 ${px(34)}px "Inter", "Segoe UI", Arial, sans-serif`,
    lineHeight: px(42),
    maxLines: 2,
    maxWidth: width - px(380),
    value: 'Acc\u00e8s r\u00e9serv\u00e9 au personnel autoris\u00e9',
  });
  const topY = footerTopY + px(152);

  drawTextBlock(context, {
    centerX: width / 2,
    fillStyle: posterPalette.surface,
    font: `600 ${px(34)}px "Inter", "Segoe UI", Arial, sans-serif`,
    lineHeight: px(42),
    maxLines: 2,
    maxWidth: width - px(380),
    topY,
    value: 'Acc\u00e8s r\u00e9serv\u00e9 au personnel autoris\u00e9',
  });
  drawTextBlock(context, {
    centerX: width / 2,
    fillStyle: posterPalette.surface,
    font: `700 ${px(42)}px "Poppins", "Segoe UI", Arial, sans-serif`,
    lineHeight: px(50),
    maxLines: 1,
    maxWidth: width - px(360),
    topY: topY + accessLayout.height + px(14),
    value: 'Konatech Attendance',
  });

  return {
    height: sectionHeight,
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

  const qrCardSize = px(1460);
  const qrInset = px(132);
  const qrZonePadding = px(74);
  const qrZoneHeight = qrCardSize + qrZonePadding * 2;
  const sectionSpacing = px(58);
  const qrDataUrl = await QRCode.toDataURL(value, {
    ...qrCodeOptions,
    width: qrCardSize - qrInset * 2,
  });
  const qrImage = await loadImage(qrDataUrl);

  context.clearRect(0, 0, width, height);
  drawPosterBackground(context, width, height, px);

  context.textAlign = 'center';
  context.textBaseline = 'alphabetic';
  const headerPreviewLayout = measureTextLayout(context, {
    font: `800 ${px(70)}px "Poppins", "Segoe UI", Arial, sans-serif`,
    lineHeight: px(78),
    maxLines: 1,
    maxWidth: width - px(260),
    value: 'KONATECH',
  });
  const headerBaselineAnchor = px(220);
  let currentY = headerBaselineAnchor - headerPreviewLayout.metrics.ascent;

  const headerSection = drawHeader(context, width, currentY, px);
  currentY += headerSection.height + sectionSpacing;

  const titleSection = drawTitle(context, width, currentY, px);
  currentY += titleSection.height + sectionSpacing;

  const subtitleSection = drawSubtitle(context, width, currentY, px);
  currentY += subtitleSection.height + sectionSpacing;

  const qrSection = drawQRCode(
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
  currentY += qrSection.height + sectionSpacing;

  const badgeSection = drawBadge(context, width, currentY, px);
  currentY += badgeSection.height + sectionSpacing;

  const footerHeight = Math.max(0, height - currentY);
  drawFooter(context, width, currentY, footerHeight, px);

  return canvas.toDataURL('image/png');
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

  async function createQrDataUrl() {
    const exportCanvas = document.createElement('canvas');

    return renderQrPoster(exportCanvas, attendanceEntryUrl, a4PosterDimensions);
  }

  async function handleDownloadPng() {
    try {
      const dataUrl = await createQrDataUrl();
      const downloadLink = document.createElement('a');

      downloadLink.href = dataUrl;
      downloadLink.download = 'konatech-attendance-entry-qr.png';
      document.body.appendChild(downloadLink);
      downloadLink.click();
      downloadLink.remove();

      setFeedback({
        tone: 'success',
        message: 'Le QR code a ete telecharge au format PNG.',
      });
    } catch {
      setFeedback({
        tone: 'error',
        message:
          'Le telechargement PNG a echoue. Reessayez depuis ce navigateur.',
      });
    }
  }

  return (
    <Card className="w-full overflow-hidden rounded-[30px] border-slate-200/80 bg-white/95">
      <CardHeader className="space-y-4 border-b border-slate-200/70 pb-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-2">
            <Badge variant="outline">QR officiel</Badge>
            <div className="space-y-1">
              <CardTitle className="text-2xl sm:text-3xl">
                Pointage QR
              </CardTitle>
              <p className="max-w-xl text-sm leading-5 text-slate-600">
                Un seul QR pour l entree et la sortie.
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

      <CardContent className="space-y-5 pt-5">
        <div className="grid gap-5 xl:grid-cols-[0.96fr_1.04fr]">
          <div className="rounded-[26px] border border-slate-200 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.94))] p-5 shadow-sm">
            <div className="flex h-full flex-col justify-between gap-5">
              <div className="space-y-4">
                <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5">
                  <span className="h-2 w-2 rounded-full bg-success" />
                  <span className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-600">
                    Outil de pointage sur site
                  </span>
                </div>

                <div className="space-y-3">
                  <p className="text-3xl font-semibold leading-tight text-slate-950">
                    Pret a afficher.
                  </p>
                  <p className="text-sm leading-5 text-slate-600">
                    Accueil, hall ou tablette fixe.
                  </p>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-1">
                <div className="rounded-[18px] border border-white/70 bg-white/85 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                    Usage
                  </p>
                  <p className="mt-2 text-sm leading-5 text-slate-600">
                    Scan direct mobile.
                  </p>
                </div>
                <div className="rounded-[18px] border border-white/70 bg-white/85 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                    Support
                  </p>
                  <p className="mt-2 text-sm leading-5 text-slate-600">
                    PNG HD pret a imprimer.
                  </p>
                </div>
                <div className="rounded-[18px] border border-white/70 bg-white/85 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                    Securite
                  </p>
                  <p className="mt-2 text-sm leading-5 text-slate-600">
                    Ouvre le flux existant.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="relative overflow-hidden rounded-[26px] border border-accent/15 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(255,248,244,0.92))] p-5 shadow-sm">
            <div className="pointer-events-none absolute -right-12 top-0 h-32 w-32 rounded-full bg-accent/10 blur-2xl" />
            <div className="pointer-events-none absolute -left-10 bottom-0 h-24 w-24 rounded-full bg-primary/10 blur-2xl" />

            <div className="relative mx-auto flex w-full max-w-[380px] flex-col items-center gap-4 rounded-[28px] border border-slate-200/90 bg-[linear-gradient(180deg,rgba(255,255,255,0.99),rgba(248,250,252,0.96))] px-4 py-5 text-center shadow-[0_18px_40px_rgba(15,45,58,0.08)]">
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
                  className="mx-auto block h-auto w-full max-w-[340px]"
                />
              </div>

              <p className="max-w-xs text-sm leading-5 text-slate-600">
                Meme rendu en apercu et en export.
              </p>
            </div>
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

        <div className="grid gap-3 sm:max-w-md">
          <Button
            className="w-full"
            disabled={!isQrReady}
            onClick={handleDownloadPng}
            type="button"
          >
            Telecharger le QR Code
          </Button>
        </div>

        <div className="rounded-[24px] border border-slate-200 bg-[linear-gradient(180deg,rgba(248,250,252,0.95),rgba(255,255,255,0.98))] p-4">
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
