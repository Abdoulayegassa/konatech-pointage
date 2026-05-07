import { Injectable } from '@nestjs/common';
import puppeteer from 'puppeteer';
import {
  MonthlyAttendanceDailyReportRow,
  MonthlyAttendanceEmployeeReport,
  MonthlyAttendanceExportReport,
  MonthlyAttendanceExportRow,
} from './monthly-attendance-export.types';

type TeamReportSummary = {
  totalEmployees: number;
  totalWorkingDays: number;
  totalPresenceDays: number;
  totalWorkedDays: number;
  totalOutsideScheduleWorkDays: number;
  totalAbsences: number;
  totalLateDays: number;
  totalIncompleteDays: number;
  totalOvertimeHours: number;
  totalOutsideScheduleOvertimeHours: number;
};

@Injectable()
export class MonthlyAttendancePuppeteerPdfRendererService {
  private readonly renderTimeoutMs = 60_000;
  private readonly employeeRowsPerPage = 21;
  private readonly teamRowsPerPage = 14;
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

  async render(report: MonthlyAttendanceExportReport): Promise<Buffer> {
    const browser = await puppeteer.launch(this.buildLaunchOptions());

    try {
      const page = await browser.newPage();

      page.setDefaultNavigationTimeout(this.renderTimeoutMs);
      page.setDefaultTimeout(this.renderTimeoutMs);
      await page.setViewport({
        width: 1240,
        height: 1754,
        deviceScaleFactor: 1,
      });
      await page.emulateMediaType('print');
      const document = Buffer.from(this.buildDocument(report), 'utf8').toString(
        'utf8',
      );
      await page.setContent(document, {
        waitUntil: 'networkidle0',
        timeout: this.renderTimeoutMs,
      });
      await page.waitForFunction('document.readyState === "complete"');
      await page.evaluate('document.fonts ? document.fonts.ready : Promise.resolve()');
      await page.evaluate(async () => {
        await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
        await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
      });

      const pdf = await page.pdf({
        format: 'A4',
        printBackground: true,
        preferCSSPageSize: true,
        margin: {
          top: '0',
          right: '0',
          bottom: '0',
          left: '0',
        },
      });

      return Buffer.from(pdf);
    } finally {
      await browser.close();
    }
  }

  private buildLaunchOptions(): Parameters<typeof puppeteer.launch>[0] {
    const executablePath = process.env.ATTENDANCE_PDF_EXECUTABLE_PATH?.trim();

    return {
      headless: true,
      ...(executablePath ? { executablePath } : {}),
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
      ],
    };
  }

  private buildDocument(report: MonthlyAttendanceExportReport) {
    const totalPages = report.employeeReport
      ? 2 +
        Math.max(
          this.chunkRows(report.employeeReport.dailyRows, this.employeeRowsPerPage)
            .length,
          1,
        )
      : 1 + Math.max(this.chunkRows(report.rows, this.teamRowsPerPage).length, 1);
    const pages = report.employeeReport
      ? this.buildEmployeePages(report, report.employeeReport, totalPages)
      : this.buildTeamPages(report, totalPages);

    return `<!DOCTYPE html>
<html lang="fr">
  <head>
    <meta charset="UTF-8" />
    <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${this.escapeHtml(this.buildDocumentTitle(report))}</title>
    <style>
      ${this.buildStyles()}
    </style>
  </head>
  <body>
    ${pages.join('\n')}
  </body>
</html>`;
  }

  private buildStyles() {
    return `
      @font-face {
        font-family: "KonatechPdfSans";
        src: local("Arial"), local("Roboto"), local("Inter");
        font-weight: 400;
        font-style: normal;
      }

      @font-face {
        font-family: "KonatechPdfSans";
        src: local("Arial Bold"), local("Roboto Bold"), local("Inter Bold"), local("Arial");
        font-weight: 700 800;
        font-style: normal;
      }

      :root {
        --orange: #F97316;
        --orange-soft: #FFF7ED;
        --text: #0F172A;
        --text-soft: #64748B;
        --border: #E2E8F0;
        --surface: #FFFFFF;
        --surface-soft: #F8FAFC;
        --success: #16A34A;
        --danger: #DC2626;
        --warning: #F59E0B;
        --blue: #2563EB;
        --indigo: #4F46E5;
        --danger-soft: #FEF2F2;
        --warning-soft: #FFF7E8;
        --success-soft: #F0FDF4;
        --info-soft: #EFF6FF;
        --radius-lg: 22px;
        --radius-md: 16px;
        --radius-sm: 999px;
        --shadow-soft: 0 18px 42px rgba(15, 23, 42, 0.08);
      }

      * {
        box-sizing: border-box;
      }

      @page {
        size: A4 portrait;
        margin: 0;
      }

      html,
      body {
        margin: 0;
        padding: 0;
        font-family: "KonatechPdfSans", Arial, sans-serif;
        color: var(--text);
        background: #ffffff;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
        text-rendering: geometricPrecision;
        font-kerning: normal;
      }

      body {
        font-size: 11px;
        line-height: 1.45;
      }

      .page {
        width: 210mm;
        height: 297mm;
        padding: 14mm 14mm 22mm;
        background:
          radial-gradient(circle at top right, rgba(249, 115, 22, 0.10), transparent 24%),
          linear-gradient(180deg, #ffffff 0%, #f8fafc 100%);
        position: relative;
        break-after: page;
        page-break-after: always;
        overflow: visible;
      }

      .page:last-child {
        break-after: auto;
        page-break-after: auto;
      }

      .page > section,
      .page > .page-topline {
        margin-top: 12px;
      }

      .page > .page-topline {
        margin-top: 0;
      }

      .page > .page-topline + section {
        margin-top: 12px;
      }

      .page-synthesis .advanced-grid,
      .page-synthesis .analysis-card {
        display: none;
      }

      .page-topline {
        height: 8px;
        border-radius: var(--radius-sm);
        background: linear-gradient(90deg, var(--orange) 0%, #FDBA74 45%, #0F172A 100%);
      }

      .eyebrow {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 7px 12px;
        border-radius: var(--radius-sm);
        background: rgba(249, 115, 22, 0.12);
        color: var(--orange);
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 0.12em;
        text-transform: uppercase;
        white-space: nowrap;
        word-break: normal;
        overflow-wrap: normal;
      }

      .eyebrow::before {
        content: "";
        width: 8px;
        height: 8px;
        border-radius: 999px;
        background: var(--orange);
      }

      .hero {
        display: grid;
        grid-template-columns: minmax(0, 1fr) 220px;
        gap: 14px;
        align-items: stretch;
      }

      .hero-title {
        margin: 0;
        font-size: 29px;
        line-height: 1.05;
        font-weight: 700;
        color: var(--text);
      }

      .hero-subtitle {
        margin: 8px 0 0;
        font-size: 14px;
        font-weight: 600;
        color: var(--text-soft);
      }

      .hero-copy {
        margin: 10px 0 0;
        color: var(--text-soft);
        font-size: 12px;
      }

      .meta-card,
      .card {
        background: rgba(255, 255, 255, 0.96);
        border: 1px solid var(--border);
        border-radius: var(--radius-lg);
        box-shadow: var(--shadow-soft);
        break-inside: avoid;
        page-break-inside: avoid;
      }

      .meta-card {
        padding: 16px;
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        background: linear-gradient(180deg, rgba(255, 247, 237, 0.96) 0%, rgba(255, 255, 255, 0.98) 100%);
      }

      .meta-label,
      .section-kicker {
        margin: 0;
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 0.12em;
        text-transform: uppercase;
        color: var(--text-soft);
        white-space: normal;
        word-break: normal;
        overflow-wrap: normal;
      }

      .meta-value {
        margin: 12px 0 0;
        font-size: 18px;
        line-height: 1.2;
        font-weight: 700;
        color: var(--text);
      }

      .meta-copy {
        margin: 10px 0 0;
        color: var(--text-soft);
        font-size: 11px;
      }

      .card {
        padding: 16px 18px;
      }

      .section-header {
        display: flex;
        justify-content: space-between;
        gap: 12px;
        align-items: center;
        margin-bottom: 12px;
      }

      .section-title {
        margin: 4px 0 0;
        font-size: 16px;
        line-height: 1.2;
        font-weight: 700;
        color: var(--text);
        word-break: normal;
        overflow-wrap: normal;
      }

      .section-copy {
        margin: 0;
        font-size: 11px;
        color: var(--text-soft);
      }

      .info-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 10px;
      }

      .info-item {
        border: 1px solid var(--border);
        border-radius: var(--radius-md);
        background: var(--surface-soft);
        padding: 12px 14px;
      }

      .info-label {
        margin: 0;
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: var(--text-soft);
      }

      .info-value {
        margin: 8px 0 0;
        font-size: 13px;
        line-height: 1.35;
        font-weight: 700;
        color: var(--text);
      }

      .score-card {
        text-align: center;
        padding: 22px 24px;
      }

      .score-pill {
        margin: 12px auto 0;
        width: 124px;
        height: 124px;
        border-radius: 999px;
        display: grid;
        place-items: center;
        border: 10px solid rgba(79, 70, 229, 0.14);
        background:
          radial-gradient(circle at center, #ffffff 50%, rgba(79, 70, 229, 0.06) 100%);
        color: var(--indigo);
      }

      .score-pill--success {
        border-color: rgba(22, 163, 74, 0.18);
        background:
          radial-gradient(circle at center, #ffffff 50%, rgba(22, 163, 74, 0.10) 100%);
        color: var(--success);
      }

      .score-pill--warning {
        border-color: rgba(245, 158, 11, 0.22);
        background:
          radial-gradient(circle at center, #ffffff 50%, rgba(245, 158, 11, 0.11) 100%);
        color: #B45309;
      }

      .score-pill--danger {
        border-color: rgba(220, 38, 38, 0.18);
        background:
          radial-gradient(circle at center, #ffffff 50%, rgba(220, 38, 38, 0.10) 100%);
        color: var(--danger);
      }

      .score-pill--info {
        border-color: rgba(37, 99, 235, 0.18);
        background:
          radial-gradient(circle at center, #ffffff 50%, rgba(37, 99, 235, 0.09) 100%);
        color: var(--blue);
      }

      .score-value {
        font-size: 34px;
        line-height: 1;
        font-weight: 800;
      }

      .score-caption {
        margin: 4px 0 0;
        font-size: 11px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.08em;
      }

      .score-highlight {
        margin: 12px auto 0;
      }

      .score-meter {
        margin: 14px auto 0;
        width: min(360px, 100%);
        height: 12px;
        border-radius: 999px;
        background: rgba(226, 232, 240, 0.95);
        overflow: hidden;
      }

      .score-meter-fill {
        height: 100%;
        border-radius: inherit;
        background: linear-gradient(90deg, var(--blue) 0%, #60A5FA 100%);
      }

      .score-meter-fill--success {
        background: linear-gradient(90deg, var(--success) 0%, #4ADE80 100%);
      }

      .score-meter-fill--warning {
        background: linear-gradient(90deg, var(--warning) 0%, #FCD34D 100%);
      }

      .score-meter-fill--danger {
        background: linear-gradient(90deg, var(--danger) 0%, #F87171 100%);
      }

      .score-meter-fill--info {
        background: linear-gradient(90deg, var(--blue) 0%, #60A5FA 100%);
      }

      .score-narrative {
        margin: 14px auto 0;
        max-width: 540px;
        color: var(--text-soft);
      }

      .kpi-grid {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 10px;
      }

      .kpi-card {
        border: 1px solid var(--border);
        border-radius: var(--radius-md);
        background: rgba(248, 250, 252, 0.95);
        padding: 12px 14px;
        min-height: 112px;
        break-inside: avoid;
        page-break-inside: avoid;
      }

      .kpi-card--success {
        border-color: rgba(22, 163, 74, 0.18);
        background: rgba(240, 253, 244, 0.98);
      }

      .kpi-card--warning {
        border-color: rgba(245, 158, 11, 0.22);
        background: rgba(255, 251, 235, 0.98);
      }

      .kpi-card--danger {
        border-color: rgba(220, 38, 38, 0.16);
        background: rgba(254, 242, 242, 0.98);
      }

      .kpi-card--info {
        border-color: rgba(37, 99, 235, 0.18);
        background: rgba(239, 246, 255, 0.98);
      }

      .kpi-label {
        margin: 0;
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: var(--text-soft);
      }

      .kpi-value {
        margin: 12px 0 0;
        font-size: 24px;
        line-height: 1;
        font-weight: 800;
        color: var(--text);
      }

      .kpi-description {
        margin: 10px 0 0;
        color: var(--text-soft);
        font-size: 11px;
      }

      .advanced-grid,
      .callout-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 10px;
      }

      .advanced-list,
      .analysis-list,
      .note-list {
        margin: 0;
        padding: 0;
        list-style: none;
        display: grid;
        gap: 8px;
      }

      .advanced-item,
      .analysis-item,
      .note-item {
        display: flex;
        gap: 10px;
        align-items: flex-start;
        color: var(--text);
      }

      .advanced-item::before,
      .analysis-item::before,
      .note-item::before {
        content: "";
        width: 8px;
        height: 8px;
        margin-top: 6px;
        border-radius: 999px;
        background: var(--orange);
        flex: 0 0 auto;
      }

      .advanced-stat {
        font-weight: 800;
        color: var(--text);
      }

      .advanced-copy,
      .analysis-copy,
      .note-copy {
        color: var(--text-soft);
      }

      .analysis-card {
        background:
          linear-gradient(180deg, rgba(255, 255, 255, 0.98) 0%, rgba(248, 250, 252, 0.98) 100%);
      }

      .compact-header {
        display: flex;
        justify-content: space-between;
        gap: 12px;
        align-items: flex-start;
      }

      .compact-header > div:first-child {
        flex: 1 1 auto;
        min-width: 0;
      }

      .compact-header .eyebrow {
        display: inline-flex;
        width: auto;
        max-width: 100%;
        white-space: nowrap;
        letter-spacing: 0.08em;
      }

      .compact-title {
        margin: 8px 0 0;
        font-size: 20px;
        line-height: 1.1;
        font-weight: 700;
        word-break: normal;
        overflow-wrap: normal;
      }

      .compact-meta {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        justify-content: flex-end;
        flex: 0 0 auto;
        max-width: 38%;
      }

      .detail-header {
        display: grid;
        gap: 6px;
      }

      .page-details {
        padding-top: 11mm;
        padding-bottom: 18mm;
      }

      .page-details > section,
      .page-details > .page-topline {
        margin-top: 8px;
      }

      .page-details > .page-topline + section {
        margin-top: 8px;
      }

      .page-details .page-topline {
        height: 6px;
      }

      .detail-header,
      .detail-header * {
        writing-mode: horizontal-tb;
        transform: none;
      }

      .detail-header-copy {
        min-width: 0;
      }

      .detail-subtitle,
      .detail-meta-line {
        margin: 0;
        font-size: 10px;
        line-height: 1.25;
        color: var(--text-soft);
        word-break: normal;
        overflow-wrap: normal;
      }

      .detail-meta-line strong {
        color: var(--text);
        font-weight: 700;
      }

      .detail-meta-separator {
        display: inline-block;
        padding: 0 6px;
        color: var(--text-soft);
      }

      .badge {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-height: 28px;
        padding: 7px 10px;
        border-radius: var(--radius-sm);
        font-size: 10px;
        line-height: 1.2;
        font-weight: 700;
        letter-spacing: 0.04em;
        border: 1px solid transparent;
        white-space: nowrap;
        word-break: normal;
        overflow-wrap: normal;
        max-width: 100%;
        flex: 0 0 auto;
      }

      .badge--success {
        background: rgba(22, 163, 74, 0.12);
        color: var(--success);
        border-color: rgba(22, 163, 74, 0.18);
      }

      .badge--danger {
        background: rgba(220, 38, 38, 0.10);
        color: var(--danger);
        border-color: rgba(220, 38, 38, 0.16);
      }

      .badge--warning {
        background: rgba(245, 158, 11, 0.14);
        color: #B45309;
        border-color: rgba(245, 158, 11, 0.20);
      }

      .badge--info {
        background: rgba(37, 99, 235, 0.10);
        color: var(--blue);
        border-color: rgba(37, 99, 235, 0.18);
      }

      .badge--neutral {
        background: rgba(100, 116, 139, 0.10);
        color: var(--text-soft);
        border-color: rgba(100, 116, 139, 0.18);
      }

      .table-card {
        padding: 10px 10px 8px;
      }

      .page-details .compact-title {
        margin: 4px 0 0;
        font-size: 16px;
      }

      .page-details .table-card {
        padding: 8px 8px 6px;
      }

      .page-details .section-header {
        margin-bottom: 8px;
        gap: 8px;
      }

      .page-details .section-kicker {
        font-size: 8.4px;
      }

      .page-details .section-title {
        margin-top: 2px;
        font-size: 13px;
      }

      .table-shell {
        border: 1px solid var(--border);
        border-radius: 16px;
        overflow: hidden;
        background: rgba(255, 255, 255, 0.98);
        break-inside: avoid;
        page-break-inside: avoid;
      }

      table {
        width: 100%;
        border-collapse: collapse;
        table-layout: auto;
      }

      thead {
        display: table-header-group;
      }

      tbody {
        display: table-row-group;
      }

      th,
      td {
        padding: 6px 9px;
        border-bottom: 1px solid var(--border);
        vertical-align: middle;
        text-align: left;
        word-break: normal;
        overflow-wrap: normal;
        line-height: 1.2;
      }

      th {
        font-size: 8.4px;
        font-weight: 800;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: var(--text-soft);
        background: rgba(248, 250, 252, 0.98);
        white-space: nowrap;
      }

      td {
        font-size: 9.4px;
        color: var(--text);
      }

      tr:last-child td {
        border-bottom: 0;
      }

      tbody tr:nth-child(even) td {
        background: rgba(248, 250, 252, 0.62);
      }

      tr,
      td,
      th {
        break-inside: avoid;
        page-break-inside: avoid;
      }

      .table-identity {
        display: grid;
        gap: 2px;
      }

      .table-identity strong {
        font-size: 10.2px;
        word-break: normal;
        overflow-wrap: normal;
      }

      .table-identity span,
      .table-muted,
      .empty-copy {
        color: var(--text-soft);
      }

      .table-shell .badge {
        display: inline-flex;
        min-width: 70px;
        white-space: nowrap;
        text-align: center;
        word-break: normal;
        overflow-wrap: normal;
      }

      .page-details .section-title,
      .page-details .section-kicker,
      .page-details .badge,
      .page-details .eyebrow {
        white-space: nowrap;
        word-break: normal;
        overflow-wrap: normal;
      }

      .page-details th,
      .page-details td {
        padding: 4px 7px;
        line-height: 1.15;
      }

      .page-details th {
        font-size: 7.8px;
      }

      .page-details td {
        font-size: 8.8px;
      }

      .page-details .table-identity strong {
        font-size: 9.4px;
      }

      .page-details .table-identity span {
        font-size: 8.1px;
      }

      .page-details .badge {
        min-height: 22px;
        padding: 5px 8px;
        font-size: 9px;
      }

      .table-value-empty {
        color: var(--text-soft);
        display: inline-block;
        min-height: 1em;
      }

      .team-summary-grid {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 10px;
      }

      .team-notes {
        display: grid;
        gap: 8px;
      }

      .footer {
        position: absolute;
        left: 14mm;
        right: 14mm;
        bottom: 14mm;
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 12px;
        color: var(--text-soft);
        font-size: 10px;
      }

      .footer strong {
        color: var(--text);
        white-space: nowrap;
      }

      .page-details .footer {
        bottom: 10mm;
        font-size: 9px;
      }

      .analysis-conclusion {
        border: 1px solid rgba(220, 38, 38, 0.14);
        border-left: 4px solid var(--danger);
        border-radius: var(--radius-md);
        background: linear-gradient(180deg, rgba(254, 242, 242, 0.96) 0%, rgba(255, 255, 255, 0.98) 100%);
        padding: 14px 16px;
        break-inside: avoid;
        page-break-inside: avoid;
      }

      .analysis-conclusion-title {
        margin: 0;
        font-size: 11px;
        font-weight: 800;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: var(--danger);
      }

      .analysis-conclusion-copy {
        margin: 8px 0 0;
        font-size: 11px;
        line-height: 1.5;
        color: var(--text);
      }
    `;
  }

  private buildEmployeePages(
    report: MonthlyAttendanceExportReport,
    employeeReport: MonthlyAttendanceEmployeeReport,
    totalPages: number,
  ) {
    const chunks = this.chunkRows(
      employeeReport.dailyRows,
      this.employeeRowsPerPage,
    );
    const effectiveChunks = chunks.length > 0 ? chunks : [[]];
    const pages = [
      this.buildEmployeeSummaryPage(report, employeeReport, 1, totalPages),
      this.buildEmployeeAnalysisPage(report, employeeReport, 2, totalPages),
    ];

    effectiveChunks.forEach((rows, index) => {
      pages.push(
        this.buildEmployeeDetailPage(
          report,
          employeeReport,
          rows,
          index + 3,
          totalPages,
        ),
      );
    });

    return pages;
  }

  private buildEmployeeSummaryPage(
    report: MonthlyAttendanceExportReport,
    employeeReport: MonthlyAttendanceEmployeeReport,
    pageNumber: number,
    totalPages: number,
  ) {
    return `<section class="page page-synthesis">
      <div class="page-topline"></div>
      <section class="hero">
        <div>
          <span class="eyebrow">KONATECH POINTAGE</span>
          <h1 class="hero-title">Rapport mensuel de présence</h1>
          <p class="hero-subtitle">Synthèse RH | ${this.escapeHtml(employeeReport.monthLabel)}</p>
          <p class="hero-copy">
            Rapport premium aligné sur le flux de pointage actif, avec une lecture stable des indicateurs RH et de la conformité GPS.
          </p>
        </div>
        <aside class="meta-card">
          <div>
            <p class="meta-label">Génération</p>
            <p class="meta-value">${this.escapeHtml(employeeReport.generationDateLabel)}</p>
          </div>
          <p class="meta-copy">
            Rendu PDF unifié via Puppeteer. Export détaillé pour un employé.
          </p>
        </aside>
      </section>

      <section class="card">
        <div class="section-header">
          <div>
            <p class="section-kicker">Identité</p>
            <h2 class="section-title">Informations employé</h2>
          </div>
          ${this.renderBadge('Flux PDF Puppeteer', 'info')}
        </div>
        <div class="info-grid">
          ${this.infoItem("Nom de l'employé", employeeReport.fullName)}
          ${this.infoItem('Identifiant employe', employeeReport.employeeIdentifier)}
          ${this.infoItem('Département', employeeReport.departmentLabel)}
          ${this.infoItem('Planning', employeeReport.assignedScheduleLabel)}
        </div>
      </section>

      <section class="card score-card">
        <p class="section-kicker">Score global</p>
        <h2 class="section-title">Lecture RH consolidée du mois</h2>
        <div class="score-highlight">
          ${this.renderBadge(this.scoreLabel(employeeReport.performanceScore), this.scoreTone(employeeReport.performanceScore))}
        </div>
        <div class="score-pill score-pill--${this.scoreTone(employeeReport.performanceScore)}">
          <div>
            <div class="score-value">${employeeReport.performanceScore}</div>
            <div class="score-caption">/ 100</div>
          </div>
        </div>
        <div class="score-meter">
          <div class="score-meter-fill score-meter-fill--${this.scoreTone(employeeReport.performanceScore)}" style="width: ${this.clampScore(employeeReport.performanceScore)}%;"></div>
        </div>
        <p class="score-narrative">${this.escapeHtml(this.scoreNarrative(employeeReport))}</p>
      </section>

      <section class="kpi-grid">
        ${this.kpiCard(
          'Pr?sence',
          `${this.formatRate(employeeReport.presenceRate)} %`,
          `${employeeReport.presenceDays} / ${employeeReport.workingDays} jours planifi?s`,
          'success',
        )}
        ${this.kpiCard(
          'Absences',
          String(employeeReport.absenceCount),
          `${employeeReport.absenceCount} jour(s) d'absence`,
          employeeReport.absenceCount > 0 ? 'danger' : 'success',
        )}
        ${this.kpiCard(
          'Retards',
          String(employeeReport.lateCount),
          `${employeeReport.lateCount} occurrence(s) sur le mois`,
          employeeReport.lateCount > 0 ? 'warning' : 'success',
        )}
        ${this.kpiCard(
          'Heures travaill?es',
          employeeReport.totalWorkedHours,
          `${employeeReport.entryCount} entr?e(s) et ${employeeReport.exitCount} sortie(s)`,
          'info',
        )}
        ${this.kpiCard(
          'Heures suppl?mentaires',
          employeeReport.overtimeHours,
          `${employeeReport.scheduledOvertimeHours} planifi?es | ${employeeReport.outsideScheduleOvertimeHours} hors planning`,
          employeeReport.exitBreakdown.overtimeDayCount > 0 ? 'info' : 'success',
        )}
        ${this.kpiCard(
          'D?part t?t',
          String(employeeReport.earlyExitCount),
          `${employeeReport.earlyExitCount} journ?e(s) avec d?part t?t`,
          employeeReport.earlyExitCount > 0 ? 'warning' : 'success',
        )}
      </section>

      <section class="advanced-grid">
        <article class="card">
          <div class="section-header">
            <div>
              <p class="section-kicker">Retards à l'entrée</p>
              <h2 class="section-title">Distribution mensuelle</h2>
            </div>
          </div>
          <ul class="advanced-list">
            ${this.advancedItem('5 à 15 min', String(employeeReport.lateRangeBreakdown.fiveToFifteenCount), 'retard(s) léger(s) à surveiller')}
            ${this.advancedItem('16 à 30 min', String(employeeReport.lateRangeBreakdown.sixteenToThirtyCount), 'retard(s) modérés constatés')}
            ${this.advancedItem('Plus de 30 min', String(employeeReport.lateRangeBreakdown.overThirtyCount), 'retard(s) critiques sur la période')}
          </ul>
        </article>
        <article class="card">
          <div class="section-header">
            <div>
              <p class="section-kicker">Sécurité GPS</p>
              <h2 class="section-title">Conformité des pointages</h2>
            </div>
          </div>
          <ul class="advanced-list">
            ${this.advancedItem('Pointages GPS validés', String(employeeReport.gpsBreakdown.gpsValidatedPointages), 'validation géolocalisée conforme')}
            ${this.advancedItem('Pointages sans GPS', String(employeeReport.gpsBreakdown.nonGpsPointages), 'contrôle supplémentaire recommandé')}
            ${this.advancedItem('Dans la zone', String(employeeReport.gpsBreakdown.insideZonePointages), 'pointages reconnus dans le périmètre autorisé')}
            ${this.advancedItem('Mode actif', employeeReport.gpsBreakdown.modeLabel, report.currentVerificationModelLabel)}
          </ul>
        </article>
      </section>

      <section class="card analysis-card">
        <div class="section-header">
          <div>
            <p class="section-kicker">Analyse automatique RH</p>
            <h2 class="section-title">Points saillants du mois</h2>
          </div>
          ${this.renderBadge('Analyse RH', 'neutral')}
        </div>
        <ul class="analysis-list">
          ${this.buildAnalysisItems(employeeReport)
            .map((item) => `<li class="analysis-item"><span>${this.escapeHtml(item)}</span></li>`)
            .join('')}
        </ul>
      </section>

      ${this.footer(report, pageNumber, totalPages)}
    </section>`;
  }

  private buildEmployeeAnalysisPage(
    report: MonthlyAttendanceExportReport,
    employeeReport: MonthlyAttendanceEmployeeReport,
    pageNumber: number,
    totalPages: number,
  ) {
    return `<section class="page page-analysis">
      <div class="page-topline"></div>
      <section class="compact-header">
        <div>
          <span class="eyebrow">KONATECH POINTAGE</span>
          <h1 class="compact-title">Analyse automatique RH</h1>
          <p class="hero-copy">
            ${this.escapeHtml(employeeReport.fullName)} | ${this.escapeHtml(employeeReport.monthLabel)}
          </p>
        </div>
        <div class="compact-meta">
          ${this.renderBadge(this.scoreLabel(employeeReport.performanceScore), this.scoreTone(employeeReport.performanceScore))}
          ${this.renderBadge(employeeReport.gpsBreakdown.modeLabel, 'info')}
        </div>
      </section>

      <section class="advanced-grid">
        <article class="card">
          <div class="section-header">
            <div>
              <p class="section-kicker">Retards à l'entrée</p>
              <h2 class="section-title">Distribution mensuelle</h2>
            </div>
          </div>
          <ul class="advanced-list">
            ${this.advancedItem('5 à 15 min', String(employeeReport.lateRangeBreakdown.fiveToFifteenCount), 'retard(s) légers à surveiller')}
            ${this.advancedItem('16 à 30 min', String(employeeReport.lateRangeBreakdown.sixteenToThirtyCount), 'retard(s) modérés constatés')}
            ${this.advancedItem('Plus de 30 min', String(employeeReport.lateRangeBreakdown.overThirtyCount), 'retard(s) critiques sur la période')}
          </ul>
        </article>
        <article class="card">
          <div class="section-header">
            <div>
              <p class="section-kicker">Sécurité GPS</p>
              <h2 class="section-title">Conformité des pointages</h2>
            </div>
          </div>
          <ul class="advanced-list">
            ${this.advancedItem('Pointages GPS validés', String(employeeReport.gpsBreakdown.gpsValidatedPointages), 'validation géolocalisée conforme')}
            ${this.advancedItem('Pointages sans GPS', String(employeeReport.gpsBreakdown.nonGpsPointages), 'contrôle supplémentaire recommandé')}
            ${this.advancedItem('Dans la zone', String(employeeReport.gpsBreakdown.insideZonePointages), 'pointages reconnus dans le périmètre autorisé')}
            ${this.advancedItem('Mode actif', employeeReport.gpsBreakdown.modeLabel, report.currentVerificationModelLabel)}
          </ul>
        </article>
      </section>

      <section class="card analysis-card">
        <div class="section-header">
          <div>
            <p class="section-kicker">Analyse automatique RH</p>
            <h2 class="section-title">Points saillants du mois</h2>
          </div>
          ${this.renderBadge('Lecture RH', 'neutral')}
        </div>
        <ul class="analysis-list">
          ${this.buildAnalysisItems(employeeReport)
            .map((item) => `<li class="analysis-item"><span>${this.escapeHtml(item)}</span></li>`)
            .join('')}
        </ul>
      </section>

      <section class="analysis-conclusion">
        <p class="analysis-conclusion-title">Conclusion RH</p>
        <p class="analysis-conclusion-copy">${this.escapeHtml(this.buildAnalysisConclusion(employeeReport))}</p>
      </section>

      ${this.footer(report, pageNumber, totalPages)}
    </section>`;
  }

  private buildEmployeeDetailPage(
    report: MonthlyAttendanceExportReport,
    employeeReport: MonthlyAttendanceEmployeeReport,
    rows: MonthlyAttendanceDailyReportRow[],
    pageNumber: number,
    totalPages: number,
  ) {
    const tableRows =
      rows.length > 0
        ? rows
            .map(
              (row) => `<tr>
                <td>
                  <div class="table-identity">
                    <strong>${this.escapeHtml(row.date)}</strong>
                    <span>${this.escapeHtml(row.dayLabel)}</span>
                  </div>
                </td>
                <td>${this.renderDailyTimeValue(row.clockInTime, row)}</td>
                <td>${this.renderDailyTimeValue(row.clockOutTime, row)}</td>
                <td>${this.renderStatusBadge(row.statusLabel)}</td>
                <td>${this.renderDailyMetricValue(row.lateLabel)}</td>
                <td>${this.renderDailyMetricValue(row.earlyExitLabel)}</td>
                <td>${this.renderDailyMetricValue(row.overtimeLabel)}</td>
              </tr>`,
            )
            .join('')
        : `<tr>
            <td colspan="7" class="empty-copy">Aucune ligne journalière disponible pour cette période.</td>
          </tr>`;

    return `<section class="page page-details">
      <div class="page-topline"></div>
      <section class="compact-header detail-header">
        <div class="detail-header-copy">
          <span class="eyebrow">KONATECH POINTAGE</span>
          <h1 class="compact-title">Détail journalier</h1>
          <p class="detail-subtitle">
            ${this.escapeHtml(employeeReport.fullName)} | ${this.escapeHtml(employeeReport.monthLabel)}
          </p>
          <p class="detail-meta-line">
            <strong>Identifiant employe</strong> ${this.escapeHtml(employeeReport.employeeIdentifier)}
            <span class="detail-meta-separator">|</span>
            <strong>D&eacute;partement</strong> ${this.escapeHtml(employeeReport.departmentLabel)}
          </p>
        </div>
      </section>

      <section class="card table-card">
        <div class="section-header">
          <div>
            <p class="section-kicker">Vue quotidienne</p>
            <h2 class="section-title">Entrées, sorties et statuts</h2>
          </div>
          ${this.renderBadge(`Page ${pageNumber} / ${totalPages}`, 'neutral')}
        </div>
        <div class="table-shell">
          <table>
            <thead>
              <tr>
                <th style="width: 24%;">Date</th>
                <th style="width: 11%;">Entrée</th>
                <th style="width: 11%;">Sortie</th>
                <th style="width: 14%;">Statut</th>
                <th style="width: 10%;">Retard</th>
                <th style="width: 15%;">Départ tôt</th>
                <th style="width: 15%;">Heures supp.</th>
              </tr>
            </thead>
            <tbody>
              ${tableRows}
            </tbody>
          </table>
        </div>
      </section>

      ${this.footer(report, pageNumber, totalPages)}
    </section>`;
  }

  private buildTeamPages(
    report: MonthlyAttendanceExportReport,
    totalPages: number,
  ) {
    const chunks = this.chunkRows(report.rows, this.teamRowsPerPage);
    const effectiveChunks = chunks.length > 0 ? chunks : [[]];
    const pages = [this.buildTeamSummaryPage(report, 1, totalPages)];

    effectiveChunks.forEach((rows, index) => {
      pages.push(this.buildTeamTablePage(report, rows, index + 2, totalPages));
    });

    return pages;
  }

  private buildTeamSummaryPage(
    report: MonthlyAttendanceExportReport,
    pageNumber: number,
    totalPages: number,
  ) {
    const summary = this.buildTeamSummary(report.rows);

    return `<section class="page page-synthesis">
      <div class="page-topline"></div>
      <section class="hero">
        <div>
          <span class="eyebrow">KONATECH POINTAGE</span>
          <h1 class="hero-title">Rapport mensuel de présence</h1>
          <p class="hero-subtitle">Synthèse équipe | ${this.escapeHtml(this.formatPeriod(report.month, report.year))}</p>
          <p class="hero-copy">
            Vue globale des collaborateurs actifs, des absences, des retards et des heures consolidées sur la période.
          </p>
        </div>
        <aside class="meta-card">
          <div>
            <p class="meta-label">Génération</p>
            <p class="meta-value">${this.escapeHtml(this.formatGeneratedAt(report.generatedAt))}</p>
          </div>
          <p class="meta-copy">
            Rendu PDF unifié via Puppeteer. Rapport équipe paginé côté backend.
          </p>
        </aside>
      </section>

      <section class="team-summary-grid">
        ${this.kpiCard('Employés actifs', String(summary.totalEmployees), 'collaborateur(s) inclus dans le rapport', 'info')}
        ${this.kpiCard('Jours travaillés', String(summary.totalWorkedDays), 'total cumulé sur la période', 'success')}
        ${this.kpiCard('Présence planifiée', `${summary.totalPresenceDays} / ${summary.totalWorkingDays}`, 'jours inclus dans le taux de présence', 'success')}
        ${this.kpiCard('Travail hors planning', String(summary.totalOutsideScheduleWorkDays), 'jours hors jours configurés', summary.totalOutsideScheduleWorkDays > 0 ? 'info' : 'success')}
        ${this.kpiCard('Absences', String(summary.totalAbsences), "jours d'absence consolidés", summary.totalAbsences > 0 ? 'danger' : 'success')}
        ${this.kpiCard('Retards', String(summary.totalLateDays), 'occurrence(s) relevée(s)', summary.totalLateDays > 0 ? 'warning' : 'success')}
        ${this.kpiCard('Heures supp.', this.formatNumber(summary.totalOvertimeHours, 2), 'volume total du mois', summary.totalOvertimeHours > 0 ? 'info' : 'success')}
        ${this.kpiCard('Weekend overtime', this.formatNumber(summary.totalOutsideScheduleOvertimeHours, 2), 'volume hors planning', summary.totalOutsideScheduleOvertimeHours > 0 ? 'info' : 'success')}
        ${this.kpiCard('Pointages incomplets', String(summary.totalIncompleteDays), 'jours à régulariser', summary.totalIncompleteDays > 0 ? 'warning' : 'success')}
      </section>

      <section class="callout-grid">
        <article class="card">
          <div class="section-header">
            <div>
              <p class="section-kicker">Mode de vérification</p>
              <h2 class="section-title">Contexte sécurité actif</h2>
            </div>
            ${this.renderBadge('Équipe', 'neutral')}
          </div>
          <div class="team-notes">
            <div class="info-item">
              <p class="info-label">Mode courant</p>
              <p class="info-value">${this.escapeHtml(report.currentVerificationModelLabel)}</p>
            </div>
            <div class="info-item">
              <p class="info-label">Historique</p>
              <p class="info-value">${this.escapeHtml(report.legacyVerificationLabel)}</p>
            </div>
          </div>
        </article>
        <article class="card">
          <div class="section-header">
            <div>
              <p class="section-kicker">Notes d'export</p>
              <h2 class="section-title">Lecture du document</h2>
            </div>
          </div>
          <ul class="note-list">
            <li class="note-item"><span class="note-copy">Le rapport conserve l'endpoint existant et les paramètres de filtre actuels.</span></li>
            <li class="note-item"><span class="note-copy">${this.escapeHtml(report.blockedAttemptsLabel)}</span></li>
            <li class="note-item"><span class="note-copy">Travail hors planning / Outside schedule work est suivi séparément de la présence planifiée.</span></li>
            <li class="note-item"><span class="note-copy">Les pages suivantes listent les employés avec leurs principaux indicateurs mensuels.</span></li>
          </ul>
        </article>
      </section>

      ${this.footer(report, pageNumber, totalPages)}
    </section>`;
  }

  private buildTeamTablePage(
    report: MonthlyAttendanceExportReport,
    rows: MonthlyAttendanceExportRow[],
    pageNumber: number,
    totalPages: number,
  ) {
    const tableRows =
      rows.length > 0
        ? rows
            .map(
              (row) => `<tr>
                <td style="width: 24%;">
                  <div class="table-identity">
                    <strong>${this.escapeHtml(row.fullName)}</strong>
                    <span>${this.escapeHtml(row.employeeIdentifier)} | ${this.escapeHtml(row.department)}</span>
                  </div>
                </td>
                <td style="width: 16%;">${this.escapeHtml(this.readableValue(row.assignedSchedule, 'Aucun planning'))}</td>
                <td style="width: 9%;">${this.escapeHtml(this.readablePresenceRatio(row.presenceDays, row.workingDays))}</td>
                <td style="width: 8%;">${row.outsideScheduleWorkDays}</td>
                <td style="width: 7%;">${row.absenceCount}</td>
                <td style="width: 7%;">${row.lateDays}</td>
                <td style="width: 9%;">${row.entryCount} / ${row.exitCount}</td>
                <td style="width: 10%;">${this.escapeHtml(this.readableWorkedHours(row.totalWorkedHours))}</td>
                <td style="width: 10%;">${this.escapeHtml(this.readableOvertimeHours(row.scheduledOvertimeHours))}</td>
                <td style="width: 10%;">${this.escapeHtml(this.readableOvertimeHours(row.outsideScheduleOvertimeHours))}</td>
              </tr>`,
            )
            .join('')
        : `<tr>
            <td colspan="9" class="empty-copy">Aucun employé actif ne correspond aux critères de la période demandée.</td>
          </tr>`;

    return `<section class="page page-details">
      <div class="page-topline"></div>
      <section class="compact-header">
        <div>
          <span class="eyebrow">KONATECH POINTAGE</span>
          <h1 class="compact-title">Synthèse équipe</h1>
          <p class="hero-copy">${this.escapeHtml(this.formatPeriod(report.month, report.year))} | tableau consolidé par employé</p>
        </div>
        <div class="compact-meta">
          ${this.renderBadge(`Employés: ${report.rows.length}`, 'info')}
          ${this.renderBadge('Export équipe', 'neutral')}
        </div>
      </section>

      <section class="card table-card">
        <div class="section-header">
          <div>
            <p class="section-kicker">Synthèse par employé</p>
            <h2 class="section-title">Présence, absences, retards et heures</h2>
          </div>
          ${this.renderBadge(report.currentVerificationModelLabel, 'neutral')}
        </div>
        <div class="table-shell">
          <table>
            <thead>
              <tr>
                <th>Employé</th>
                <th>Planning</th>
                <th>Présence planifiée</th>
                <th>Hors planning</th>
                <th>Absences</th>
                <th>Retards</th>
                <th>Pointages</th>
                <th>Heures</th>
                <th>H. supp. planifiées</th>
                <th>Weekend overtime</th>
              </tr>
            </thead>
            <tbody>
              ${tableRows}
            </tbody>
          </table>
        </div>
      </section>

      ${this.footer(report, pageNumber, totalPages)}
    </section>`;
  }

  private buildDocumentTitle(report: MonthlyAttendanceExportReport) {
    const monthLabel = this.frenchMonthLabels[report.month - 1] ?? String(report.month);
    const scope = report.employeeReport?.fullName ?? 'équipe';

    return `Rapport mensuel de présence ${scope} ${monthLabel} ${report.year}`;
  }

  private footer(
    report: MonthlyAttendanceExportReport,
    pageNumber: number,
    totalPages: number,
  ) {
    return `<footer class="footer">
      <span>${this.escapeHtml(this.buildDocumentTitle(report))}</span>
      <strong>Page ${pageNumber} / ${totalPages}</strong>
    </footer>`;
  }

  private infoItem(label: string, value: string) {
    return `<article class="info-item">
      <p class="info-label">${this.escapeHtml(label)}</p>
      <p class="info-value">${this.escapeHtml(value)}</p>
    </article>`;
  }

  private kpiCard(
    label: string,
    value: string,
    description: string,
    tone: 'success' | 'warning' | 'danger' | 'info',
  ) {
    return `<article class="kpi-card kpi-card--${tone}">
      <p class="kpi-label">${this.escapeHtml(label)}</p>
      <p class="kpi-value">${this.escapeHtml(value)}</p>
      <p class="kpi-description">${this.escapeHtml(description)}</p>
    </article>`;
  }

  private advancedItem(label: string, value: string, copy: string) {
    return `<li class="advanced-item">
      <div>
        <div class="advanced-stat">${this.escapeHtml(label)}: ${this.escapeHtml(value)}</div>
        <div class="advanced-copy">${this.escapeHtml(copy)}</div>
      </div>
    </li>`;
  }

  private renderBadge(
    value: string,
    tone: 'success' | 'warning' | 'danger' | 'info' | 'neutral',
  ) {
    return `<span class="badge badge--${tone}">${this.escapeHtml(value)}</span>`;
  }

  private renderStatusBadge(statusLabel: string) {
    const normalized = this.normalizeText(statusLabel).toLowerCase();

    if (normalized.includes('absen')) {
      return this.renderBadge('Absence', 'danger');
    }

    if (normalized.includes('retard') || normalized.includes('incomplet')) {
      return this.renderBadge(this.normalizeStatusLabel(statusLabel), 'warning');
    }

    return this.renderBadge(this.normalizeStatusLabel(statusLabel), 'success');
  }

  private renderGpsBadge(gpsLabel: string) {
    const normalized = this.normalizeText(gpsLabel).toLowerCase();

    if (normalized.includes('hors zone')) {
      return this.renderBadge(this.normalizeText(gpsLabel), 'danger');
    }

    if (normalized.includes('partiel') || normalized.includes('sans gps')) {
      return this.renderBadge(this.normalizeText(gpsLabel), 'warning');
    }

    if (normalized.includes('valid')) {
      return this.renderBadge(this.normalizeText(gpsLabel), 'success');
    }

    return this.renderBadge(
      this.readableValue(gpsLabel, 'Non renseigné'),
      'neutral',
    );
  }

  private buildAnalysisItems(employeeReport: MonthlyAttendanceEmployeeReport) {
    const items: string[] = [];

    if (this.hasNoPresenceMonth(employeeReport)) {
      items.push(
        `Aucune présence enregistrée : 0 présence sur ${employeeReport.workingDays} jour(s) planifié(s), avec ${employeeReport.absenceCount} absence(s) constatée(s).`,
      );
      items.push(
        `Score global critique : ${employeeReport.performanceScore}/100, avec aucune heure travaillée enregistrée sur la période.`,
      );
      items.push(
        "Les indicateurs de retard et de sécurité GPS ne sont pas significatifs lorsqu'aucun pointage n'est enregistré.",
      );

      return items;
    }

    if (employeeReport.absenceCount >= 2) {
      items.push(
        `Taux d'absence élevé : ${employeeReport.absenceCount} absence(s) constatée(s) sur la période.`,
      );
    } else if (employeeReport.absenceCount === 0) {
      items.push('Présence continue : aucune absence constat?e sur la période.');
    }

    if (employeeReport.lateCount >= 4) {
      items.push(
        `Retards fréquents : ${employeeReport.lateCount} retard(s) relevé(s) à l'entrée.`,
      );
    } else if (employeeReport.lateCount === 0) {
      items.push('Ponctualit? stable : aucun retard enregistré ce mois-ci.');
    }

    if (employeeReport.gpsBreakdown.nonGpsPointages > 0) {
      items.push(
        `Conformité GPS à renforcer : ${employeeReport.gpsBreakdown.nonGpsPointages} pointage(s) sans validation GPS.`,
      );
    } else {
      items.push('Conformité GPS solide : tous les pointages exploités sont valides.');
    }

    if (employeeReport.outsideScheduleWorkDays > 0) {
      items.push(
        `Travail hors planning / Outside schedule work : ${employeeReport.outsideScheduleWorkDays} jour(s), ${employeeReport.outsideScheduleOvertimeHours} comptabilisées sans impact sur le taux de présence.`,
      );
    }

    if (employeeReport.earlyExitCount > 0) {
      items.push(
        `Départ tôt détecté : ${employeeReport.earlyExitCount} sortie(s) avant l'horaire planifié.`,
      );
    } else {
      items.push('Sorties stabilisées : aucun d?part t?t relev? sur la période.');
    }

    return items;
  }

  private buildAnalysisConclusion(employeeReport: MonthlyAttendanceEmployeeReport) {
    if (this.hasNoPresenceMonth(employeeReport)) {
      return "Conclusion : aucune présence n'a ?t? enregistrée pour cet employé sur la période. Le score global est critique et nécessite une revue managériale afin de vérifier la situation administrative, le planning ou la présence effective de l'employé. Les indicateurs de retard et de sécurité GPS ne sont pas significatifs lorsqu'il n'y a aucun pointage.";
    }

    if (employeeReport.performanceScore < 50) {
      return "Conclusion : le mois présente un niveau de risque RH élevé. Une revue managériale est recommandée pour traiter les absences, la ponctualit? ou les départs t?t relev?s dans le rapport.";
    }

    if (employeeReport.absenceCount > 0 || employeeReport.lateCount > 0) {
      return "Conclusion : la période reste exploitable mais demande un suivi managérial cibl? afin de stabiliser la présence, la ponctualit? et les heures réellement pointées.";
    }

    if (employeeReport.outsideScheduleWorkDays > 0) {
      return "Conclusion : la présence planifiée reste stable, avec du travail hors planning correctement isolé en heures supplémentaires sans impacter le taux de présence.";
    }

    return "Conclusion : la période est globalement maîtrisée, avec une présence régulière, une ponctualit? stable et un niveau de conformité exploitable pour le suivi RH.";
  }

  private scoreNarrative(employeeReport: MonthlyAttendanceEmployeeReport) {
    if (employeeReport.performanceScore >= 85) {
      return 'Performance très solide sur la période, avec une lecture RH sereine et un suivi opérationnel simple.';
    }

    if (employeeReport.performanceScore >= 70) {
      return 'Mois globalement maîtrisé, avec quelques points d attention à suivre pour maintenir la régularité.';
    }

    if (employeeReport.performanceScore >= 50) {
      return 'La période demande un suivi plus rapproché sur la présence, la ponctualité ou la régularité des sorties.';
    }

    return "Signal d'alerte RH : la période mérite une revue managériale et des actions correctives ciblées.";
  }

  private renderDailyTimeValue(
    value: string,
    _row: MonthlyAttendanceDailyReportRow,
  ) {
    const fallback = '';
    const displayValue = this.readableValue(value, fallback);

    if (displayValue === '') {
      return '<span class="table-value-empty"></span>';
    }

    return this.escapeHtml(displayValue);
  }

  private renderDailyMetricValue(value: string) {
    const displayValue = this.readableValue(value, '');

    if (displayValue === '') {
      return '<span class="table-value-empty"></span>';
    }

    return this.escapeHtml(displayValue);
  }

  private isAbsenceStatus(statusLabel: string) {
    return this.normalizeText(statusLabel).toLowerCase().includes('absen');
  }

  private hasNoPresenceMonth(employeeReport: MonthlyAttendanceEmployeeReport) {
    return (
      employeeReport.presenceDays === 0 &&
      employeeReport.entryCount === 0 &&
      employeeReport.exitCount === 0
    );
  }

  private normalizeStatusLabel(statusLabel: string) {
    const normalized = this.normalizeText(statusLabel);

    if (this.isAbsenceStatus(statusLabel)) {
      return 'Absence';
    }

    if (normalized === 'Non rens') {
      return 'Non renseigné';
    }

    return normalized;
  }

  private scoreTone(score: number): 'success' | 'warning' | 'danger' | 'info' {
    if (score >= 85) {
      return 'success';
    }

    if (score >= 70) {
      return 'info';
    }

    if (score >= 50) {
      return 'warning';
    }

    return 'danger';
  }

  private scoreLabel(score: number) {
    if (score >= 85) {
      return 'Excellent';
    }

    if (score >= 70) {
      return 'Stable';
    }

    if (score >= 50) {
      return 'À surveiller';
    }

    return 'Critique';
  }

  private clampScore(score: number) {
    return Math.max(0, Math.min(score, 100));
  }

  private buildTeamSummary(rows: MonthlyAttendanceExportRow[]): TeamReportSummary {
    return rows.reduce<TeamReportSummary>(
      (summary, row) => ({
        totalEmployees: summary.totalEmployees + 1,
        totalWorkingDays: summary.totalWorkingDays + row.workingDays,
        totalPresenceDays:
          summary.totalPresenceDays + (row.workingDays > 0 ? row.presenceDays : 0),
        totalWorkedDays: summary.totalWorkedDays + row.totalWorkedDays,
        totalOutsideScheduleWorkDays:
          summary.totalOutsideScheduleWorkDays + row.outsideScheduleWorkDays,
        totalAbsences: summary.totalAbsences + row.absenceCount,
        totalLateDays: summary.totalLateDays + row.lateDays,
        totalIncompleteDays:
          summary.totalIncompleteDays + row.incompleteAttendanceDays,
        totalOvertimeHours:
          summary.totalOvertimeHours + this.parseNumber(row.overtimeHours),
        totalOutsideScheduleOvertimeHours:
          summary.totalOutsideScheduleOvertimeHours +
          this.parseNumber(row.outsideScheduleOvertimeHours),
      }),
      {
        totalEmployees: 0,
        totalWorkingDays: 0,
        totalPresenceDays: 0,
        totalWorkedDays: 0,
        totalOutsideScheduleWorkDays: 0,
        totalAbsences: 0,
        totalLateDays: 0,
        totalIncompleteDays: 0,
        totalOvertimeHours: 0,
        totalOutsideScheduleOvertimeHours: 0,
      },
    );
  }

  private parseNumber(value: string) {
    const normalized = value.trim();

    if (!normalized) {
      return 0;
    }

    const parsed = Number.parseFloat(normalized.replace(',', '.'));

    return Number.isFinite(parsed) ? parsed : 0;
  }

  private readableValue(value: string, fallback: string) {
    const normalizedValue = this.normalizeText(value).trim();
    const normalizedFallback = this.normalizeText(fallback);

    return normalizedValue === '-' || normalizedValue === ''
      ? normalizedFallback
      : normalizedValue;
  }

  private readableWorkedHours(value: string) {
    if (!value.trim()) {
      return '0 h';
    }

    const [hours, minutes] = value.split(':');

    if (!minutes) {
      return value;
    }

    return `${hours} h ${minutes}`;
  }

  private readableOvertimeHours(value: string) {
    if (!value.trim()) {
      return '0 h';
    }

    return `${value.replace('.', ',')} h`;
  }

  private readablePresenceRatio(presenceDays: number, workingDays: number) {
    if (workingDays <= 0) {
      return '-';
    }

    return `${presenceDays} / ${workingDays}`;
  }

  private formatRate(value: number) {
    return value.toFixed(1).replace('.', ',');
  }

  private formatNumber(value: number, precision: number) {
    return value.toFixed(precision).replace('.', ',');
  }

  private formatPeriod(month: number, year: number) {
    const monthLabel = this.frenchMonthLabels[month - 1] ?? String(month);

    return `${monthLabel.charAt(0).toUpperCase()}${monthLabel.slice(1)} ${year}`;
  }

  private formatGeneratedAt(value: string) {
    const date = new Date(value);
    const day = String(date.getUTCDate()).padStart(2, '0');
    const month = this.frenchMonthLabels[date.getUTCMonth()] ?? '';
    const year = date.getUTCFullYear();
    const hours = String(date.getUTCHours()).padStart(2, '0');
    const minutes = String(date.getUTCMinutes()).padStart(2, '0');

    return `${day} ${month} ${year} à ${hours}:${minutes}`;
  }

  private normalizeText(value: string) {
    if (!value) {
      return value;
    }

    let normalized = value;

    if (/[ÃÂ]/.test(normalized)) {
      normalized = Buffer.from(normalized, 'latin1').toString('utf8');
    }

    return normalized
      .normalize('NFC')
      .replaceAll('Non rens', 'Non renseigné')
      .replaceAll('Non renseigne', 'Non renseigné')
      .replaceAll('Pr?sence', 'Présence')
      .replaceAll('pr?sence', 'présence')
      .replaceAll('planifi?s', 'planifiés')
      .replaceAll('Heures travaill?es', 'Heures travaillées')
      .replaceAll('entr?e', 'entrée')
      .replaceAll('Heures suppl?mentaires', 'Heures supplémentaires')
      .replaceAll('concern?s', 'concernés')
      .replaceAll('D?part t?t', 'Départ tôt')
      .replaceAll('d?part t?t', 'départ tôt')
      .replaceAll('journ?e', 'journée')
      .replaceAll(
        'Aucune ligne journali?re disponible pour cette p?riode.',
        'Aucune ligne journalière disponible pour cette période.',
      )
      .replaceAll("n'a ?t? enregistrée", "n'a été enregistrée")
      .replaceAll('p?riode', 'période')
      .replaceAll('constat?e', 'constatée')
      .replaceAll('Ponctualit?', 'Ponctualité')
      .replaceAll('ponctualit?', 'ponctualité')
      .replaceAll('relev?', 'relevé')
      .replaceAll('relev?s', 'relevés')
      .replaceAll('cibl?', 'ciblé')
      .replaceAll('manag?riale', 'managériale')
      .replaceAll('travaill?e', 'travaillée')
      .replaceAll('n?cessite', 'nécessite')
      .replaceAll('v?rifier', 'vérifier')
      .replaceAll('employ?', 'employé');
  }

  private chunkRows<T>(rows: T[], size: number) {
    if (rows.length === 0) {
      return [];
    }

    const chunks: T[][] = [];

    for (let index = 0; index < rows.length; index += size) {
      chunks.push(rows.slice(index, index + size));
    }

    if (chunks.length > 1) {
      const lastChunk = chunks[chunks.length - 1];
      const previousChunk = chunks[chunks.length - 2];

      if (lastChunk.length === 1 && previousChunk.length > 2) {
        const movedRow = previousChunk.pop();

        if (movedRow !== undefined) {
          lastChunk.unshift(movedRow);
        }
      }
    }

    return chunks;
  }

  private escapeHtml(value: string) {
    return this.normalizeText(value)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }
}
