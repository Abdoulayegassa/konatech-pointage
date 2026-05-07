import { Injectable, Logger } from '@nestjs/common';
import {
  AttendanceExportFile,
  MonthlyAttendanceDailyReportRow,
  MonthlyAttendanceEmployeeReport,
  MonthlyAttendanceExportReport,
  MonthlyAttendanceExportRow,
} from './monthly-attendance-export.types';
import { MonthlyAttendancePuppeteerPdfRendererService } from './monthly-attendance-puppeteer-pdf-renderer.service';

type RgbColor = readonly [number, number, number];
type MetricTone = 'positive' | 'warning' | 'critical' | 'neutral';
type PdfTextOptions = {
  maxWidth?: number;
  lineHeight?: number;
  maxLines?: number;
};
type KpiCardVariant =
  | 'default'
  | 'critical'
  | 'success'
  | 'warning'
  | 'neutral';
type KpiCardAlign = 'left' | 'center';
type RenderKpiCardOptions = {
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
  value: string;
  description?: string;
  accentColor?: RgbColor;
  backgroundColor?: RgbColor;
  borderColor?: RgbColor;
  valueColor?: RgbColor;
  labelColor?: RgbColor;
  descriptionColor?: RgbColor;
  align?: KpiCardAlign;
  descriptionAlign?: KpiCardAlign;
  variant?: KpiCardVariant;
  cardPadding?: number;
  labelFontSize?: number;
  labelMaxLines?: number;
  labelTopOffset?: number;
  valueFontSize?: number;
  valueTopOffset?: number;
  descriptionFontSize?: number;
  valueMaxLines?: number;
  descriptionMaxLines?: number;
  descriptionTopOffset?: number;
  progressRatio?: number;
};
type KpiGridCard = Omit<RenderKpiCardOptions, 'x' | 'y' | 'width' | 'height'>;
type RenderKpiGridOptions = {
  startX: number;
  startY: number;
  columns: number;
  cardWidth: number;
  cardHeight: number;
  gapX: number;
  gapY: number;
};

@Injectable()
export class MonthlyAttendancePdfExporterService {
  private readonly logger = new Logger(MonthlyAttendancePdfExporterService.name);

  constructor(
    private readonly puppeteerPdfRenderer: MonthlyAttendancePuppeteerPdfRendererService,
  ) {}

  private readonly landscapePageWidth = 842;
  private readonly landscapePageHeight = 595;
  private readonly portraitPageWidth = 595;
  private readonly portraitPageHeight = 842;
  private readonly PAGE_MARGIN = 32;
  private readonly REPORT_PAGE_PADDING = 40;
  private readonly SECTION_GAP = 18;
  private readonly CARD_GAP = 18;
  private readonly CARD_PADDING = 8;
  private readonly margin = this.PAGE_MARGIN;
  private readonly LINE_GAP = 10;
  private readonly rowsPerEmployeeTablePage = 18;
  private readonly rowsPerTeamTablePage = 17;
  private currentPageFormat: 'landscape' | 'portrait' = 'landscape';
  private readonly green = [0.086, 0.639, 0.4] as const;
  private readonly greenSoft = [0.929, 0.98, 0.953] as const;
  private readonly orange = [0.953, 0.431, 0.141] as const;
  private readonly orangeSoft = [0.996, 0.961, 0.929] as const;
  private readonly red = [0.863, 0.196, 0.184] as const;
  private readonly redSoft = [0.996, 0.941, 0.941] as const;
  private readonly blue = [0.145, 0.388, 0.922] as const;
  private readonly indigo = [0.31, 0.275, 0.898] as const;
  private readonly slate900 = [0.098, 0.133, 0.196] as const;
  private readonly slate700 = [0.278, 0.333, 0.412] as const;
  private readonly slate500 = [0.475, 0.529, 0.604] as const;
  private readonly slate300 = [0.824, 0.859, 0.898] as const;
  private readonly slate100 = [0.953, 0.965, 0.976] as const;
  private readonly white = [1, 1, 1] as const;
  private readonly COLORS = {
    accent: this.orange,
    accentSoft: this.orangeSoft,
    success: this.green,
    successSoft: this.greenSoft,
    critical: this.red,
    criticalSoft: this.redSoft,
    textStrong: this.slate900,
    text: this.slate700,
    textMuted: this.slate500,
    border: this.slate300,
    surface: this.white,
    surfaceMuted: this.slate100,
  } as const;
  private readonly FONT_SIZES = {
    overline: 8,
    body: 8.5,
    label: 8,
    title: 24,
    sectionTitle: 14,
    sectionSubtitle: 9,
    tableHeader: 8.5,
    tableBody: 8.5,
    score: 34,
  } as const;
  private readonly frenchMonthLabels = [
    'janvier',
    'février',
    'mars',
    'avril',
    'mai',
    'juin',
    'juillet',
    'août',
    'septembre',
    'octobre',
    'novembre',
    'décembre',
  ] as const;

  private get pageWidth() {
    return this.currentPageFormat === 'portrait'
      ? this.portraitPageWidth
      : this.landscapePageWidth;
  }

  private get pageHeight() {
    return this.currentPageFormat === 'portrait'
      ? this.portraitPageHeight
      : this.landscapePageHeight;
  }

  private get CONTENT_WIDTH() {
    return this.pageWidth - this.PAGE_MARGIN * 2;
  }

  async export(
    report: MonthlyAttendanceExportReport,
  ): Promise<AttendanceExportFile> {
    const fileName = this.buildFileName(report);
    const rendererMode = this.getRendererMode();
    const reportType = this.getReportType(report);

    if (rendererMode === 'legacy') {
      const startedAt = Date.now();
      this.logger.log(
        `Monthly attendance PDF export started (renderer=legacy, reportType=${reportType}, fileName=${fileName}).`,
      );
      this.logger.warn(
        'ATTENDANCE_PDF_RENDERER=legacy is enabled. Using the legacy low-level PDF generator for monthly attendance export.',
      );
      const pdf = this.buildLegacyPdf(report);
      const durationMs = Date.now() - startedAt;

      this.logger.log(
        `Monthly attendance PDF export completed (renderer=legacy, reportType=${reportType}, durationMs=${durationMs}, pdfBytes=${pdf.length}, fileName=${fileName}).`,
      );

      return {
        fileName,
        mimeType: 'application/pdf',
        content: pdf,
      };
    }

    const startedAt = Date.now();

    this.logger.log(
      `Monthly attendance PDF export started (renderer=puppeteer, reportType=${reportType}, fileName=${fileName}).`,
    );

    try {
      const pdf = await this.puppeteerPdfRenderer.render(report);
      const durationMs = Date.now() - startedAt;

      this.logger.log(
        `Monthly attendance PDF export completed (renderer=puppeteer, reportType=${reportType}, durationMs=${durationMs}, pdfBytes=${pdf.length}, fileName=${fileName}).`,
      );

      return {
        fileName,
        mimeType: 'application/pdf',
        content: pdf,
      };
    } catch (error) {
      const stack = error instanceof Error ? error.stack : undefined;
      const message =
        error instanceof Error ? error.message : 'Unknown Puppeteer error';

      this.logger.error(
        `Puppeteer renderer failed for monthly attendance export: ${message}`,
        stack,
      );
      this.logger.warn(
        `Puppeteer renderer failed, falling back to legacy PDF renderer (reportType=${reportType}, fileName=${fileName}).`,
      );
      const fallbackStartedAt = Date.now();
      const pdf = this.buildLegacyPdf(report);
      const fallbackDurationMs = Date.now() - fallbackStartedAt;

      this.logger.log(
        `Monthly attendance PDF export completed (renderer=legacy-fallback, reportType=${reportType}, durationMs=${fallbackDurationMs}, pdfBytes=${pdf.length}, fileName=${fileName}).`,
      );

      return {
        fileName,
        mimeType: 'application/pdf',
        content: pdf,
      };
    }
  }

  // Legacy renderer kept as a controlled fallback while the Puppeteer path
  // becomes the default engine for monthly attendance exports.
  private buildLegacyPdf(report: MonthlyAttendanceExportReport) {
    const previousPageFormat = this.currentPageFormat;
    this.currentPageFormat = report.employeeReport ? 'portrait' : 'landscape';

    try {
      const pageContents = report.employeeReport
        ? this.buildEmployeeReportPages(report, report.employeeReport)
        : this.buildTeamReportPages(report);
      const pageCount = pageContents.length || 1;
      const regularFontObjectId = 3;
      const boldFontObjectId = 4;
      const pageObjectStartId = 5;
      const contentObjectStartId = pageObjectStartId + pageCount;
      const objects = new Map<number, Buffer>();
      const pageObjectIds = Array.from(
        { length: pageCount },
        (_, index) => pageObjectStartId + index,
      );

      objects.set(1, this.toBuffer('<< /Type /Catalog /Pages 2 0 R >>'));
      objects.set(
        2,
        this.toBuffer(
          `<< /Type /Pages /Kids [${pageObjectIds
            .map((id) => `${id} 0 R`)
            .join(' ')}] /Count ${pageCount} >>`,
        ),
      );
      objects.set(
        regularFontObjectId,
        this.toBuffer(
          '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
        ),
      );
      objects.set(
        boldFontObjectId,
        this.toBuffer(
          '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>',
        ),
      );

      for (let index = 0; index < pageCount; index += 1) {
        const pageObjectId = pageObjectStartId + index;
        const contentObjectId = contentObjectStartId + index;
        const content = this.toBuffer(pageContents[index] ?? '');

        objects.set(
          pageObjectId,
          this.toBuffer(
            `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${this.pageWidth} ${this.pageHeight}] /Resources << /Font << /F1 ${regularFontObjectId} 0 R /F2 ${boldFontObjectId} 0 R >> >> /Contents ${contentObjectId} 0 R >>`,
          ),
        );
        objects.set(
          contentObjectId,
          Buffer.concat([
            this.toBuffer(`<< /Length ${content.length} >>\nstream\n`),
            content,
            this.toBuffer('\nendstream'),
          ]),
        );
      }

      return this.assemblePdf(objects);
    } finally {
      this.currentPageFormat = previousPageFormat;
    }
  }

  private getRendererMode() {
    return process.env.ATTENDANCE_PDF_RENDERER === 'legacy'
      ? 'legacy'
      : 'puppeteer';
  }

  private getReportType(report: MonthlyAttendanceExportReport) {
    return report.employeeReport ? 'single-employee' : 'team';
  }

  private buildEmployeeReportPages(
    report: MonthlyAttendanceExportReport,
    employeeReport: MonthlyAttendanceEmployeeReport,
  ) {
    const tableChunks = this.chunkRows(
      employeeReport.dailyRows,
      this.rowsPerEmployeeTablePage,
    );
    const effectiveTableChunks = tableChunks.length > 0 ? tableChunks : [[]];
    const totalPages = 1 + effectiveTableChunks.length;
    const pages = [
      this.buildEmployeeSummaryPage(employeeReport, 1, totalPages),
    ];

    effectiveTableChunks.forEach((rows, index) => {
      pages.push(
        this.buildEmployeeTablePage(
          report,
          employeeReport,
          rows,
          index + 2,
          totalPages,
        ),
      );
    });

    return pages;
  }

  private renderHeader({
    title,
    subtitle,
    meta,
    sideTitle,
    sideDetail,
    panelBottom,
    panelHeight,
  }: {
    title: string;
    subtitle: string;
    meta?: string;
    sideTitle?: string;
    sideDetail?: string;
    panelBottom: number;
    panelHeight: number;
  }) {
    const panelWidth = this.CONTENT_WIDTH;
    const sideWidth = sideTitle || sideDetail ? 190 : 0;
    const titleWidth = panelWidth - (sideWidth > 0 ? sideWidth + 28 : 0) - 32;

    return [
      this.pageHeaderBand(),
      this.panel(
        this.PAGE_MARGIN,
        panelBottom,
        panelWidth,
        panelHeight,
        this.COLORS.surfaceMuted,
        this.COLORS.border,
      ),
      this.filledRect(
        this.PAGE_MARGIN,
        panelBottom + panelHeight - 6,
        panelWidth,
        6,
        this.COLORS.accent,
      ),
      this.text(
        this.PAGE_MARGIN + 20,
        panelBottom + panelHeight - 22,
        'KONATECH ATTENDANCE',
        11,
        'F2',
        this.COLORS.accent,
      ),
      this.text(
        this.PAGE_MARGIN + 20,
        panelBottom + panelHeight - 48,
        title,
        this.FONT_SIZES.title,
        'F2',
        this.COLORS.textStrong,
        { maxWidth: titleWidth, maxLines: 1 },
      ),
      this.text(
        this.PAGE_MARGIN + 20,
        panelBottom + panelHeight - 68,
        subtitle,
        12,
        'F2',
        this.COLORS.text,
        { maxWidth: titleWidth, maxLines: 1 },
      ),
      meta
        ? this.text(
            this.PAGE_MARGIN + 20,
            panelBottom + 18,
            meta,
            9.25,
            'F1',
            this.COLORS.text,
            { maxWidth: titleWidth, maxLines: 1 },
          )
        : '',
      sideTitle || sideDetail
        ? this.panel(
            this.PAGE_MARGIN + panelWidth - sideWidth - 20,
            panelBottom + 16,
            sideWidth,
            panelHeight - 32,
            this.COLORS.surface,
            this.COLORS.border,
          )
        : '',
      sideTitle
        ? this.text(
            this.PAGE_MARGIN + panelWidth - sideWidth,
            panelBottom + panelHeight - 32,
            sideTitle,
            8.5,
            'F2',
            this.COLORS.textMuted,
            { maxWidth: sideWidth - 20, maxLines: 1 },
          )
        : '',
      sideDetail
        ? this.text(
            this.PAGE_MARGIN + panelWidth - sideWidth,
            panelBottom + panelHeight - 52,
            sideDetail,
            8.5,
            'F1',
            this.COLORS.text,
            { maxWidth: sideWidth - 20, maxLines: 3, lineHeight: 10.2 },
          )
        : '',
    ].join('');
  }

  private renderEmployeeInfoGrid(
    employeeReport: MonthlyAttendanceEmployeeReport,
    bottom: number,
  ) {
    const infoHeight = 64;
    const infoWidth = this.CONTENT_WIDTH;
    const columnWidth = infoWidth / 2;
    const rowHeight = infoHeight / 2;

    return [
      this.panel(
        this.PAGE_MARGIN,
        bottom,
        infoWidth,
        infoHeight,
        this.COLORS.surface,
        this.COLORS.border,
      ),
      this.horizontalLine(
        this.PAGE_MARGIN + 18,
        bottom + rowHeight,
        this.PAGE_MARGIN + infoWidth - 18,
        this.COLORS.border,
        0.8,
      ),
      this.verticalLine(
        this.PAGE_MARGIN + columnWidth,
        bottom + 14,
        bottom + infoHeight - 14,
        this.COLORS.border,
        0.8,
      ),
      this.labelValuePair(
        this.PAGE_MARGIN + 18,
        bottom + 44,
        columnWidth - 32,
        "Nom de l'employ\u00e9",
        employeeReport.fullName,
      ),
      this.labelValuePair(
        this.PAGE_MARGIN + 18,
        bottom + 8,
        columnWidth - 32,
        'Identifiant employe',
        employeeReport.employeeIdentifier,
      ),
      this.labelValuePair(
        this.PAGE_MARGIN + columnWidth + 18,
        bottom + 44,
        columnWidth - 32,
        'D\u00e9partement',
        employeeReport.departmentLabel,
      ),
      this.labelValuePair(
        this.PAGE_MARGIN + columnWidth + 18,
        bottom + 8,
        columnWidth - 32,
        'Planning',
        employeeReport.assignedScheduleLabel,
      ),
    ].join('');
  }

  private renderPerformanceScoreCard(
    x: number,
    y: number,
    width: number,
    height: number,
    score: number,
  ) {
    return this.renderKpiCard({
      x,
      y,
      width,
      height,
      label: 'SCORE DE PERFORMANCE',
      value: `${score} / 100`,
      description: this.performanceHeadline(score),
      variant: this.metricToneVariant(this.performanceTone(score)),
      align: 'center',
      descriptionAlign: 'center',
      cardPadding: 12,
      labelFontSize: 10,
      valueFontSize: 36,
      descriptionFontSize: 10,
      labelTopOffset: 12,
      valueTopOffset: 36,
      descriptionTopOffset: 62,
      descriptionMaxLines: 1,
      progressRatio: score / 100,
    });
  }

  private renderScoreCard(
    x: number,
    y: number,
    width: number,
    height: number,
    score: number,
  ) {
    return this.renderPerformanceScoreCard(x, y, width, height, score);
  }

  private renderSectionTitle({
    x,
    y,
    width,
    height,
    title,
    subtitle,
    tone = 'neutral',
  }: {
    x: number;
    y: number;
    width: number;
    height: number;
    title: string;
    subtitle?: string;
    tone?: MetricTone;
  }) {
    return this.sectionPanel(x, y, width, height, title, subtitle ?? '', tone);
  }

  private renderGpsGrid(
    cards: KpiGridCard[],
    startX: number,
    startY: number,
    cardWidth: number,
    cardHeight: number,
    gapX: number,
    gapY: number,
  ) {
    return this.renderKpiGrid(cards, {
      startX,
      startY,
      columns: 2,
      cardWidth,
      cardHeight,
      gapX,
      gapY,
    });
  }

  private renderInsightBlock({
    x,
    y,
    width,
    height,
    title,
    body,
    tone = 'neutral',
  }: {
    x: number;
    y: number;
    width: number;
    height: number;
    title: string;
    body: string;
    tone?: MetricTone;
  }) {
    const colors = this.toneColors(tone);

    return [
      this.panel(
        x,
        y,
        width,
        height,
        this.COLORS.surfaceMuted,
        this.COLORS.border,
      ),
      this.filledRect(x, y + height - 4, width, 4, colors.accent),
      this.text(
        x + 16,
        y + height - 18,
        title,
        9,
        'F2',
        this.COLORS.textStrong,
        {
          maxWidth: width - 32,
          maxLines: 1,
        },
      ),
      this.text(x + 16, y + height - 34, body, 8.5, 'F1', this.COLORS.text, {
        maxWidth: width - 32,
        maxLines: 3,
        lineHeight: 10.4,
      }),
    ].join('');
  }

  private renderDailyTable({
    rows,
    x,
    top,
    width,
  }: {
    rows: MonthlyAttendanceDailyReportRow[];
    x: number;
    top: number;
    width: number;
  }) {
    const tableWidth = width;
    const headerHeight = 30;
    const rowHeight = 28;
    const columnGap = 10;
    const tableLeft = x + 14;
    const rowCount = Math.max(1, rows.length);
    const columns = [
      { label: 'Date', width: 96 },
      { label: 'Entr\u00e9e', width: 64 },
      { label: 'Sortie', width: 64 },
      { label: 'Statut', width: 112 },
      { label: 'Retard', width: 68 },
      { label: 'Remarque', width: 280 },
    ].map((column, index, source) => {
      const x =
        index === 0
          ? tableLeft
          : source
              .slice(0, index)
              .reduce(
                (cursor, item) => cursor + item.width + columnGap,
                tableLeft,
              );

      return { ...column, x };
    });
    const tableHeight = headerHeight + rowCount * rowHeight;
    const tableY = this.bottomFromTop(top, tableHeight);
    const commands: string[] = [
      this.panel(
        x,
        tableY,
        tableWidth,
        tableHeight,
        this.COLORS.surface,
        this.COLORS.border,
      ),
      this.filledRect(
        x,
        tableY + tableHeight - headerHeight,
        tableWidth,
        headerHeight,
        this.COLORS.accentSoft,
      ),
      this.filledRect(
        x,
        tableY + tableHeight - 3,
        tableWidth,
        3,
        this.COLORS.accent,
      ),
    ];

    columns.forEach((column) => {
      commands.push(
        this.text(
          column.x,
          tableY + tableHeight - 20,
          column.label,
          this.FONT_SIZES.tableHeader,
          'F2',
          this.COLORS.textStrong,
          { maxWidth: column.width, maxLines: 1 },
        ),
      );
    });

    rows.forEach((row, index) => {
      const background =
        index % 2 === 0 ? this.COLORS.surface : this.COLORS.surfaceMuted;
      const rowY =
        tableY + tableHeight - headerHeight - (index + 1) * rowHeight;
      const remark = `${row.dayLabel} - ${row.gpsVerificationLabel}`;
      const statusTone = this.statusTone(row.statusLabel);
      commands.push(
        this.filledRect(x + 1, rowY, tableWidth - 2, rowHeight, background),
        this.text(
          columns[0].x,
          rowY + rowHeight - 10,
          row.date,
          this.FONT_SIZES.tableBody,
          'F1',
          this.COLORS.textStrong,
          {
            maxWidth: columns[0].width,
            maxLines: 1,
          },
        ),
        this.text(
          columns[1].x,
          rowY + rowHeight - 10,
          row.clockInTime,
          this.FONT_SIZES.tableBody,
          'F1',
          this.COLORS.textStrong,
          {
            maxWidth: columns[1].width,
            maxLines: 1,
          },
        ),
        this.text(
          columns[2].x,
          rowY + rowHeight - 10,
          row.clockOutTime,
          this.FONT_SIZES.tableBody,
          'F1',
          this.COLORS.textStrong,
          {
            maxWidth: columns[2].width,
            maxLines: 1,
          },
        ),
        this.text(
          columns[3].x,
          rowY + rowHeight - 10,
          row.statusLabel,
          this.FONT_SIZES.tableBody,
          'F2',
          this.toneColors(statusTone).accent,
          {
            maxWidth: columns[3].width,
            maxLines: 1,
          },
        ),
        this.text(
          columns[4].x,
          rowY + rowHeight - 10,
          row.lateLabel,
          this.FONT_SIZES.tableBody,
          'F1',
          this.COLORS.textStrong,
          {
            maxWidth: columns[4].width,
            maxLines: 1,
          },
        ),
        this.text(
          columns[5].x,
          rowY + rowHeight - 8,
          remark,
          8.2,
          'F1',
          this.COLORS.text,
          {
            maxWidth: columns[5].width,
            maxLines: 2,
            lineHeight: 9.2,
          },
        ),
        this.horizontalLine(x, rowY, x + tableWidth, this.COLORS.border, 0.6),
      );
    });

    if (rows.length === 0) {
      commands.push(
        this.text(
          x + 14,
          tableY + rowHeight - 10,
          'Aucune ligne journali\u00e8re disponible pour cette p\u00e9riode.',
          10,
          'F1',
          this.COLORS.text,
          { maxWidth: tableWidth - 28, maxLines: 1 },
        ),
      );
    }

    return commands.join('');
  }

  private renderTable(input: {
    rows: MonthlyAttendanceDailyReportRow[];
    x: number;
    top: number;
    width: number;
  }) {
    return this.renderDailyTable(input);
  }

  private renderFooter(pageNumber: number, totalPages: number) {
    return this.footer(pageNumber, totalPages);
  }

  private bottomFromTop(top: number, height: number) {
    return this.pageHeight - top - height;
  }

  private baselineFromTop(top: number) {
    return this.pageHeight - top;
  }

  private renderSection({
    x,
    top,
    width,
    height,
    tone = 'neutral',
  }: {
    x: number;
    top: number;
    width: number;
    height: number;
    tone?: MetricTone;
  }) {
    const y = this.bottomFromTop(top, height);
    const colors = this.toneColors(tone);

    return [
      this.panel(x, y, width, height, this.COLORS.surface, this.COLORS.border),
      this.filledRect(x, y + height - 3, width, 3, colors.accent),
    ].join('');
  }

  private renderCard({
    x,
    top,
    width,
    height,
    label,
    value,
    description,
    variant = 'neutral',
    labelFontSize = 8,
    valueFontSize = 18,
    descriptionFontSize = 8,
    descriptionMaxLines = 1,
    labelTopOffset = 10,
    valueTopOffset = 24,
    descriptionTopOffset = 38,
  }: {
    x: number;
    top: number;
    width: number;
    height: number;
    label: string;
    value: string;
    description?: string;
    variant?: KpiCardVariant;
    labelFontSize?: number;
    valueFontSize?: number;
    descriptionFontSize?: number;
    descriptionMaxLines?: number;
    labelTopOffset?: number;
    valueTopOffset?: number;
    descriptionTopOffset?: number;
  }) {
    return this.renderKpiCard({
      x,
      y: this.bottomFromTop(top, height),
      width,
      height,
      label,
      value,
      description,
      variant,
      align: 'center',
      descriptionAlign: 'center',
      cardPadding: 10,
      labelFontSize,
      labelMaxLines: 1,
      labelTopOffset,
      valueFontSize,
      valueTopOffset,
      valueMaxLines: 1,
      descriptionFontSize,
      descriptionMaxLines,
      descriptionTopOffset,
    });
  }

  private renderGrid(
    cards: Array<{
      label: string;
      value: string;
      description?: string;
      variant?: KpiCardVariant;
      labelFontSize?: number;
      valueFontSize?: number;
      descriptionFontSize?: number;
      descriptionMaxLines?: number;
      labelTopOffset?: number;
      valueTopOffset?: number;
      descriptionTopOffset?: number;
    }>,
    {
      x,
      top,
      columns,
      cardWidth,
      cardHeight,
      gapX,
      gapY,
    }: {
      x: number;
      top: number;
      columns: number;
      cardWidth: number;
      cardHeight: number;
      gapX: number;
      gapY: number;
    },
  ) {
    const safeColumns = Math.max(1, columns);
    const content = cards
      .map((card, index) => {
        const column = index % safeColumns;
        const row = Math.floor(index / safeColumns);

        return this.renderCard({
          ...card,
          x: x + column * (cardWidth + gapX),
          top: top + row * (cardHeight + gapY),
          width: cardWidth,
          height: cardHeight,
        });
      })
      .join('');
    const rowCount =
      cards.length === 0 ? 0 : Math.ceil(cards.length / safeColumns);

    return {
      content,
      nextTop: top + rowCount * cardHeight + Math.max(0, rowCount - 1) * gapY,
    };
  }

  private renderInfoField(
    x: number,
    top: number,
    width: number,
    label: string,
    value: string,
  ) {
    return [
      this.smallLabel(x, this.baselineFromTop(top + 10), label, this.slate500, {
        maxWidth: width,
        maxLines: 1,
      }),
      this.text(
        x,
        this.baselineFromTop(top + 26),
        value,
        10.5,
        'F2',
        this.slate900,
        {
          maxWidth: width,
          maxLines: 1,
        },
      ),
    ].join('');
  }

  private renderEmployeePremiumHeader(
    employeeReport: MonthlyAttendanceEmployeeReport,
    top: number,
    height: number,
    compact = false,
  ) {
    const x = 36;
    const width = this.pageWidth - x * 2;
    const metaWidth = compact ? 164 : 176;
    const panelY = this.bottomFromTop(top, height);
    const metaTop = top + 14;
    const metaHeight = height - 28;
    const metaX = x + width - metaWidth - 18;
    const metaY = this.bottomFromTop(metaTop, metaHeight);
    const titleWidth = width - metaWidth - 54;
    const title = 'Rapport mensuel de pr\u00e9sence';
    const subtitle = compact
      ? `${employeeReport.fullName}  |  ${employeeReport.monthLabel}`
      : `Synth\u00e8se RH  |  ${employeeReport.monthLabel}`;
    const firstLabelOffset = compact ? 10 : 14;
    const firstValueOffset = compact ? 22 : 28;
    const secondLabelOffset = compact ? 31 : 42;
    const secondValueOffset = compact ? 41 : 56;

    return [
      this.panel(
        x,
        panelY,
        width,
        height,
        this.COLORS.surfaceMuted,
        this.COLORS.border,
      ),
      this.filledRect(x, panelY + height - 4, width, 4, this.COLORS.accent),
      this.text(
        x + 18,
        this.baselineFromTop(top + 18),
        'KONATECH ATTENDANCE',
        compact ? 10 : 10.5,
        'F2',
        this.COLORS.accent,
        { maxWidth: titleWidth, maxLines: 1 },
      ),
      this.text(
        x + 18,
        this.baselineFromTop(top + (compact ? 38 : 42)),
        title,
        compact ? 16 : 22,
        'F2',
        this.COLORS.textStrong,
        { maxWidth: titleWidth, maxLines: 1 },
      ),
      this.text(
        x + 18,
        this.baselineFromTop(top + (compact ? 58 : 66)),
        subtitle,
        compact ? 9 : 10.5,
        'F1',
        this.COLORS.text,
        { maxWidth: titleWidth, maxLines: 1 },
      ),
      this.panel(
        metaX,
        metaY,
        metaWidth,
        metaHeight,
        this.COLORS.surface,
        this.COLORS.border,
      ),
      this.text(
        metaX + 12,
        this.baselineFromTop(metaTop + firstLabelOffset),
        'DATE DE G\u00c9N\u00c9RATION',
        7.2,
        'F2',
        this.COLORS.textMuted,
        { maxWidth: metaWidth - 24, maxLines: 1 },
      ),
      this.text(
        metaX + 12,
        this.baselineFromTop(metaTop + firstValueOffset),
        employeeReport.generationDateLabel,
        8.2,
        'F2',
        this.COLORS.textStrong,
        { maxWidth: metaWidth - 24, maxLines: 1 },
      ),
      this.horizontalLine(
        metaX + 12,
        compact ? metaY + metaHeight - 26 : metaY + metaHeight / 2,
        metaX + metaWidth - 12,
        this.COLORS.border,
        0.6,
      ),
      this.text(
        metaX + 12,
        this.baselineFromTop(metaTop + secondLabelOffset),
        'MODE GPS ACTIF',
        7.2,
        'F2',
        this.COLORS.textMuted,
        { maxWidth: metaWidth - 24, maxLines: 1 },
      ),
      this.text(
        metaX + 12,
        this.baselineFromTop(metaTop + secondValueOffset),
        employeeReport.gpsBreakdown.modeLabel,
        8.2,
        'F2',
        this.COLORS.textStrong,
        {
          maxWidth: metaWidth - 24,
          maxLines: compact ? 1 : 2,
          lineHeight: 9.4,
        },
      ),
    ].join('');
  }

  private renderEmployeeIdentityCard(
    employeeReport: MonthlyAttendanceEmployeeReport,
    top: number,
    height: number,
  ) {
    const x = 36;
    const width = this.pageWidth - x * 2;
    const columnWidth = width / 2;
    const fieldWidth = columnWidth - 38;
    const y = this.bottomFromTop(top, height);

    return [
      this.panel(x, y, width, height, this.COLORS.surface, this.COLORS.border),
      this.verticalLine(
        x + columnWidth,
        y + 14,
        y + height - 14,
        this.COLORS.border,
        0.8,
      ),
      this.renderInfoField(
        x + 18,
        top + 12,
        fieldWidth,
        "Nom de l'employ\u00e9",
        employeeReport.fullName,
      ),
      this.renderInfoField(
        x + 18,
        top + 42,
        fieldWidth,
        'Identifiant employe',
        employeeReport.employeeIdentifier,
      ),
      this.renderInfoField(
        x + columnWidth + 18,
        top + 12,
        fieldWidth,
        'D\u00e9partement',
        employeeReport.departmentLabel,
      ),
      this.renderInfoField(
        x + columnWidth + 18,
        top + 42,
        fieldWidth,
        'Planning',
        employeeReport.assignedScheduleLabel,
      ),
    ].join('');
  }

  private renderEmployeeScoreSection(
    employeeReport: MonthlyAttendanceEmployeeReport,
    top: number,
    height: number,
  ) {
    const x = 36;
    const width = this.pageWidth - x * 2;
    const y = this.bottomFromTop(top, height);
    const badge = this.performanceBadge(employeeReport.performanceScore);
    const badgeWidth = Math.min(
      196,
      Math.max(132, this.measureText(badge.label, 8.2) + 22),
    );
    const badgeX = x + (width - badgeWidth) / 2;

    return [
      this.panel(x, y, width, height, this.COLORS.surface, this.COLORS.border),
      this.text(
        x + 18,
        this.baselineFromTop(top + 16),
        'SCORE DE PERFORMANCE',
        7.8,
        'F2',
        this.COLORS.textMuted,
        { maxWidth: width - 36, maxLines: 1 },
      ),
      this.centeredText(
        x,
        this.baselineFromTop(top + 34),
        width,
        'Score global',
        13,
        'F2',
        this.COLORS.textStrong,
        { maxWidth: width - 36, maxLines: 1 },
      ),
      this.centeredText(
        x,
        this.baselineFromTop(top + 62),
        width,
        `${employeeReport.performanceScore} / 100`,
        30,
        'F2',
        this.COLORS.textStrong,
        { maxWidth: width - 36, maxLines: 1 },
      ),
      this.renderPillBadge(
        badgeX,
        y + 28,
        badge.label,
        badge.tone,
        badgeWidth,
        16,
        8.2,
      ),
      this.progressBar(
        x + 18,
        y + 12,
        width - 36,
        8,
        employeeReport.performanceScore / 100,
        badge.tone,
      ),
    ].join('');
  }

  private renderTitledPanel(
    x: number,
    top: number,
    width: number,
    height: number,
    title: string,
    subtitle: string,
    accent: RgbColor = this.COLORS.accent,
  ) {
    const y = this.bottomFromTop(top, height);

    return [
      this.panel(x, y, width, height, this.COLORS.surface, this.COLORS.border),
      this.filledRect(x, y + height - 4, width, 4, accent),
      this.text(
        x + 16,
        this.baselineFromTop(top + 18),
        title,
        11,
        'F2',
        this.COLORS.textStrong,
        {
          maxWidth: width - 32,
          maxLines: 1,
        },
      ),
      this.text(
        x + 16,
        this.baselineFromTop(top + 34),
        subtitle,
        8.2,
        'F1',
        this.COLORS.text,
        {
          maxWidth: width - 32,
          maxLines: 2,
          lineHeight: 9.4,
        },
      ),
    ].join('');
  }

  private renderEmployeeAdvancedSection(
    employeeReport: MonthlyAttendanceEmployeeReport,
    top: number,
    height: number,
  ) {
    const x = 36;
    const width = this.pageWidth - x * 2;
    const gap = 16;
    const columnWidth = (width - gap) / 2;
    const leftX = x;
    const rightX = x + columnWidth + gap;
    const innerTop = top + 52;
    const leftInnerWidth = columnWidth - 32;
    const leftCardGap = 8;
    const leftCardWidth = (leftInnerWidth - leftCardGap * 2) / 3;
    const leftCardHeight = 68;
    const rightInnerWidth = columnWidth - 32;
    const rightCardGap = 8;
    const rightCardWidth = (rightInnerWidth - rightCardGap) / 2;
    const rightCardHeight = 34;
    const rightFirstRowY = this.bottomFromTop(innerTop, rightCardHeight);

    return [
      this.renderTitledPanel(
        leftX,
        top,
        columnWidth,
        height,
        "Retards \u00e0 l'entr\u00e9e",
        'R\u00e9partition des retards constat\u00e9s sur la p\u00e9riode',
      ),
      this.renderTitledPanel(
        rightX,
        top,
        columnWidth,
        height,
        'S\u00e9curit\u00e9 GPS',
        'Lecture des pointages valid\u00e9s et de la conformit\u00e9 de zone',
      ),
      this.renderKpiCard({
        x: leftX + 16,
        y: this.bottomFromTop(innerTop, leftCardHeight),
        width: leftCardWidth,
        height: leftCardHeight,
        label: '5 - 15 min',
        value: String(employeeReport.lateRangeBreakdown.fiveToFifteenCount),
        description: 'occurrences',
        variant: 'warning',
        labelFontSize: 7.4,
        valueFontSize: 18,
        descriptionFontSize: 7.2,
        descriptionTopOffset: 36,
      }),
      this.renderKpiCard({
        x: leftX + 16 + leftCardWidth + leftCardGap,
        y: this.bottomFromTop(innerTop, leftCardHeight),
        width: leftCardWidth,
        height: leftCardHeight,
        label: '16 - 30 min',
        value: String(employeeReport.lateRangeBreakdown.sixteenToThirtyCount),
        description: 'occurrences',
        variant: 'warning',
        labelFontSize: 7.4,
        valueFontSize: 18,
        descriptionFontSize: 7.2,
        descriptionTopOffset: 36,
      }),
      this.renderKpiCard({
        x: leftX + 16 + (leftCardWidth + leftCardGap) * 2,
        y: this.bottomFromTop(innerTop, leftCardHeight),
        width: leftCardWidth,
        height: leftCardHeight,
        label: '+30 min',
        value: String(employeeReport.lateRangeBreakdown.overThirtyCount),
        description: 'occurrences',
        variant: 'critical',
        labelFontSize: 7.4,
        valueFontSize: 18,
        descriptionFontSize: 7.2,
        descriptionTopOffset: 36,
      }),
      this.renderKpiCard({
        x: rightX + 16,
        y: rightFirstRowY,
        width: rightCardWidth,
        height: rightCardHeight,
        label: 'GPS valid\u00e9',
        value: String(employeeReport.gpsBreakdown.gpsValidatedPointages),
        variant: 'success',
        labelFontSize: 6.8,
        labelTopOffset: 8,
        valueTopOffset: 21,
        valueFontSize: 14,
      }),
      this.renderKpiCard({
        x: rightX + 16 + rightCardWidth + rightCardGap,
        y: rightFirstRowY,
        width: rightCardWidth,
        height: rightCardHeight,
        label: 'Pointages sans GPS',
        value: String(employeeReport.gpsBreakdown.nonGpsPointages),
        variant:
          employeeReport.gpsBreakdown.nonGpsPointages > 0
            ? 'critical'
            : 'success',
        labelFontSize: 6.4,
        labelMaxLines: 2,
        labelTopOffset: 8,
        valueTopOffset: 21,
        valueFontSize: 12.5,
      }),
      this.renderKpiCard({
        x: rightX + 16,
        y: rightFirstRowY - rightCardHeight - rightCardGap,
        width: rightCardWidth,
        height: rightCardHeight,
        label: 'Dans la zone',
        value: String(employeeReport.gpsBreakdown.insideZonePointages),
        variant:
          this.gpsInsideZoneTone(
            employeeReport.gpsBreakdown.insideZonePointages,
            employeeReport.gpsBreakdown.gpsValidatedPointages,
          ) === 'critical'
            ? 'critical'
            : this.gpsInsideZoneTone(
                  employeeReport.gpsBreakdown.insideZonePointages,
                  employeeReport.gpsBreakdown.gpsValidatedPointages,
                ) === 'warning'
              ? 'warning'
              : 'success',
        labelFontSize: 6.8,
        labelTopOffset: 8,
        valueTopOffset: 21,
        valueFontSize: 14,
      }),
      this.renderKpiCard({
        x: rightX + 16 + rightCardWidth + rightCardGap,
        y: rightFirstRowY - rightCardHeight - rightCardGap,
        width: rightCardWidth,
        height: rightCardHeight,
        label: 'Mode GPS obligatoire',
        value: employeeReport.gpsBreakdown.modeLabel,
        variant:
          this.gpsModeTone(employeeReport.gpsBreakdown.modeLabel) === 'warning'
            ? 'warning'
            : 'success',
        labelFontSize: 6.2,
        labelMaxLines: 2,
        labelTopOffset: 8,
        valueTopOffset: 21,
        valueFontSize: 8.8,
        valueMaxLines: 2,
      }),
    ].join('');
  }

  private renderEmployeeAnalysisBlock(
    employeeReport: MonthlyAttendanceEmployeeReport,
    top: number,
    height: number,
  ) {
    const x = 36;
    const width = this.pageWidth - x * 2;
    const y = this.bottomFromTop(top, height);
    const insights = this.buildEmployeeInsights(employeeReport).join('\n');

    return [
      this.panel(
        x,
        y,
        width,
        height,
        this.COLORS.surfaceMuted,
        this.COLORS.border,
      ),
      this.filledRect(x, y, 5, height, this.COLORS.accent),
      this.text(
        x + 18,
        this.baselineFromTop(top + 18),
        'Analyse automatique',
        11,
        'F2',
        this.COLORS.textStrong,
        { maxWidth: width - 36, maxLines: 1 },
      ),
      this.text(
        x + 18,
        this.baselineFromTop(top + 36),
        insights,
        8.3,
        'F1',
        this.COLORS.text,
        { maxWidth: width - 36, maxLines: 5, lineHeight: 10.2 },
      ),
    ].join('');
  }

  private renderPillBadge(
    x: number,
    y: number,
    label: string,
    tone: MetricTone,
    maxWidth: number,
    height = 14,
    fontSize = 7.4,
  ) {
    const colors = this.toneColors(tone);
    const paddingX = 10;
    const safeMaxWidth = Math.max(56, maxWidth);
    const textValue = this.ellipsizeText(
      label,
      fontSize,
      Math.max(0, safeMaxWidth - paddingX * 2),
    );
    const width = Math.min(
      safeMaxWidth,
      Math.max(56, this.measureText(textValue, fontSize) + paddingX * 2),
    );

    return [
      this.panel(x, y, width, height, colors.fill, colors.border),
      this.centeredText(
        x,
        y + height - 4,
        width,
        textValue,
        fontSize,
        'F2',
        colors.accent,
        {
          maxWidth: width - paddingX * 2,
          maxLines: 1,
        },
      ),
    ].join('');
  }

  private renderEmployeeDailyTable(
    rows: MonthlyAttendanceDailyReportRow[],
    top: number,
  ) {
    const x = 36;
    const width = this.pageWidth - x * 2;
    const rowHeight = 28;
    const titleHeight = 42;
    const headerHeight = 28;
    const bottomPadding = 12;
    const rowCount = Math.max(1, rows.length);
    const tableHeight =
      titleHeight + headerHeight + rowHeight * rowCount + bottomPadding;
    const y = this.bottomFromTop(top, tableHeight);
    const tableHeaderTop = top + titleHeight;
    const rowStartTop = top + titleHeight + headerHeight;
    const innerLeft = x + 14;
    const columnGap = 4;
    const columns = [
      { label: 'DATE', width: 56 },
      { label: 'JOUR', width: 36 },
      { label: 'ENTR\u00c9E', width: 44 },
      { label: 'SORTIE', width: 44 },
      { label: 'STATUT', width: 70 },
      { label: 'RETARD', width: 42 },
      { label: 'D\u00c9PART T\u00d4T', width: 50 },
      { label: 'H. SUPP.', width: 48 },
      { label: 'GPS', width: 65 },
    ].map((column, index, source) => {
      const columnX =
        index === 0
          ? innerLeft
          : source
              .slice(0, index)
              .reduce(
                (cursor, item) => cursor + item.width + columnGap,
                innerLeft,
              );

      return {
        ...column,
        x: columnX,
      };
    });
    const commands: string[] = [
      this.panel(
        x,
        y,
        width,
        tableHeight,
        this.COLORS.surface,
        this.COLORS.border,
      ),
      this.text(
        x + 16,
        this.baselineFromTop(top + 18),
        'D\u00e9tail journalier',
        12,
        'F2',
        this.COLORS.textStrong,
        { maxWidth: width - 32, maxLines: 1 },
      ),
      this.text(
        x + 16,
        this.baselineFromTop(top + 34),
        'Vue quotidienne des entr\u00e9es, sorties, statuts et contr\u00f4les GPS',
        8.2,
        'F1',
        this.COLORS.text,
        { maxWidth: width - 32, maxLines: 1 },
      ),
      this.filledRect(
        x + 1,
        this.bottomFromTop(tableHeaderTop, headerHeight),
        width - 2,
        headerHeight,
        this.COLORS.accentSoft,
      ),
    ];

    columns.forEach((column) => {
      commands.push(
        this.centeredText(
          column.x,
          this.baselineFromTop(tableHeaderTop + 18),
          column.width,
          column.label,
          7.2,
          'F2',
          this.COLORS.textStrong,
          { maxWidth: column.width, maxLines: 1 },
        ),
      );
    });

    rows.forEach((row, index) => {
      const rowTop = rowStartTop + rowHeight * index;
      const rowY = this.bottomFromTop(rowTop, rowHeight);
      const background =
        index % 2 === 0 ? this.COLORS.surface : this.COLORS.surfaceMuted;

      commands.push(
        this.filledRect(x + 1, rowY, width - 2, rowHeight, background),
        this.centeredText(
          columns[0].x,
          this.baselineFromTop(rowTop + 18),
          columns[0].width,
          row.date,
          7.5,
          'F1',
          this.COLORS.textStrong,
          { maxWidth: columns[0].width, maxLines: 1 },
        ),
        this.centeredText(
          columns[1].x,
          this.baselineFromTop(rowTop + 18),
          columns[1].width,
          this.compactDayLabel(row.dayLabel),
          7.5,
          'F1',
          this.COLORS.text,
          { maxWidth: columns[1].width, maxLines: 1 },
        ),
        this.renderTableCellValue(
          columns[2].x,
          rowTop + 18,
          columns[2].width,
          row.clockInTime,
        ),
        this.renderTableCellValue(
          columns[3].x,
          rowTop + 18,
          columns[3].width,
          row.clockOutTime,
        ),
        this.renderPillBadge(
          columns[4].x + 1,
          rowY + 7,
          row.statusLabel,
          this.statusTone(row.statusLabel),
          columns[4].width - 2,
          14,
          6.8,
        ),
        this.renderTableCellValue(
          columns[5].x,
          rowTop + 18,
          columns[5].width,
          row.lateLabel,
          this.COLORS.text,
        ),
        this.renderTableCellValue(
          columns[6].x,
          rowTop + 18,
          columns[6].width,
          row.earlyExitLabel,
          this.COLORS.text,
        ),
        this.renderTableCellValue(
          columns[7].x,
          rowTop + 18,
          columns[7].width,
          row.overtimeLabel,
          this.COLORS.text,
        ),
        this.cleanTableValue(row.gpsVerificationLabel)
          ? this.renderPillBadge(
              columns[8].x + 1,
              rowY + 7,
              row.gpsVerificationLabel,
              this.gpsVerificationTone(row.gpsVerificationLabel),
              columns[8].width - 2,
              14,
              6.8,
            )
          : '',
        this.horizontalLine(x, rowY, x + width, this.COLORS.border, 0.55),
      );
    });

    if (rows.length === 0) {
      commands.push(
        this.centeredText(
          x + 16,
          this.baselineFromTop(rowStartTop + 18),
          width - 32,
          'Aucune ligne journali\u00e8re disponible pour cette p\u00e9riode.',
          9,
          'F1',
          this.COLORS.text,
          { maxWidth: width - 32, maxLines: 1 },
        ),
      );
    }

    return commands.join('');
  }

  private renderTableCellValue(
    x: number,
    top: number,
    width: number,
    value: string,
    color: RgbColor = this.COLORS.textStrong,
  ) {
    const resolvedValue = this.cleanTableValue(value);

    if (!resolvedValue) {
      return '';
    }

    return this.centeredText(
      x,
      this.baselineFromTop(top),
      width,
      resolvedValue,
      7.5,
      'F1',
      color,
      { maxWidth: width, maxLines: 1 },
    );
  }

  private cleanTableValue(value: string) {
    return value && value.trim() !== '-' ? value : '';
  }

  private compactDayLabel(value: string) {
    switch (value.toLowerCase()) {
      case 'lundi':
        return 'Lun.';
      case 'mardi':
        return 'Mar.';
      case 'mercredi':
        return 'Mer.';
      case 'jeudi':
        return 'Jeu.';
      case 'vendredi':
        return 'Ven.';
      case 'samedi':
        return 'Sam.';
      case 'dimanche':
        return 'Dim.';
      default:
        return this.truncate(value, 4);
    }
  }

  private gpsVerificationTone(value: string): MetricTone {
    const normalized = value.toLowerCase();

    if (!normalized || normalized === '-') {
      return 'neutral';
    }

    if (normalized.includes('sans gps') || normalized.includes('hors zone')) {
      return 'critical';
    }

    if (normalized.includes('partiel')) {
      return 'warning';
    }

    if (normalized.includes('valid')) {
      return 'positive';
    }

    return 'neutral';
  }

  private performanceBadge(score: number) {
    if (score < 40) {
      return {
        label: 'Performance critique',
        tone: 'critical' as const,
      };
    }

    if (score < 70) {
      return {
        label: 'Performance \u00e0 surveiller',
        tone: 'warning' as const,
      };
    }

    return {
      label: 'Bonne performance',
      tone: 'positive' as const,
    };
  }

  private buildEmployeeInsights(
    employeeReport: MonthlyAttendanceEmployeeReport,
  ) {
    const insights: string[] = [];

    if (employeeReport.absenceCount >= 2) {
      insights.push(
        `- Taux d'absence \u00e9lev\u00e9 : ${employeeReport.absenceCount} absence(s) constat\u00e9e(s) sur la p\u00e9riode.`,
      );
    } else if (employeeReport.absenceCount === 0) {
      insights.push(
        '- Aucune absence constat\u00e9e sur la p\u00e9riode analys\u00e9e.',
      );
    }

    if (employeeReport.lateCount > 0) {
      insights.push(
        `- Retards fr\u00e9quents : ${employeeReport.lateCount} retard(s) relev\u00e9(s) \u00e0 l'entr\u00e9e.`,
      );
    } else {
      insights.push(
        '- Ponctualit\u00e9 stable : aucun retard enregistr\u00e9 ce mois-ci.',
      );
    }

    if (employeeReport.earlyExitCount > 0) {
      insights.push(
        `- D\u00e9parts anticip\u00e9s : ${employeeReport.earlyExitCount} sortie(s) avant l'heure planifi\u00e9e.`,
      );
    }

    if (employeeReport.gpsBreakdown.nonGpsPointages > 0) {
      insights.push(
        `- GPS non conforme : ${employeeReport.gpsBreakdown.nonGpsPointages} pointage(s) sans GPS valid\u00e9.`,
      );
    } else {
      insights.push(
        '- Conformit\u00e9 GPS satisfaisante sur les pointages du mois.',
      );
    }

    if (employeeReport.performanceScore < 40) {
      insights.push(
        '- Recommandation RH : prioriser un entretien correctif et un suivi rapproch\u00e9.',
      );
    } else if (employeeReport.performanceScore < 70) {
      insights.push(
        '- Recommandation RH : mettre en place un suivi manag\u00e9rial sur la ponctualit\u00e9 et la pr\u00e9sence.',
      );
    } else {
      insights.push(
        '- Recommandation RH : niveau satisfaisant, maintenir la discipline actuelle.',
      );
    }

    return insights.slice(0, 5);
  }

  private buildEmployeeSummaryPage(
    employeeReport: MonthlyAttendanceEmployeeReport,
    pageNumber: number,
    totalPages: number,
  ) {
    const commands: string[] = [];
    const pagePadding = 36;
    const sectionGap = 16;
    const contentWidth = this.pageWidth - pagePadding * 2;
    const gridGapX = 12;
    const gridGapY = 12;
    const kpiCardHeight = 76;
    const kpiCardWidth = (contentWidth - gridGapX * 2) / 3;
    let cursorTop = 40;

    commands.push(this.pageBackground(), this.pageHeaderBand());
    commands.push(
      this.renderEmployeePremiumHeader(employeeReport, cursorTop, 96),
    );
    cursorTop += 96 + sectionGap;

    commands.push(
      this.renderEmployeeIdentityCard(employeeReport, cursorTop, 84),
    );
    cursorTop += 84 + sectionGap;

    commands.push(
      this.renderEmployeeScoreSection(employeeReport, cursorTop, 104),
    );
    cursorTop += 104 + sectionGap;

    commands.push(
      this.renderKpiGrid(
        [
          {
            label: 'PR\u00c9SENCE',
            value: `${employeeReport.presenceRate.toFixed(1).replace('.', ',')} %`,
            description: `${employeeReport.presenceDays} / ${employeeReport.workingDays} jours planifi\u00e9s`,
            variant: this.metricToneVariant(
              this.presenceTone(employeeReport.presenceRate),
            ),
            labelFontSize: 7.6,
            valueFontSize: 21,
            descriptionFontSize: 7.3,
            progressRatio: employeeReport.presenceRate / 100,
          },
          {
            label: 'ABSENCES',
            value: String(employeeReport.absenceCount),
            description: `${employeeReport.absenceCount} jour(s) d'absence`,
            variant: this.metricToneVariant(
              this.countTone(employeeReport.absenceCount, 1, 3),
            ),
            labelFontSize: 7.6,
            valueFontSize: 21,
            descriptionFontSize: 7.3,
            progressRatio:
              employeeReport.workingDays > 0
                ? employeeReport.absenceCount / employeeReport.workingDays
                : 0,
          },
          {
            label: 'RETARDS',
            value: String(employeeReport.lateCount),
            description: `${employeeReport.lateCount} occurrence(s) sur le mois`,
            variant: this.metricToneVariant(
              this.countTone(employeeReport.lateCount, 2, 5),
            ),
            labelFontSize: 7.6,
            valueFontSize: 21,
            descriptionFontSize: 7.3,
            progressRatio:
              employeeReport.workingDays > 0
                ? employeeReport.lateCount / employeeReport.workingDays
                : 0,
          },
          {
            label: 'HEURES TRAVAILL\u00c9ES',
            value: employeeReport.totalWorkedHours,
            description: `${employeeReport.entryCount} entr\u00e9e(s)  |  ${employeeReport.exitCount} sortie(s)`,
            variant: 'neutral',
            accentColor: this.blue,
            labelFontSize: 7.4,
            valueFontSize: 18,
            descriptionFontSize: 7.2,
          },
          {
            label: 'HEURES SUPPL\u00c9MENTAIRES',
            value: employeeReport.overtimeHours,
            description: `${employeeReport.scheduledOvertimeHours} planifi\u00e9es | ${employeeReport.outsideScheduleOvertimeHours} hors planning`,
            variant: 'neutral',
            accentColor: this.indigo,
            labelFontSize: 7.2,
            valueFontSize: 17.5,
            descriptionFontSize: 7.2,
          },
          {
            label: 'D\u00c9PARTS T\u00d4T',
            value: String(employeeReport.earlyExitCount),
            description: `${employeeReport.earlyExitCount} sortie(s) anticip\u00e9e(s)`,
            variant: this.metricToneVariant(
              this.countTone(employeeReport.earlyExitCount, 1, 3),
            ),
            labelFontSize: 7.4,
            valueFontSize: 21,
            descriptionFontSize: 7.2,
            progressRatio:
              employeeReport.workingDays > 0
                ? employeeReport.earlyExitCount / employeeReport.workingDays
                : 0,
          },
        ],
        {
          startX: pagePadding,
          startY: this.bottomFromTop(cursorTop, kpiCardHeight),
          columns: 3,
          cardWidth: kpiCardWidth,
          cardHeight: kpiCardHeight,
          gapX: gridGapX,
          gapY: gridGapY,
        },
      ).content,
    );
    cursorTop += kpiCardHeight * 2 + gridGapY + sectionGap;

    commands.push(
      this.renderEmployeeAdvancedSection(employeeReport, cursorTop, 144),
    );
    cursorTop += 144 + sectionGap;

    commands.push(
      this.renderEmployeeAnalysisBlock(employeeReport, cursorTop, 80),
      this.renderFooter(pageNumber, totalPages),
    );

    return commands.join('');
  }

  private buildEmployeeTablePage(
    report: MonthlyAttendanceExportReport,
    employeeReport: MonthlyAttendanceEmployeeReport,
    rows: MonthlyAttendanceDailyReportRow[],
    pageNumber: number,
    totalPages: number,
  ) {
    return [
      this.pageBackground(),
      this.pageHeaderBand(),
      this.renderEmployeePremiumHeader(employeeReport, 40, 72, true),
      this.renderEmployeeDailyTable(rows, 126),
      this.renderFooter(pageNumber, totalPages),
    ].join('');
  }
  private buildTeamReportPages(report: MonthlyAttendanceExportReport) {
    const summary = this.buildTeamSummary(report.rows);
    const tableChunks = this.chunkRows(report.rows, this.rowsPerTeamTablePage);
    const effectiveChunks = tableChunks.length > 0 ? tableChunks : [[]];
    const totalPages = effectiveChunks.length;

    return effectiveChunks.map((rows, index) =>
      this.buildTeamPagePremium(report, summary, rows, index + 1, totalPages),
    );
  }

  private buildTeamPage(
    report: MonthlyAttendanceExportReport,
    summary: {
      presenceRate: number;
      totalWorkingDays: number;
      totalPresenceDays: number;
      totalAbsences: number;
      totalWorkedMinutes: number;
      totalOvertimeHours: number;
      totalEarlyExitDays: number;
      totalLateDays: number;
    },
    rows: MonthlyAttendanceExportRow[],
    pageNumber: number,
    totalPages: number,
  ) {
    const commands: string[] = [];
    const contentWidth = this.pageWidth - this.margin * 2;
    const cardWidth = (contentWidth - 24) / 3;
    const tableWidth = contentWidth;
    const headerY = 310;
    const rowHeight = 18;

    commands.push(this.pageBackground(), this.pageHeaderBand());
    commands.push(
      this.text(this.margin, 526, 'KONATECH ATTENDANCE', 11, 'F2', this.orange),
      this.text(
        this.margin,
        502,
        'Rapport mensuel de présence',
        21,
        'F2',
        this.slate900,
      ),
      this.text(
        this.margin,
        484,
        `Synth\u00e8se \u00e9quipe  |  ${this.formatPeriod(report.month, report.year)}  |  ${this.formatGeneratedAt(report.generatedAt)}`,
        10,
        'F1',
        this.slate700,
      ),
    );

    commands.push(
      this.metricCard(
        this.margin,
        384,
        cardWidth,
        78,
        'Pr\u00e9sence moyenne',
        `${summary.presenceRate.toFixed(1).replace('.', ',')} %`,
        `${summary.totalPresenceDays} / ${summary.totalWorkingDays} jours ouvrés`,
        true,
      ),
      this.metricCard(
        this.margin + cardWidth + 12,
        384,
        cardWidth,
        78,
        'Absences',
        String(summary.totalAbsences),
        `${summary.totalAbsences} jours cumules`,
      ),
      this.metricCard(
        this.margin + (cardWidth + 12) * 2,
        384,
        cardWidth,
        78,
        'Heures travaillées',
        this.formatMinutes(summary.totalWorkedMinutes),
        'Volume total consolidé',
      ),
      this.metricCard(
        this.margin,
        294,
        cardWidth,
        78,
        'Heures supplémentaires',
        this.formatHours(summary.totalOvertimeHours),
        'Cumul du mois',
      ),
      this.metricCard(
        this.margin + cardWidth + 12,
        294,
        cardWidth,
        78,
        'Départs anticipés',
        String(summary.totalEarlyExitDays),
        'Occurrences employé',
      ),
      this.metricCard(
        this.margin + (cardWidth + 12) * 2,
        294,
        cardWidth,
        78,
        'Retards',
        String(summary.totalLateDays),
        'Occurrences employé',
      ),
    );

    commands.push(
      this.filledRect(this.margin, headerY, tableWidth, 24, this.orangeSoft),
      this.text(
        this.margin + 10,
        headerY + 8,
        'Employé',
        8.5,
        'F2',
        this.slate900,
      ),
      this.text(
        this.margin + 130,
        headerY + 8,
        'Identifiant',
        8.5,
        'F2',
        this.slate900,
      ),
      this.text(
        this.margin + 208,
        headerY + 8,
        'Département',
        8.5,
        'F2',
        this.slate900,
      ),
      this.text(
        this.margin + 292,
        headerY + 8,
        'Planning',
        8.5,
        'F2',
        this.slate900,
      ),
      this.text(
        this.margin + 434,
        headerY + 8,
        'Présence',
        8.5,
        'F2',
        this.slate900,
      ),
      this.text(
        this.margin + 492,
        headerY + 8,
        'Entrées',
        8.5,
        'F2',
        this.slate900,
      ),
      this.text(
        this.margin + 546,
        headerY + 8,
        'Sorties',
        8.5,
        'F2',
        this.slate900,
      ),
      this.text(
        this.margin + 602,
        headerY + 8,
        'Retards',
        8.5,
        'F2',
        this.slate900,
      ),
      this.text(
        this.margin + 658,
        headerY + 8,
        'Absences',
        8.5,
        'F2',
        this.slate900,
      ),
      this.text(
        this.margin + 724,
        headerY + 8,
        'H. trav.',
        8.5,
        'F2',
        this.slate900,
      ),
      this.outlineRect(
        this.margin,
        42,
        tableWidth,
        headerY + 24 - 42,
        this.slate300,
      ),
    );

    let cursorY = headerY - rowHeight;

    rows.forEach((row, index) => {
      const background = index % 2 === 0 ? this.white : this.slate100;
      commands.push(
        this.filledRect(
          this.margin + 1,
          cursorY - 2,
          tableWidth - 2,
          rowHeight,
          background,
        ),
        this.text(
          this.margin + 10,
          cursorY + 4,
          this.truncate(row.fullName, 24),
          8.5,
          'F1',
          this.slate900,
        ),
        this.text(
          this.margin + 130,
          cursorY + 4,
          row.employeeIdentifier,
          8.5,
          'F1',
          this.slate900,
        ),
        this.text(
          this.margin + 208,
          cursorY + 4,
          this.truncate(this.localizeDepartment(row.department), 14),
          8.5,
          'F1',
          this.slate900,
        ),
        this.text(
          this.margin + 292,
          cursorY + 4,
          this.truncate(this.localizeSchedule(row.assignedSchedule), 24),
          8.5,
          'F1',
          this.slate700,
        ),
        this.text(
          this.margin + 434,
          cursorY + 4,
          String(row.totalWorkedDays),
          8.5,
          'F1',
          this.slate900,
        ),
        this.text(
          this.margin + 492,
          cursorY + 4,
          String(row.entryCount),
          8.5,
          'F1',
          this.slate900,
        ),
        this.text(
          this.margin + 546,
          cursorY + 4,
          String(row.exitCount),
          8.5,
          'F1',
          this.slate900,
        ),
        this.text(
          this.margin + 602,
          cursorY + 4,
          String(row.lateDays),
          8.5,
          'F1',
          this.slate900,
        ),
        this.text(
          this.margin + 658,
          cursorY + 4,
          String(row.absenceCount),
          8.5,
          'F1',
          this.slate900,
        ),
        this.text(
          this.margin + 724,
          cursorY + 4,
          row.totalWorkedHours || '0',
          8.5,
          'F1',
          this.slate900,
        ),
        this.horizontalLine(
          this.margin,
          cursorY - 2,
          this.pageWidth - this.margin,
          this.slate300,
          0.6,
        ),
      );
      cursorY -= rowHeight;
    });

    if (rows.length === 0) {
      commands.push(
        this.text(
          this.margin + 12,
          headerY - 28,
          'Aucune ligne disponible pour cette p\u00e9riode.',
          10,
          'F1',
          this.slate700,
        ),
      );
    }

    commands.push(this.footer(pageNumber, totalPages));

    return commands.join('');
  }

  private buildTeamPagePremium(
    report: MonthlyAttendanceExportReport,
    summary: {
      presenceRate: number;
      totalWorkingDays: number;
      totalPresenceDays: number;
      totalAbsences: number;
      totalWorkedMinutes: number;
      totalOvertimeHours: number;
      totalEarlyExitDays: number;
      totalLateDays: number;
    },
    rows: MonthlyAttendanceExportRow[],
    pageNumber: number,
    totalPages: number,
  ) {
    const commands: string[] = [];
    const contentWidth = this.pageWidth - this.margin * 2;
    const cardGap = 12;
    const cardWidth = (contentWidth - cardGap * 2) / 3;
    const tableWidth = contentWidth;
    const headerY = 304;
    const rowHeight = 18;

    commands.push(this.pageBackground(), this.pageHeaderBand());
    commands.push(
      this.text(this.margin, 526, 'KONATECH ATTENDANCE', 11, 'F2', this.orange),
      this.text(
        this.margin,
        504,
        'Synth\u00e8se RH mensuelle',
        18,
        'F2',
        this.slate900,
        { maxWidth: 320 },
      ),
      this.text(
        this.margin,
        489,
        `Vue \u00e9quipe  |  ${this.formatPeriod(report.month, report.year)}`,
        12,
        'F2',
        this.slate700,
        { maxWidth: 340 },
      ),
      this.text(
        this.margin,
        476,
        `G\u00e9n\u00e9r\u00e9 le ${this.formatGeneratedAt(report.generatedAt)}`,
        9,
        'F1',
        this.slate700,
        { maxWidth: 320 },
      ),
    );

    commands.push(
      this.metricCard(
        this.margin,
        382,
        cardWidth,
        78,
        'Pr\u00e9sence moy.',
        `${summary.presenceRate.toFixed(1).replace('.', ',')} %`,
        `${summary.totalPresenceDays} / ${summary.totalWorkingDays} jours`,
        true,
      ),
      this.metricCard(
        this.margin + cardWidth + cardGap,
        382,
        cardWidth,
        78,
        'Absences',
        String(summary.totalAbsences),
        `${summary.totalAbsences} jours cumul\u00e9s`,
      ),
      this.metricCard(
        this.margin + (cardWidth + cardGap) * 2,
        382,
        cardWidth,
        78,
        'Heures',
        this.formatMinutes(summary.totalWorkedMinutes),
        'Volume total consolid\u00e9',
      ),
      this.metricCard(
        this.margin,
        290,
        cardWidth,
        78,
        'Heures supp.',
        this.formatHours(summary.totalOvertimeHours),
        'Cumul du mois',
      ),
      this.metricCard(
        this.margin + cardWidth + cardGap,
        290,
        cardWidth,
        78,
        'D\u00e9parts t\u00f4t',
        String(summary.totalEarlyExitDays),
        'Occurrences employ\u00e9',
      ),
      this.metricCard(
        this.margin + (cardWidth + cardGap) * 2,
        290,
        cardWidth,
        78,
        'Retards',
        String(summary.totalLateDays),
        'Occurrences employ\u00e9',
      ),
    );

    commands.push(
      this.filledRect(this.margin, headerY, tableWidth, 24, this.orangeSoft),
      this.text(
        this.margin + 10,
        headerY + 8,
        'Employ\u00e9',
        8.5,
        'F2',
        this.slate900,
        { maxWidth: 108 },
      ),
      this.text(
        this.margin + 130,
        headerY + 8,
        'Identifiant',
        8.5,
        'F2',
        this.slate900,
        { maxWidth: 64 },
      ),
      this.text(
        this.margin + 208,
        headerY + 8,
        'D\u00e9partement',
        8.5,
        'F2',
        this.slate900,
        { maxWidth: 70 },
      ),
      this.text(
        this.margin + 292,
        headerY + 8,
        'Planning',
        8.5,
        'F2',
        this.slate900,
        { maxWidth: 132 },
      ),
      this.text(
        this.margin + 434,
        headerY + 8,
        'Pr\u00e9s.',
        8.5,
        'F2',
        this.slate900,
        { maxWidth: 42 },
      ),
      this.text(
        this.margin + 492,
        headerY + 8,
        'Entr\u00e9es',
        8.5,
        'F2',
        this.slate900,
        { maxWidth: 42 },
      ),
      this.text(
        this.margin + 546,
        headerY + 8,
        'Sorties',
        8.5,
        'F2',
        this.slate900,
        { maxWidth: 42 },
      ),
      this.text(
        this.margin + 602,
        headerY + 8,
        'Retards',
        8.5,
        'F2',
        this.slate900,
        { maxWidth: 44 },
      ),
      this.text(
        this.margin + 658,
        headerY + 8,
        'Absences',
        8.5,
        'F2',
        this.slate900,
        { maxWidth: 50 },
      ),
      this.text(
        this.margin + 724,
        headerY + 8,
        'H. trav.',
        8.5,
        'F2',
        this.slate900,
        { maxWidth: 44 },
      ),
      this.outlineRect(
        this.margin,
        42,
        tableWidth,
        headerY + 24 - 42,
        this.slate300,
      ),
    );

    let cursorY = headerY - rowHeight;

    rows.forEach((row, index) => {
      const background = index % 2 === 0 ? this.white : this.slate100;
      commands.push(
        this.filledRect(
          this.margin + 1,
          cursorY - 2,
          tableWidth - 2,
          rowHeight,
          background,
        ),
        this.text(
          this.margin + 10,
          cursorY + 4,
          this.truncate(row.fullName, 24),
          8.5,
          'F1',
          this.slate900,
          { maxWidth: 112 },
        ),
        this.text(
          this.margin + 130,
          cursorY + 4,
          row.employeeIdentifier,
          8.5,
          'F1',
          this.slate900,
          { maxWidth: 64 },
        ),
        this.text(
          this.margin + 208,
          cursorY + 4,
          this.truncate(this.localizeDepartment(row.department), 14),
          8.5,
          'F1',
          this.slate900,
          { maxWidth: 72 },
        ),
        this.text(
          this.margin + 292,
          cursorY + 4,
          this.truncate(this.localizeSchedule(row.assignedSchedule), 24),
          8.5,
          'F1',
          this.slate700,
          { maxWidth: 132 },
        ),
        this.text(
          this.margin + 434,
          cursorY + 4,
          String(row.totalWorkedDays),
          8.5,
          'F1',
          this.slate900,
          { maxWidth: 32 },
        ),
        this.text(
          this.margin + 492,
          cursorY + 4,
          String(row.entryCount),
          8.5,
          'F1',
          this.slate900,
          { maxWidth: 32 },
        ),
        this.text(
          this.margin + 546,
          cursorY + 4,
          String(row.exitCount),
          8.5,
          'F1',
          this.slate900,
          { maxWidth: 32 },
        ),
        this.text(
          this.margin + 602,
          cursorY + 4,
          String(row.lateDays),
          8.5,
          'F1',
          this.slate900,
          { maxWidth: 32 },
        ),
        this.text(
          this.margin + 658,
          cursorY + 4,
          String(row.absenceCount),
          8.5,
          'F1',
          this.slate900,
          { maxWidth: 36 },
        ),
        this.text(
          this.margin + 724,
          cursorY + 4,
          row.totalWorkedHours || '0',
          8.5,
          'F1',
          this.slate900,
          { maxWidth: 42 },
        ),
        this.horizontalLine(
          this.margin,
          cursorY - 2,
          this.pageWidth - this.margin,
          this.slate300,
          0.6,
        ),
      );
      cursorY -= rowHeight;
    });

    if (rows.length === 0) {
      commands.push(
        this.text(
          this.margin + 12,
          headerY - 28,
          'Aucune ligne disponible pour cette p\u00e9riode.',
          10,
          'F1',
          this.slate700,
          { maxWidth: 260 },
        ),
      );
    }

    commands.push(this.footer(pageNumber, totalPages));

    return commands.join('');
  }

  private buildTeamSummary(rows: MonthlyAttendanceExportRow[]) {
    const totalPresenceDays = rows.reduce(
      (total, row) => total + (row.workingDays > 0 ? row.presenceDays : 0),
      0,
    );
    const totalAbsences = rows.reduce(
      (total, row) => total + row.absenceCount,
      0,
    );
    const totalWorkingDays = rows.reduce(
      (total, row) => total + row.workingDays,
      0,
    );
    const totalWorkedMinutes = rows.reduce(
      (total, row) => total + this.parseHoursAndMinutes(row.totalWorkedHours),
      0,
    );
    const totalOvertimeHours = rows.reduce(
      (total, row) => total + this.parseDecimalHours(row.overtimeHours),
      0,
    );
    const totalEarlyExitDays = rows.reduce(
      (total, row) => total + row.earlyExitDays,
      0,
    );
    const totalLateDays = rows.reduce((total, row) => total + row.lateDays, 0);
    const presenceRate =
      totalWorkingDays > 0 ? (totalPresenceDays / totalWorkingDays) * 100 : 0;

    return {
      presenceRate,
      totalWorkingDays,
      totalPresenceDays,
      totalAbsences,
      totalWorkedMinutes,
      totalOvertimeHours,
      totalEarlyExitDays,
      totalLateDays,
    };
  }

  private pageBackground() {
    return this.filledRect(0, 0, this.pageWidth, this.pageHeight, this.white);
  }

  private pageHeaderBand() {
    return this.filledRect(
      this.margin,
      this.pageHeight - this.margin - 8,
      this.pageWidth - this.margin * 2,
      8,
      this.orange,
    );
  }

  private renderKpiCard({
    x,
    y,
    width,
    height,
    label,
    value,
    description,
    accentColor,
    backgroundColor,
    borderColor,
    valueColor,
    labelColor,
    descriptionColor,
    align = 'left',
    descriptionAlign,
    variant = 'neutral',
    cardPadding = 6,
    labelFontSize,
    labelMaxLines,
    labelTopOffset,
    valueFontSize,
    valueTopOffset,
    descriptionFontSize,
    valueMaxLines = 1,
    descriptionMaxLines = 2,
    descriptionTopOffset,
    progressRatio,
  }: RenderKpiCardOptions) {
    const palette = this.kpiVariantPalette(variant);
    const fill = backgroundColor ?? palette.fill;
    const border = borderColor ?? palette.border;
    const accent = accentColor ?? palette.accent;
    const resolvedValueColor = valueColor ?? this.slate900;
    const resolvedLabelColor = labelColor ?? this.slate500;
    const resolvedDescriptionColor = descriptionColor ?? this.slate500;
    const resolvedDescriptionAlign = descriptionAlign ?? align;
    const innerX = x + cardPadding;
    const innerWidth = Math.max(0, width - cardPadding * 2);
    const progressBarHeight = progressRatio === undefined ? 0 : 4;
    const safeLabelMaxLines = labelMaxLines ?? 1;
    const safeDescriptionMaxLines = descriptionMaxLines;
    const resolvedLabelTopOffset = labelTopOffset ?? 8;
    const resolvedValueTopOffset = valueTopOffset ?? 22;
    const resolvedDescriptionTopOffset =
      descriptionTopOffset ?? (progressRatio === undefined ? 34 : 30);
    const baseLabelSize =
      labelFontSize ?? Math.max(8, Math.min(9, height * 0.16));
    const baseDescriptionSize =
      descriptionFontSize ?? Math.max(7, Math.min(8, height * 0.14));
    const labelSize = this.fitTextFontSize(
      label,
      baseLabelSize,
      innerWidth,
      safeLabelMaxLines,
      7,
    );
    const descriptionSize = description
      ? this.fitTextFontSize(
          description,
          baseDescriptionSize,
          innerWidth,
          safeDescriptionMaxLines,
          6.4,
        )
      : baseDescriptionSize;
    const labelLineHeight = labelSize * 1.08;
    const descriptionLineHeight = descriptionSize * 1.08;
    const labelY = y + height - resolvedLabelTopOffset;
    const valueY = y + height - resolvedValueTopOffset;
    const descriptionY = y + height - resolvedDescriptionTopOffset;
    const baseValueSize =
      valueFontSize ?? Math.max(16, Math.min(22, height * 0.32));
    const fittedValueSize = this.fitTextFontSize(
      value,
      baseValueSize,
      innerWidth,
      valueMaxLines,
      9,
    );
    const valueLineHeight = fittedValueSize * 1.02;

    return [
      this.panel(x, y, width, height, fill, border),
      this.filledRect(x + cardPadding, y + height - 4, innerWidth, 2, accent),
      this.renderCardText(
        align,
        innerX,
        labelY,
        innerWidth,
        label,
        labelSize,
        'F2',
        resolvedLabelColor,
        {
          maxWidth: innerWidth,
          maxLines: safeLabelMaxLines,
          lineHeight: labelLineHeight,
        },
      ),
      this.centeredText(
        innerX,
        valueY,
        innerWidth,
        value,
        fittedValueSize,
        'F2',
        resolvedValueColor,
        {
          maxWidth: innerWidth,
          maxLines: valueMaxLines,
          lineHeight: valueLineHeight,
        },
      ),
      description
        ? this.renderCardText(
            resolvedDescriptionAlign,
            innerX,
            descriptionY,
            innerWidth,
            description,
            descriptionSize,
            'F1',
            resolvedDescriptionColor,
            {
              maxWidth: innerWidth,
              maxLines: safeDescriptionMaxLines,
              lineHeight: descriptionLineHeight,
            },
          )
        : '',
      progressRatio === undefined
        ? ''
        : this.progressBar(
            innerX,
            y + 6,
            innerWidth,
            progressBarHeight,
            progressRatio,
            this.variantMetricTone(variant),
          ),
    ].join('');
  }

  private renderKpiGrid(
    cards: KpiGridCard[],
    {
      startX,
      startY,
      columns,
      cardWidth,
      cardHeight,
      gapX,
      gapY,
    }: RenderKpiGridOptions,
  ) {
    const safeColumns = Math.max(1, columns);
    const content = cards
      .map((card, index) => {
        const column = index % safeColumns;
        const row = Math.floor(index / safeColumns);
        const cardX = startX + column * (cardWidth + gapX);
        const cardY = startY - row * (cardHeight + gapY);

        return this.renderKpiCard({
          ...card,
          x: cardX,
          y: cardY,
          width: cardWidth,
          height: cardHeight,
        });
      })
      .join('');
    const rowCount =
      cards.length === 0 ? 0 : Math.ceil(cards.length / safeColumns);
    const nextY =
      rowCount === 0
        ? startY
        : startY - rowCount * cardHeight - Math.max(0, rowCount - 1) * gapY;

    return { content, nextY };
  }

  private metricCard(
    x: number,
    y: number,
    width: number,
    height: number,
    label: string,
    value: string,
    hint: string,
    tone: MetricTone | boolean = 'neutral',
    progressRatio?: number,
  ) {
    const resolvedTone =
      typeof tone === 'boolean' ? (tone ? 'warning' : 'neutral') : tone;
    return this.renderKpiCard({
      x,
      y,
      width,
      height,
      label,
      value,
      description: hint,
      variant: this.metricToneVariant(resolvedTone),
      align: 'center',
      descriptionAlign: 'center',
      cardPadding: 8,
      labelFontSize: 8,
      labelMaxLines: 1,
      labelTopOffset: 8,
      valueTopOffset: 22,
      descriptionFontSize: 8,
      descriptionMaxLines: 2,
      descriptionTopOffset: progressRatio === undefined ? 34 : 30,
      progressRatio,
    });
  }

  private scoreCard(
    x: number,
    y: number,
    width: number,
    height: number,
    score: number,
    monthLabel: string,
    generationDateLabel: string,
  ) {
    return this.renderKpiCard({
      x,
      y,
      width,
      height,
      label: 'Indice de performance',
      value: `${score} / 100`,
      description: this.performanceHeadline(score),
      variant: this.metricToneVariant(this.performanceTone(score)),
      align: 'center',
      descriptionAlign: 'center',
      cardPadding: 10,
      labelFontSize: 9.5,
      labelMaxLines: 1,
      labelTopOffset: 12,
      valueTopOffset: 34,
      valueFontSize: 34,
      descriptionFontSize: 10.5,
      descriptionMaxLines: 1,
      descriptionTopOffset: 58,
      valueColor: this.slate900,
    });
  }

  private sectionPanel(
    x: number,
    y: number,
    width: number,
    height: number,
    title: string,
    subtitle: string,
    tone: MetricTone = 'neutral',
  ) {
    const colors = this.toneColors(tone);
    const innerWidth = width - 36;

    return [
      this.panel(x, y, width, height, colors.fill, colors.border),
      this.filledRect(x, y + height - 4, width, 4, colors.accent),
      this.text(x + 18, y + height - 22, title, 13, 'F2', this.slate900, {
        maxWidth: innerWidth,
        maxLines: 1,
      }),
      subtitle
        ? this.text(x + 18, y + height - 38, subtitle, 9, 'F1', this.slate500, {
            maxWidth: innerWidth,
            maxLines: 2,
            lineHeight: 10.5,
          })
        : '',
    ].join('');
  }

  private miniStatCard(
    x: number,
    y: number,
    width: number,
    height: number,
    label: string,
    value: string,
    hint: string,
    tone: MetricTone = 'neutral',
  ) {
    return this.renderKpiCard({
      x,
      y,
      width,
      height,
      label,
      value,
      description: hint,
      variant: this.metricToneVariant(tone),
      align: 'center',
      descriptionAlign: 'center',
      cardPadding: 6,
      labelFontSize: 7.5,
      labelMaxLines: 1,
      labelTopOffset: 8,
      valueTopOffset: 22,
      descriptionFontSize: 7.5,
      descriptionMaxLines: 1,
      descriptionTopOffset: 34,
    });
  }

  private miniMetric(
    x: number,
    y: number,
    label: string,
    value: string,
    hint: string,
  ) {
    const labelY = y + 24;
    const valueY = this.nextLineY(labelY, 2);
    const hintY = this.nextLineY(valueY, 2);

    return [
      this.smallLabel(x, labelY, label),
      this.text(x, valueY, value, 13, 'F2', this.slate900),
      this.text(x, hintY, hint, 8, 'F1', this.slate500),
    ].join('');
  }

  private compactKpiCard(
    x: number,
    y: number,
    width: number,
    height: number,
    label: string,
    value: string,
    tone: MetricTone = 'neutral',
    hint?: string,
  ) {
    return this.renderKpiCard({
      x,
      y,
      width,
      height,
      label,
      value,
      description: hint,
      variant: this.metricToneVariant(tone),
      align: 'center',
      descriptionAlign: 'center',
      cardPadding: 6,
      labelFontSize: 7,
      labelMaxLines: 1,
      labelTopOffset: 8,
      valueTopOffset: 22,
      descriptionFontSize: 6.8,
      descriptionMaxLines: 1,
      descriptionTopOffset: 34,
      valueFontSize:
        value.length > 18
          ? 9
          : value.length > 12
            ? 10.5
            : value.length > 7
              ? 13
              : 17,
      valueMaxLines: value.length > 14 ? 2 : 1,
    });
  }

  private renderCardText(
    align: KpiCardAlign,
    x: number,
    y: number,
    width: number,
    value: string,
    fontSize: number,
    font: 'F1' | 'F2',
    color: RgbColor,
    options: PdfTextOptions,
  ) {
    return align === 'center'
      ? this.centeredText(x, y, width, value, fontSize, font, color, options)
      : this.text(x, y, value, fontSize, font, color, {
          ...options,
          maxWidth: width,
        });
  }

  private fitTextFontSize(
    value: string,
    desiredSize: number,
    maxWidth: number,
    maxLines: number,
    minSize: number,
  ) {
    let size = desiredSize;

    while (size > minSize) {
      const lines = this.wrapText(value, size, maxWidth, maxLines);
      const widestLine = lines.reduce(
        (currentMax, line) =>
          Math.max(currentMax, this.measureText(line, size)),
        0,
      );

      if (widestLine <= maxWidth && lines.length <= maxLines) {
        break;
      }

      size -= 0.5;
    }

    return Math.max(minSize, size);
  }

  private metricToneVariant(tone: MetricTone): KpiCardVariant {
    switch (tone) {
      case 'positive':
        return 'success';
      case 'warning':
        return 'warning';
      case 'critical':
        return 'critical';
      default:
        return 'neutral';
    }
  }

  private variantMetricTone(variant: KpiCardVariant): MetricTone {
    switch (variant) {
      case 'success':
        return 'positive';
      case 'warning':
        return 'warning';
      case 'critical':
        return 'critical';
      default:
        return 'neutral';
    }
  }

  private kpiVariantPalette(variant: KpiCardVariant) {
    const colors = this.toneColors(this.variantMetricTone(variant));

    return {
      accent: colors.accent,
      border: this.slate300,
      fill: this.white,
    };
  }

  private labelValuePair(
    x: number,
    y: number,
    width: number,
    label: string,
    value: string,
  ) {
    const labelY = y + 16;
    const valueY = this.nextLineY(labelY, 2);

    return [
      this.smallLabel(x, labelY, label, this.slate500, {
        maxWidth: width,
        maxLines: 1,
      }),
      this.text(x, valueY, value, 11.5, 'F2', this.slate900, {
        maxWidth: width,
        lineHeight: 11.5,
        maxLines: 2,
      }),
    ].join('');
  }

  private smallLabel(
    x: number,
    y: number,
    label: string,
    color: RgbColor = this.slate500,
    options: PdfTextOptions = {},
  ) {
    return this.text(x, y, label.toUpperCase(), 7.5, 'F2', color, options);
  }

  private statusBadge(x: number, y: number, statusLabel: string) {
    const tone = this.statusTone(statusLabel);
    const colors = this.toneColors(tone);
    const textValue = this.truncate(statusLabel, 16);
    const width = Math.max(58, textValue.length * 4.6 + 16);

    return [
      this.panel(x, y, width, 12, colors.fill, colors.border),
      this.text(x + 8, y + 3, textValue, 7.5, 'F2', colors.accent, {
        maxWidth: width - 16,
        maxLines: 1,
      }),
    ].join('');
  }

  private footer(pageNumber: number, totalPages: number) {
    return [
      this.horizontalLine(
        this.margin,
        24,
        this.pageWidth - this.margin,
        this.slate300,
        0.8,
      ),
      this.text(
        this.margin,
        12,
        'Rapport RH Konatech - lecture mensuelle',
        8,
        'F1',
        this.slate500,
        { maxWidth: 220, maxLines: 1 },
      ),
      this.text(
        this.pageWidth - 102,
        12,
        `Page ${pageNumber} / ${totalPages}`,
        8,
        'F1',
        this.slate500,
        { maxWidth: 70, maxLines: 1 },
      ),
    ].join('');
  }

  private presenceTone(presenceRate: number): MetricTone {
    if (presenceRate >= 95) {
      return 'positive';
    }

    if (presenceRate >= 85) {
      return 'warning';
    }

    return 'critical';
  }

  private countTone(
    value: number,
    warningThreshold: number,
    criticalThreshold: number,
  ): MetricTone {
    if (value <= 0) {
      return 'positive';
    }

    if (value < warningThreshold) {
      return 'positive';
    }

    if (value < criticalThreshold) {
      return 'warning';
    }

    return 'critical';
  }

  private performanceTone(score: number): MetricTone {
    if (score >= 90) {
      return 'positive';
    }

    if (score >= 75) {
      return 'warning';
    }

    return 'critical';
  }

  private performanceLabel(score: number) {
    if (score >= 90) {
      return 'Très bon niveau RH';
    }

    if (score >= 75) {
      return 'Niveau à surveiller';
    }

    return "Priorité d'attention";
  }

  private performanceHeadline(score: number) {
    if (score >= 90) {
      return 'Performance excellente';
    }

    if (score >= 75) {
      return 'Performance \u00e0 surveiller';
    }

    if (score >= 60) {
      return 'Performance fragile';
    }

    return 'Performance faible';
  }

  private gpsInsideZoneTone(
    insideZonePointages: number,
    gpsValidatedPointages: number,
  ): MetricTone {
    if (insideZonePointages <= 0) {
      return 'critical';
    }

    if (insideZonePointages < gpsValidatedPointages) {
      return 'warning';
    }

    return 'positive';
  }

  private gpsModeTone(modeLabel: string): MetricTone {
    return modeLabel.toLowerCase().includes('gps') ? 'positive' : 'warning';
  }

  private statusTone(statusLabel: string): MetricTone {
    switch (statusLabel) {
      case 'Présent':
        return 'positive';
      case 'Retard':
      case 'Pointage incomplet':
        return 'warning';
      case 'Absence':
        return 'critical';
      default:
        return 'neutral';
    }
  }

  private toneColors(tone: MetricTone) {
    switch (tone) {
      case 'positive':
        return {
          accent: this.green,
          border: this.green,
          fill: this.greenSoft,
        };
      case 'warning':
        return {
          accent: this.orange,
          border: this.orange,
          fill: this.orangeSoft,
        };
      case 'critical':
        return {
          accent: this.red,
          border: this.red,
          fill: this.redSoft,
        };
      default:
        return {
          accent: this.slate700,
          border: this.slate300,
          fill: this.white,
        };
    }
  }

  private panel(
    x: number,
    y: number,
    width: number,
    height: number,
    fill: RgbColor,
    stroke: RgbColor,
  ) {
    return this.rect(x, y, width, height, fill, stroke, 1);
  }

  private filledRect(
    x: number,
    y: number,
    width: number,
    height: number,
    fill: RgbColor,
  ) {
    return this.rect(x, y, width, height, fill, null, 0);
  }

  private outlineRect(
    x: number,
    y: number,
    width: number,
    height: number,
    stroke: RgbColor,
  ) {
    return this.rect(x, y, width, height, null, stroke, 1);
  }

  private rect(
    x: number,
    y: number,
    width: number,
    height: number,
    fill: RgbColor | null,
    stroke: RgbColor | null,
    lineWidth: number,
  ) {
    const fillInstruction = fill ? `${this.color(fill)} rg ` : '';
    const strokeInstruction = stroke ? `${this.color(stroke)} RG ` : '';
    const operator = fill && stroke ? 'B' : fill ? 'f' : 'S';

    return `q ${fillInstruction}${strokeInstruction}${lineWidth.toFixed(2)} w ${this.formatNumber(x)} ${this.formatNumber(y)} ${this.formatNumber(width)} ${this.formatNumber(height)} re ${operator} Q\n`;
  }

  private horizontalLine(
    startX: number,
    y: number,
    endX: number,
    color: RgbColor,
    lineWidth: number,
  ) {
    return `q ${this.color(color)} RG ${lineWidth.toFixed(2)} w ${this.formatNumber(startX)} ${this.formatNumber(y)} m ${this.formatNumber(endX)} ${this.formatNumber(y)} l S Q\n`;
  }

  private verticalLine(
    x: number,
    startY: number,
    endY: number,
    color: RgbColor,
    lineWidth: number,
  ) {
    return `q ${this.color(color)} RG ${lineWidth.toFixed(2)} w ${this.formatNumber(x)} ${this.formatNumber(startY)} m ${this.formatNumber(x)} ${this.formatNumber(endY)} l S Q\n`;
  }

  private text(
    x: number,
    y: number,
    value: string,
    fontSize: number,
    font: 'F1' | 'F2',
    color: RgbColor,
    options: PdfTextOptions = {},
  ) {
    const availableWidth =
      options.maxWidth === undefined
        ? undefined
        : Math.max(
            0,
            Math.min(options.maxWidth, this.pageWidth - this.margin - x),
          );
    const lines = this.wrapText(
      value,
      fontSize,
      availableWidth,
      options.maxLines,
    );
    const lineHeight = options.lineHeight ?? fontSize * 1.2;

    return lines
      .map(
        (line, index) =>
          `q ${this.color(color)} rg BT /${font} ${fontSize.toFixed(2)} Tf 1 0 0 1 ${this.formatNumber(x)} ${this.formatNumber(y - lineHeight * index)} Tm (${this.escapeText(line)}) Tj ET Q\n`,
      )
      .join('');
  }

  private centeredText(
    x: number,
    y: number,
    width: number,
    value: string,
    fontSize: number,
    font: 'F1' | 'F2',
    color: RgbColor,
    options: PdfTextOptions = {},
  ) {
    const maxWidth = Math.max(0, Math.min(options.maxWidth ?? width, width));
    const lines = this.wrapText(value, fontSize, maxWidth, options.maxLines);
    const lineHeight = options.lineHeight ?? fontSize * 1.2;

    return lines
      .map((line, index) => {
        const lineWidth = Math.min(this.measureText(line, fontSize), maxWidth);
        const lineX = x + Math.max(0, (width - lineWidth) / 2);

        return `q ${this.color(color)} rg BT /${font} ${fontSize.toFixed(2)} Tf 1 0 0 1 ${this.formatNumber(lineX)} ${this.formatNumber(y - lineHeight * index)} Tm (${this.escapeText(line)}) Tj ET Q\n`;
      })
      .join('');
  }

  private nextLineY(
    startY: number,
    lineOffset: number,
    gap: number = this.LINE_GAP,
  ) {
    return startY - gap * lineOffset;
  }

  private progressBar(
    x: number,
    y: number,
    width: number,
    height: number,
    ratio: number,
    tone: MetricTone = 'neutral',
  ) {
    const colors = this.toneColors(tone);
    const safeRatio = Math.max(0, Math.min(1, ratio));

    return [
      this.panel(x, y, width, height, this.white, this.slate300),
      this.filledRect(x, y, width * safeRatio, height, colors.accent),
    ].join('');
  }

  private wrapText(
    value: string,
    fontSize: number,
    maxWidth?: number,
    maxLines?: number,
  ) {
    const paragraphs = value
      .split(/\r?\n/g)
      .map((item) => item.replace(/\s+/g, ' ').trim());
    const lines: string[] = [];

    for (const paragraph of paragraphs) {
      if (!paragraph) {
        lines.push('');
        continue;
      }

      if (!maxWidth || this.measureText(paragraph, fontSize) <= maxWidth) {
        lines.push(paragraph);
        continue;
      }

      let currentLine = '';

      for (const word of paragraph.split(' ')) {
        const candidate = currentLine ? `${currentLine} ${word}` : word;

        if (this.measureText(candidate, fontSize) <= maxWidth) {
          currentLine = candidate;
          continue;
        }

        if (currentLine) {
          lines.push(currentLine);
        }

        if (this.measureText(word, fontSize) <= maxWidth) {
          currentLine = word;
          continue;
        }

        let segment = '';

        for (const character of word) {
          const nextSegment = `${segment}${character}`;

          if (segment && this.measureText(nextSegment, fontSize) > maxWidth) {
            lines.push(segment);
            segment = character;
            continue;
          }

          segment = nextSegment;
        }

        currentLine = segment;
      }

      if (currentLine) {
        lines.push(currentLine);
      }
    }

    if (!maxLines || lines.length <= maxLines) {
      return lines;
    }

    const limitedLines = lines.slice(0, maxLines);
    const lastLineIndex = maxLines - 1;

    limitedLines[lastLineIndex] = this.ellipsizeText(
      limitedLines[lastLineIndex] ?? '',
      fontSize,
      maxWidth,
    );

    return limitedLines;
  }

  private ellipsizeText(value: string, fontSize: number, maxWidth?: number) {
    if (!maxWidth || this.measureText(value, fontSize) <= maxWidth) {
      return value;
    }

    const suffix = '...';
    let output = value.trim();

    while (
      output.length > 1 &&
      this.measureText(`${output}${suffix}`, fontSize) > maxWidth
    ) {
      output = output.slice(0, -1).trimEnd();
    }

    return output ? `${output}${suffix}` : suffix;
  }

  private measureText(value: string, fontSize: number) {
    let width = 0;

    for (const character of value) {
      if (' .,:;|!ijlrt()[]'.includes(character)) {
        width += fontSize * 0.26;
        continue;
      }

      if ("'`".includes(character)) {
        width += fontSize * 0.18;
        continue;
      }

      if ('mwMW@%&QG'.includes(character)) {
        width += fontSize * 0.78;
        continue;
      }

      if ('0123456789'.includes(character)) {
        width += fontSize * 0.52;
        continue;
      }

      width += fontSize * 0.56;
    }

    return width;
  }

  private color(value: RgbColor) {
    return value.map((item) => item.toFixed(3)).join(' ');
  }

  private formatNumber(value: number) {
    return value.toFixed(2);
  }

  private truncate(value: string, maxLength: number) {
    if (value.length <= maxLength) {
      return value;
    }

    return `${value.slice(0, maxLength - 3)}...`;
  }

  private localizeDepartment(value: string) {
    return value === 'Unassigned' ? 'Non affecté' : value;
  }

  private localizeSchedule(value: string) {
    return value === 'No schedule assigned' ? 'Aucun planning' : value;
  }

  private formatPeriod(month: number, year: number) {
    const label = this.frenchMonthLabels[month - 1] ?? String(month);

    return `${this.capitalize(label)} ${year}`;
  }

  private formatGeneratedAt(value: string) {
    const date = new Date(value);
    const day = String(date.getUTCDate()).padStart(2, '0');
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const year = date.getUTCFullYear();
    const hours = String(date.getUTCHours()).padStart(2, '0');
    const minutes = String(date.getUTCMinutes()).padStart(2, '0');

    return `${day}/${month}/${year} ${hours}:${minutes}`;
  }

  private parseHoursAndMinutes(value: string) {
    if (!value) {
      return 0;
    }

    const [hours, minutes] = value.split(':').map((item) => Number(item));

    return (
      (Number.isFinite(hours) ? hours : 0) * 60 +
      (Number.isFinite(minutes) ? minutes : 0)
    );
  }

  private parseDecimalHours(value: string) {
    if (!value) {
      return 0;
    }

    const parsed = Number(value);

    return Number.isFinite(parsed) ? parsed : 0;
  }

  private formatMinutes(totalMinutes: number) {
    if (totalMinutes <= 0) {
      return '0 h 00';
    }

    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;

    return `${hours} h ${String(minutes).padStart(2, '0')}`;
  }

  private formatHours(value: number) {
    if (value <= 0) {
      return '0 h';
    }

    return `${value.toFixed(2).replace('.', ',')} h`;
  }

  private buildFileName(report: MonthlyAttendanceExportReport) {
    const scopeLabel = report.employeeReport?.fullName ?? '\u00e9quipe';
    const monthLabel =
      this.frenchMonthLabels[report.month - 1] ?? String(report.month);

    return `rapport-presence-${this.slugify(scopeLabel)}-${this.slugify(monthLabel)}-${report.year}.pdf`;
  }

  private slugify(value: string) {
    const normalized = value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');

    return normalized || 'rapport';
  }

  private capitalize(value: string) {
    if (!value) {
      return value;
    }

    return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
  }

  private escapeText(value: string) {
    return value
      .normalize('NFC')
      .replace(/[’`]/g, "'")
      .replace(/[–—]/g, '-')
      .replace(/\u00a0/g, ' ')
      .replace(/\\/g, '\\\\')
      .replace(/\(/g, '\\(')
      .replace(/\)/g, '\\)')
      .replace(/[\r\n\t]/g, ' ');
  }

  private chunkRows<T>(rows: T[], size: number) {
    if (rows.length === 0) {
      return [];
    }

    const pages: T[][] = [];

    for (let index = 0; index < rows.length; index += size) {
      pages.push(rows.slice(index, index + size));
    }

    return pages;
  }

  private assemblePdf(objects: Map<number, Buffer>) {
    const maxObjectId = Math.max(...objects.keys());
    const chunks: Buffer[] = [this.toBuffer('%PDF-1.4\n')];
    const offsets = new Array<number>(maxObjectId + 1).fill(0);
    let offset = chunks[0].length;

    for (let objectId = 1; objectId <= maxObjectId; objectId += 1) {
      const body = objects.get(objectId);

      if (!body) {
        continue;
      }

      offsets[objectId] = offset;

      const objectBuffer = Buffer.concat([
        this.toBuffer(`${objectId} 0 obj\n`),
        body,
        this.toBuffer('\nendobj\n'),
      ]);

      chunks.push(objectBuffer);
      offset += objectBuffer.length;
    }

    const xrefOffset = offset;
    const xrefRows = ['0000000000 65535 f '];

    for (let objectId = 1; objectId <= maxObjectId; objectId += 1) {
      xrefRows.push(`${String(offsets[objectId]).padStart(10, '0')} 00000 n `);
    }

    chunks.push(
      this.toBuffer(
        `xref\n0 ${maxObjectId + 1}\n${xrefRows.join(
          '\n',
        )}\ntrailer\n<< /Size ${
          maxObjectId + 1
        } /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`,
      ),
    );

    return Buffer.concat(chunks);
  }

  private toBuffer(value: string) {
    return Buffer.from(value, 'latin1');
  }
}
