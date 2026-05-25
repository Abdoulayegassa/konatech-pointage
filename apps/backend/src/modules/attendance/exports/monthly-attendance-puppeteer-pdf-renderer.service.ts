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
        waitUntil: 'load',
        timeout: this.renderTimeoutMs,
      });
      await page.waitForFunction('document.readyState === "complete"');
      await page.evaluate(
        'document.fonts ? document.fonts.ready : Promise.resolve()',
      );
      await page.evaluate(async () => {
        await new Promise((resolve) =>
          requestAnimationFrame(() => resolve(null)),
        );
        await new Promise((resolve) =>
          requestAnimationFrame(() => resolve(null)),
        );
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
          this.chunkRows(
            report.employeeReport.dailyRows,
            this.employeeRowsPerPage,
          ).length,
          1,
        )
      : 1 +
        Math.max(this.chunkRows(report.rows, this.teamRowsPerPage).length, 1);
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
        src:
          local("Inter"),
          local("Segoe UI"),
          local("Arial"),
          local("Noto Sans"),
          local("Roboto");
        font-weight: 400;
        font-style: normal;
      }

      @font-face {
        font-family: "KonatechPdfSans";
        src:
          local("Inter Bold"),
          local("Segoe UI Bold"),
          local("Arial Bold"),
          local("Noto Sans Bold"),
          local("Roboto Bold"),
          local("Arial");
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
        --teal: #0F766E;
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
        background: linear-gradient(180deg, rgba(255, 247, 237, 0.84) 0%, rgba(255, 255, 255, 0.98) 100%);
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
        box-shadow: 0 16px 34px rgba(15, 23, 42, 0.065);
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
        padding: 25px 28px;
        border-color: rgba(15, 23, 42, 0.085);
        background:
          radial-gradient(circle at 88% 16%, rgba(249, 115, 22, 0.105), transparent 30%),
          radial-gradient(circle at 14% 88%, rgba(37, 99, 235, 0.055), transparent 28%),
          linear-gradient(180deg, rgba(255, 255, 255, 0.995) 0%, rgba(248, 250, 252, 0.985) 100%);
        box-shadow:
          0 22px 46px rgba(15, 23, 42, 0.088),
          0 4px 14px rgba(15, 23, 42, 0.035);
      }

      .score-card--danger {
        border-color: rgba(220, 38, 38, 0.145);
        background:
          radial-gradient(circle at 86% 15%, rgba(220, 38, 38, 0.105), transparent 30%),
          radial-gradient(circle at 12% 86%, rgba(249, 115, 22, 0.06), transparent 28%),
          linear-gradient(180deg, rgba(255, 255, 255, 0.995) 0%, rgba(255, 248, 248, 0.99) 100%);
        box-shadow:
          0 22px 46px rgba(127, 29, 29, 0.105),
          0 4px 14px rgba(15, 23, 42, 0.032);
      }

      .score-layout {
        display: grid;
        grid-template-columns: 174px minmax(0, 1fr);
        gap: 28px;
        align-items: center;
      }

      .score-ring {
        width: 168px;
        height: 168px;
        border-radius: 999px;
        display: grid;
        place-items: center;
        background:
          conic-gradient(var(--score-color) var(--score-deg), rgba(226, 232, 240, 0.86) 0deg),
          linear-gradient(180deg, #ffffff 0%, #f8fafc 100%);
        box-shadow:
          inset 0 0 0 1px rgba(15, 23, 42, 0.06),
          inset 0 0 0 10px rgba(255, 255, 255, 0.72),
          0 18px 38px rgba(15, 23, 42, 0.105);
      }

      .score-pill {
        width: 118px;
        height: 118px;
        border-radius: 999px;
        display: grid;
        place-items: center;
        background: rgba(255, 255, 255, 0.98);
        box-shadow:
          inset 0 0 0 1px rgba(226, 232, 240, 0.92),
          0 10px 22px rgba(15, 23, 42, 0.065);
        color: var(--indigo);
      }

      .score-ring--success {
        --score-color: var(--success);
      }

      .score-ring--success .score-pill {
        color: var(--success);
      }

      .score-ring--warning {
        --score-color: var(--warning);
      }

      .score-ring--warning .score-pill {
        color: #B45309;
      }

      .score-ring--danger {
        --score-color: var(--danger);
        background:
          conic-gradient(var(--score-color) var(--score-deg), rgba(254, 226, 226, 0.96) 0deg),
          radial-gradient(circle at center, rgba(220, 38, 38, 0.08), transparent 60%),
          linear-gradient(180deg, #ffffff 0%, #fff7f7 100%);
        box-shadow:
          inset 0 0 0 1px rgba(220, 38, 38, 0.12),
          inset 0 0 0 10px rgba(255, 255, 255, 0.76),
          0 20px 42px rgba(220, 38, 38, 0.135);
      }

      .score-ring--danger .score-pill {
        color: var(--danger);
      }

      .score-ring--info {
        --score-color: var(--blue);
      }

      .score-ring--info .score-pill {
        color: var(--blue);
      }

      .score-value {
        font-size: 44px;
        line-height: 1;
        font-weight: 800;
      }

      .score-caption {
        margin: 4px 0 0;
        font-size: 10.5px;
        font-weight: 800;
        text-transform: uppercase;
        letter-spacing: 0.08em;
      }

      .score-highlight {
        display: flex;
        flex-wrap: wrap;
        gap: 9px;
        align-items: center;
        margin: 12px 0 0;
      }

      .score-meter {
        margin: 17px 0 0;
        width: 100%;
        height: 8px;
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
        margin: 13px 0 0;
        max-width: 420px;
        color: var(--text-soft);
        font-size: 12px;
        font-weight: 600;
      }

      .score-analytics {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 11px;
        margin-top: 17px;
      }

      .score-analytics-item {
        border: 1px solid rgba(226, 232, 240, 0.78);
        border-radius: 14px;
        background:
          linear-gradient(180deg, rgba(255, 255, 255, 0.86), rgba(248, 250, 252, 0.72));
        padding: 10px 11px;
        box-shadow: 0 7px 16px rgba(15, 23, 42, 0.035);
      }

      .score-analytics-top {
        display: flex;
        justify-content: space-between;
        gap: 8px;
        align-items: center;
        color: var(--text-soft);
        font-size: 8.8px;
        font-weight: 800;
        letter-spacing: 0.06em;
        text-transform: uppercase;
      }

      .score-analytics-value {
        color: var(--text);
        font-size: 10px;
        font-weight: 800;
        letter-spacing: 0;
      }

      .score-analytics-track {
        height: 5px;
        margin-top: 8px;
        border-radius: 999px;
        background: rgba(226, 232, 240, 0.92);
        overflow: hidden;
      }

      .score-analytics-fill {
        height: 100%;
        min-width: 4px;
        border-radius: inherit;
        background: var(--blue);
      }

      .score-analytics-fill--success {
        background: linear-gradient(90deg, var(--success), #86EFAC);
      }

      .score-analytics-fill--warning {
        background: linear-gradient(90deg, var(--warning), #FCD34D);
      }

      .score-analytics-fill--danger {
        background: linear-gradient(90deg, var(--danger), #FCA5A5);
      }

      .kpi-grid {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 11px;
      }

      .kpi-card {
        border: 1px solid rgba(226, 232, 240, 0.78);
        border-radius: var(--radius-md);
        background:
          linear-gradient(180deg, rgba(255, 255, 255, 0.96), rgba(248, 250, 252, 0.88));
        padding: 13px 15px;
        min-height: 108px;
        box-shadow:
          0 12px 24px rgba(15, 23, 42, 0.045),
          0 1px 0 rgba(255, 255, 255, 0.86) inset;
        break-inside: avoid;
        page-break-inside: avoid;
      }

      .kpi-card--success {
        border-color: rgba(22, 163, 74, 0.16);
        background:
          linear-gradient(180deg, rgba(255, 255, 255, 0.96), rgba(240, 253, 244, 0.86));
      }

      .kpi-card--warning {
        border-color: rgba(245, 158, 11, 0.18);
        background:
          linear-gradient(180deg, rgba(255, 255, 255, 0.96), rgba(255, 251, 235, 0.88));
      }

      .kpi-card--danger {
        border-color: rgba(220, 38, 38, 0.14);
        background:
          linear-gradient(180deg, rgba(255, 255, 255, 0.96), rgba(254, 242, 242, 0.88));
      }

      .kpi-card--info {
        border-color: rgba(37, 99, 235, 0.15);
        background:
          linear-gradient(180deg, rgba(255, 255, 255, 0.96), rgba(239, 246, 255, 0.88));
      }

      .kpi-label {
        margin: 0;
        font-size: 9px;
        font-weight: 800;
        letter-spacing: 0.09em;
        text-transform: uppercase;
        color: #718096;
      }

      .kpi-value {
        margin: 11px 0 0;
        font-size: 23px;
        line-height: 1;
        font-weight: 800;
        color: var(--text);
      }

      .kpi-description {
        margin: 11px 0 0;
        color: var(--text-soft);
        font-size: 10.6px;
        line-height: 1.35;
      }

      .advanced-grid,
      .callout-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 10px;
      }

      .analytics-grid {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 10px;
      }

      .analytics-card {
        border: 1px solid rgba(226, 232, 240, 0.78);
        border-radius: var(--radius-md);
        background:
          linear-gradient(180deg, rgba(255, 255, 255, 0.96), rgba(248, 250, 252, 0.86));
        padding: 13px 14px;
        min-height: 104px;
        box-shadow:
          0 12px 26px rgba(15, 23, 42, 0.044),
          0 1px 0 rgba(255, 255, 255, 0.82) inset;
      }

      .page-analysis {
        padding-top: 11mm;
        padding-bottom: 20mm;
      }

      .page-analysis > section,
      .page-analysis > .page-topline {
        margin-top: 8px;
      }

      .page-analysis > .page-topline + section {
        margin-top: 8px;
      }

      .page-analysis .card {
        padding: 14px 17px;
      }

      .page-analysis .section-header {
        margin-bottom: 9px;
      }

      .page-analysis .analytics-card {
        min-height: 86px;
        padding: 10px 12px;
      }

      .page-analysis .analytics-value {
        margin-top: 8px;
        font-size: 22px;
      }

      .page-analysis .analytics-copy {
        margin-top: 6px;
        font-size: 9.8px;
      }

      .page-analysis .card,
      .page-analysis .analytics-card {
        position: relative;
      }

      .page-analysis .card::after,
      .page-analysis .analytics-card::after {
        content: "";
        position: absolute;
        left: 14px;
        right: 14px;
        bottom: 0;
        height: 1px;
        background: linear-gradient(90deg, transparent, rgba(226, 232, 240, 0.92), transparent);
      }

      .analytics-card--success {
        border-color: rgba(22, 163, 74, 0.18);
        background:
          linear-gradient(180deg, rgba(255, 255, 255, 0.96), rgba(240, 253, 244, 0.82));
      }

      .analytics-card--warning {
        border-color: rgba(245, 158, 11, 0.22);
        background:
          linear-gradient(180deg, rgba(255, 255, 255, 0.96), rgba(255, 251, 235, 0.84));
      }

      .analytics-card--danger {
        border-color: rgba(220, 38, 38, 0.16);
        background:
          linear-gradient(180deg, rgba(255, 255, 255, 0.96), rgba(254, 242, 242, 0.86));
      }

      .analytics-card--info {
        border-color: rgba(37, 99, 235, 0.16);
        background:
          linear-gradient(180deg, rgba(255, 255, 255, 0.96), rgba(239, 246, 255, 0.84));
      }

      .analytics-label {
        margin: 0;
        color: var(--text-soft);
        font-size: 9.4px;
        font-weight: 800;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }

      .analytics-value {
        margin: 12px 0 0;
        color: var(--text);
        font-size: 25px;
        line-height: 1;
        font-weight: 800;
      }

      .analytics-copy {
        margin: 8px 0 0;
        color: var(--text-soft);
        font-size: 10.4px;
        font-weight: 600;
      }

      .chart-card {
        display: grid;
        grid-template-columns: 142px minmax(0, 1fr);
        gap: 18px;
        align-items: center;
        padding: 18px 20px;
      }

      .page-analysis .chart-card {
        grid-template-columns: 122px minmax(0, 1fr);
        padding: 14px 18px;
      }

      .mini-donut {
        --chart-color: var(--teal);
        width: 132px;
        height: 132px;
        border-radius: 999px;
        display: grid;
        place-items: center;
        background:
          conic-gradient(var(--chart-color) var(--chart-deg), rgba(226, 232, 240, 0.88) 0deg),
          #ffffff;
        box-shadow: inset 0 0 0 1px rgba(15, 23, 42, 0.06);
      }

      .page-analysis .mini-donut {
        width: 112px;
        height: 112px;
      }

      .mini-donut-core {
        width: 88px;
        height: 88px;
        border-radius: 999px;
        display: grid;
        place-items: center;
        background: #ffffff;
        box-shadow: inset 0 0 0 1px rgba(226, 232, 240, 0.92);
      }

      .page-analysis .mini-donut-core {
        width: 74px;
        height: 74px;
      }

      .mini-donut-value {
        font-size: 22px;
        line-height: 1;
        font-weight: 800;
        color: var(--text);
      }

      .chart-legend {
        display: grid;
        gap: 8px;
      }

      .legend-row {
        display: flex;
        justify-content: space-between;
        gap: 12px;
        padding: 9px 0;
        border-bottom: 1px solid rgba(226, 232, 240, 0.82);
        color: var(--text-soft);
        font-weight: 700;
      }

      .micro-bars {
        display: grid;
        gap: 9px;
      }

      .page-analysis .micro-bars {
        gap: 7px;
      }

      .micro-bar-row {
        display: grid;
        grid-template-columns: 82px minmax(0, 1fr) 34px;
        gap: 9px;
        align-items: center;
        color: var(--text-soft);
        font-size: 9.4px;
        font-weight: 700;
      }

      .micro-bar-track {
        height: 6px;
        border-radius: 999px;
        background: rgba(226, 232, 240, 0.92);
        overflow: hidden;
      }

      .micro-bar-fill {
        height: 100%;
        min-width: 4px;
        border-radius: inherit;
      }

      .micro-bar-fill--success {
        background: linear-gradient(90deg, var(--success), #86EFAC);
      }

      .micro-bar-fill--warning {
        background: linear-gradient(90deg, var(--warning), #FCD34D);
      }

      .micro-bar-fill--danger {
        background: linear-gradient(90deg, var(--danger), #FCA5A5);
      }

      .micro-bar-fill--info {
        background: linear-gradient(90deg, var(--blue), #93C5FD);
      }

      .legend-row:last-child {
        border-bottom: 0;
      }

      .legend-value {
        color: var(--text);
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
        min-height: 25px;
        padding: 6px 12px;
        border-radius: var(--radius-sm);
        font-size: 9.4px;
        line-height: 1.2;
        font-weight: 800;
        letter-spacing: 0.045em;
        border: 1px solid transparent;
        box-shadow: 0 4px 10px rgba(15, 23, 42, 0.026);
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
        padding: 11px 11px 9px;
      }

      .page-details .compact-title {
        margin: 4px 0 0;
        font-size: 16px;
      }

      .page-details .table-card {
        margin-top: 15px;
        padding: 11px 11px 9px;
      }

      .page-details .section-header {
        margin-bottom: 10px;
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
        box-shadow: 0 10px 24px rgba(15, 23, 42, 0.035);
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
        border-bottom: 1px solid rgba(226, 232, 240, 0.84);
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

      tbody tr.row--absence td {
        background: rgba(254, 242, 242, 0.72);
      }

      tbody tr.row--late td {
        background: rgba(255, 251, 235, 0.66);
      }

      tbody tr.row--present td {
        background: rgba(240, 253, 244, 0.44);
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
        min-width: 74px;
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
        padding: 6px 8px;
        line-height: 1.22;
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
        min-height: 23px;
        padding: 5px 9px;
        font-size: 8.8px;
        font-weight: 800;
      }

      .page-details .badge--danger {
        background: rgba(254, 226, 226, 0.92);
        color: #B91C1C;
      }

      .page-details .badge--warning {
        background: rgba(255, 237, 213, 0.96);
        color: #C2410C;
      }

      .page-details .badge--success {
        background: rgba(220, 252, 231, 0.94);
        color: #15803D;
      }

      .table-value-empty {
        color: var(--text-soft);
        display: inline-block;
        min-height: 1em;
      }

      .table-value-absence {
        color: #B91C1C;
        font-size: 8.4px;
        font-weight: 700;
        letter-spacing: 0.04em;
        text-transform: uppercase;
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
        bottom: 13mm;
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 16px;
        color: var(--text-soft);
        font-size: 8.4px;
        letter-spacing: 0.055em;
        opacity: 0.88;
        padding-top: 9px;
        border-top: 1px solid rgba(226, 232, 240, 0.82);
      }

      .footer strong {
        color: var(--text);
        white-space: nowrap;
        font-size: 8.8px;
        letter-spacing: 0.02em;
      }

      .footer-mark {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        text-transform: uppercase;
        font-weight: 700;
      }

      .footer-mark::before {
        content: "";
        width: 5px;
        height: 5px;
        border-radius: 999px;
        background: var(--orange);
      }

      .page-details .footer {
        bottom: 10.5mm;
        font-size: 8.8px;
      }

      .analysis-conclusion {
        border: 1px solid rgba(220, 38, 38, 0.14);
        border-left: 4px solid var(--danger);
        border-radius: var(--radius-md);
        background: linear-gradient(180deg, rgba(254, 242, 242, 0.96) 0%, rgba(255, 255, 255, 0.98) 100%);
        padding: 12px 16px;
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
        margin: 6px 0 0;
        font-size: 11px;
        line-height: 1.5;
        color: var(--text);
      }

      @media screen and (max-width: 900px) {
        html,
        body {
          width: 100%;
          min-width: 0;
          background:
            radial-gradient(circle at top right, rgba(249, 115, 22, 0.12), transparent 28%),
            linear-gradient(180deg, #f8fafc 0%, #ffffff 36%, #f8fafc 100%);
        }

        body {
          padding: 12px;
          font-size: 13px;
        }

        .page {
          width: 100%;
          height: auto;
          min-height: 0;
          padding: 16px;
          margin: 0 auto 14px;
          break-after: auto;
          page-break-after: auto;
          overflow: hidden;
          border-radius: 24px;
          box-shadow: var(--shadow-soft);
        }

        .page:last-child {
          margin-bottom: 0;
        }

        .page > section,
        .page > .page-topline,
        .page > .page-topline + section {
          margin-top: 10px;
        }

        .hero,
        .score-layout,
        .chart-card,
        .compact-header,
        .info-grid,
        .kpi-grid,
        .advanced-grid,
        .callout-grid,
        .analytics-grid,
        .team-summary-grid {
          grid-template-columns: 1fr;
        }

        .hero {
          gap: 12px;
        }

        .meta-card,
        .card {
          padding: 14px;
        }

        .meta-card {
          gap: 10px;
        }

        .hero-title {
          font-size: 24px;
        }

        .hero-subtitle {
          font-size: 13px;
        }

        .hero-copy {
          font-size: 12px;
        }

        .compact-header {
          flex-direction: column;
          align-items: stretch;
        }

        .compact-meta {
          max-width: 100%;
          justify-content: flex-start;
        }

        .compact-title {
          font-size: 18px;
        }

        .score-card {
          padding: 14px;
        }

        .score-layout {
          gap: 16px;
        }

        .score-ring,
        .page-analysis .mini-donut {
          width: 132px;
          height: 132px;
          margin: 0 auto;
        }

        .score-pill,
        .page-analysis .mini-donut-core {
          width: 96px;
          height: 96px;
        }

        .score-value {
          font-size: 34px;
        }

        .score-caption {
          font-size: 10px;
        }

        .score-narrative {
          max-width: 100%;
        }

        .score-analytics {
          grid-template-columns: 1fr;
        }

        .chart-card {
          gap: 14px;
          justify-items: stretch;
        }

        .chart-legend {
          gap: 6px;
        }

        .legend-row {
          flex-direction: column;
          align-items: flex-start;
          gap: 4px;
          padding: 8px 0;
        }

        .micro-bars {
          gap: 8px;
        }

        .micro-bar-row {
          grid-template-columns: 1fr;
          gap: 4px;
          align-items: start;
        }

        .kpi-card,
        .analytics-card {
          min-height: 0;
          padding: 12px 13px;
        }

        .kpi-value {
          font-size: 20px;
        }

        .table-card {
          padding: 10px;
        }

        .page-details .table-card {
          padding: 10px;
        }

        .page-details .section-header {
          flex-direction: column;
          align-items: flex-start;
          gap: 8px;
        }

        .page-details .section-title,
        .page-details .section-kicker,
        .page-details .eyebrow,
        .page-details .badge,
        .badge,
        .eyebrow {
          white-space: normal;
          overflow-wrap: anywhere;
        }

        .badge {
          min-height: 24px;
          padding-inline: 10px;
          text-align: left;
        }

        .table-shell {
          overflow-x: auto;
          -webkit-overflow-scrolling: touch;
        }

        .page-details table {
          min-width: 920px;
        }

        .page-details th,
        .page-details td {
          padding: 6px 7px;
        }

        .page-details th {
          font-size: 7.6px;
        }

        .page-details td {
          font-size: 8.6px;
        }

        .page-details .table-identity strong {
          font-size: 9px;
        }

        .page-details .table-identity span {
          font-size: 7.9px;
        }

        .footer,
        .page-details .footer {
          position: static;
          left: auto;
          right: auto;
          bottom: auto;
          width: 100%;
          margin-top: 14px;
          padding-top: 8px;
          flex-direction: column;
          align-items: flex-start;
          gap: 6px;
          letter-spacing: 0.02em;
        }

        .footer strong {
          white-space: normal;
        }

        .analysis-conclusion {
          padding: 12px 14px;
        }
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
          <h1 class="hero-title">Synthèse RH mensuelle</h1>
          <p class="hero-subtitle">${this.escapeHtml(employeeReport.monthLabel)}</p>
          <p class="hero-copy">Indicateurs clés, présence et signaux de suivi.</p>
        </div>
        <aside class="meta-card">
          <div>
            <p class="meta-label">Émission</p>
            <p class="meta-value">${this.escapeHtml(employeeReport.generationDateLabel)}</p>
          </div>
          <p class="meta-copy">Confidentiel RH</p>
        </aside>
      </section>

      <section class="card">
        <div class="section-header">
          <div>
            <p class="section-kicker">Collaborateur</p>
            <h2 class="section-title">Profil</h2>
          </div>
          ${this.renderBadge('Planning actif', 'neutral')}
        </div>
        <div class="info-grid">
          ${this.infoItem("Nom de l'employé", employeeReport.fullName)}
          ${this.infoItem('Identifiant employé', employeeReport.employeeIdentifier)}
          ${this.infoItem('Département', employeeReport.departmentLabel)}
          ${this.infoItem('Planning', employeeReport.assignedScheduleLabel)}
        </div>
      </section>

      <section class="card score-card score-card--${this.scoreTone(employeeReport.performanceScore)}">
        <div class="score-layout">
          <div class="score-ring score-ring--${this.scoreTone(employeeReport.performanceScore)}" style="--score-deg: ${this.scoreRingDegrees(employeeReport.performanceScore)}deg;">
            <div class="score-pill">
              <div>
                <div class="score-value">${employeeReport.performanceScore}</div>
                <div class="score-caption">/ 100</div>
              </div>
            </div>
          </div>
          <div>
            <p class="section-kicker">Score global</p>
            <h2 class="section-title">Priorité RH du mois</h2>
            <div class="score-highlight">
              ${this.renderBadge(this.scoreLabel(employeeReport.performanceScore), this.scoreTone(employeeReport.performanceScore))}
              ${this.renderBadge(this.scoreExecutiveBadge(employeeReport), this.scoreTone(employeeReport.performanceScore))}
            </div>
            <div class="score-meter">
              <div class="score-meter-fill score-meter-fill--${this.scoreTone(employeeReport.performanceScore)}" style="width: ${this.visibleScorePercent(employeeReport.performanceScore)}%;"></div>
            </div>
            <p class="score-narrative">${this.escapeHtml(this.scoreNarrative(employeeReport))}</p>
            <div class="score-analytics">
              ${this.scoreAnalyticsItem(
                'Présence',
                `${this.formatRate(employeeReport.presenceRate)}%`,
                this.visibleRatePercent(employeeReport.presenceRate),
                'success',
              )}
              ${this.scoreAnalyticsItem(
                'Absence',
                String(employeeReport.absenceCount),
                this.visibleRatePercent(
                  this.rateFromCount(
                    employeeReport.absenceCount,
                    employeeReport.workingDays,
                  ),
                ),
                employeeReport.absenceCount > 0 ? 'danger' : 'success',
              )}
              ${this.scoreAnalyticsItem(
                'Retard',
                String(employeeReport.lateCount),
                this.visibleRatePercent(
                  this.rateFromCount(
                    employeeReport.lateCount,
                    employeeReport.workingDays,
                  ),
                ),
                employeeReport.lateCount > 0 ? 'warning' : 'success',
              )}
            </div>
          </div>
        </div>
      </section>

      <section class="kpi-grid">
        ${this.kpiCard(
          'Présence',
          `${this.formatRate(employeeReport.presenceRate)} %`,
          `${employeeReport.presenceDays} / ${employeeReport.workingDays} jours planifiés`,
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
          `${employeeReport.lateCount} occurrence(s)`,
          employeeReport.lateCount > 0 ? 'warning' : 'success',
        )}
        ${this.kpiCard(
          'Heures travaillées',
          employeeReport.totalWorkedHours,
          `${employeeReport.entryCount} entrée(s) | ${employeeReport.exitCount} sortie(s)`,
          'info',
        )}
        ${this.kpiCard(
          'Heures supp.',
          employeeReport.overtimeHours,
          `${employeeReport.scheduledOvertimeHours} planifiées | ${employeeReport.outsideScheduleOvertimeHours} hors planning`,
          employeeReport.exitBreakdown.overtimeDayCount > 0
            ? 'info'
            : 'success',
        )}
        ${this.kpiCard(
          'Départs tôt',
          String(employeeReport.earlyExitCount),
          `${employeeReport.earlyExitCount} sortie(s) anticipée(s)`,
          employeeReport.earlyExitCount > 0 ? 'warning' : 'success',
        )}
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
          <h1 class="compact-title">Analytics mensuels</h1>
          <p class="hero-copy">
            ${this.escapeHtml(employeeReport.fullName)} | ${this.escapeHtml(employeeReport.monthLabel)}
          </p>
        </div>
        <div class="compact-meta">
          ${this.renderBadge(this.scoreLabel(employeeReport.performanceScore), this.scoreTone(employeeReport.performanceScore))}
          ${this.renderBadge(this.readableGpsModeLabel(employeeReport.gpsBreakdown.modeLabel), 'info')}
        </div>
      </section>

      <section class="card chart-card">
        <div class="mini-donut" style="--chart-deg: ${this.rateDegrees(employeeReport.presenceRate)}deg;">
          <div class="mini-donut-core">
            <span class="mini-donut-value">${this.formatRate(employeeReport.presenceRate)}%</span>
          </div>
        </div>
        <div>
          <p class="section-kicker">Présence</p>
          <h2 class="section-title">Taux mensuel</h2>
          <div class="chart-legend">
            <div class="legend-row">
              <span>Présences planifiées</span>
              <span class="legend-value">${employeeReport.presenceDays} / ${employeeReport.workingDays}</span>
            </div>
            <div class="legend-row">
              <span>Absences</span>
              <span class="legend-value">${employeeReport.absenceCount}</span>
            </div>
            <div class="legend-row">
              <span>Score global</span>
              <span class="legend-value">${employeeReport.performanceScore} / 100</span>
            </div>
          </div>
        </div>
      </section>

      <section class="analytics-grid">
        ${this.analyticsCard('5 à 15 min', String(employeeReport.lateRangeBreakdown.fiveToFifteenCount), 'Retards légers', 'warning')}
        ${this.analyticsCard('16 à 30 min', String(employeeReport.lateRangeBreakdown.sixteenToThirtyCount), 'Retards modérés', 'warning')}
        ${this.analyticsCard('+30 min', String(employeeReport.lateRangeBreakdown.overThirtyCount), 'Retards critiques', employeeReport.lateRangeBreakdown.overThirtyCount > 0 ? 'danger' : 'success')}
      </section>

      <section class="advanced-grid">
        <article class="card">
          <div class="section-header">
            <div>
              <p class="section-kicker">GPS</p>
              <h2 class="section-title">Conformité</h2>
            </div>
          </div>
          <div class="analytics-grid">
            ${this.analyticsCard('Validés', String(employeeReport.gpsBreakdown.gpsValidatedPointages), 'GPS conforme', 'success')}
            ${this.analyticsCard('Sans GPS', String(employeeReport.gpsBreakdown.nonGpsPointages), 'À vérifier', employeeReport.gpsBreakdown.nonGpsPointages > 0 ? 'warning' : 'success')}
            ${this.analyticsCard('Dans zone', String(employeeReport.gpsBreakdown.insideZonePointages), this.readableGpsModeLabel(employeeReport.gpsBreakdown.modeLabel), 'info')}
          </div>
        </article>
        <article class="card">
          <div class="section-header">
            <div>
              <p class="section-kicker">Sorties</p>
              <h2 class="section-title">Rythme mensuel</h2>
            </div>
          </div>
          <div class="analytics-grid">
            ${this.analyticsCard('Normales', String(employeeReport.exitBreakdown.normalExitCount), 'Sorties conformes', 'success')}
            ${this.analyticsCard('Tôt', String(employeeReport.exitBreakdown.earlyExitCount), 'Départs anticipés', employeeReport.exitBreakdown.earlyExitCount > 0 ? 'warning' : 'success')}
            ${this.analyticsCard('Supp.', String(employeeReport.exitBreakdown.overtimeDayCount), employeeReport.overtimeHours, 'info')}
          </div>
        </article>
      </section>

      <section class="card">
        <div class="section-header">
          <div>
            <p class="section-kicker">Lecture analytique</p>
            <h2 class="section-title">Distribution des signaux</h2>
          </div>
          ${this.renderBadge('Indicateurs RH', 'neutral')}
        </div>
        <div class="micro-bars">
          ${this.microBar(
            'Présence',
            `${this.formatRate(employeeReport.presenceRate)}%`,
            this.visibleRatePercent(employeeReport.presenceRate),
            'success',
          )}
          ${this.microBar(
            'Absences',
            String(employeeReport.absenceCount),
            this.visibleRatePercent(
              this.rateFromCount(
                employeeReport.absenceCount,
                employeeReport.workingDays,
              ),
            ),
            employeeReport.absenceCount > 0 ? 'danger' : 'success',
          )}
          ${this.microBar(
            'Retards',
            String(employeeReport.lateCount),
            this.visibleRatePercent(
              this.rateFromCount(
                employeeReport.lateCount,
                employeeReport.workingDays,
              ),
            ),
            employeeReport.lateCount > 0 ? 'warning' : 'success',
          )}
        </div>
      </section>

      <section class="card analysis-card">
        <div class="section-header">
          <div>
            <p class="section-kicker">Synthèse</p>
            <h2 class="section-title">Points d'attention</h2>
          </div>
          ${this.renderBadge('Confidentiel RH', 'neutral')}
        </div>
        <ul class="analysis-list">
          ${this.buildAnalysisItems(employeeReport)
            .map(
              (item) =>
                `<li class="analysis-item"><span>${this.escapeHtml(item)}</span></li>`,
            )
            .join('')}
        </ul>
      </section>

      <section class="analysis-conclusion">
        <p class="analysis-conclusion-title">Décision recommandée</p>
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
              (row) => `<tr class="${this.dailyRowClass(row.statusLabel)}">
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
          <h1 class="compact-title">Journal quotidien</h1>
          <p class="detail-subtitle">
            ${this.escapeHtml(employeeReport.fullName)} | ${this.escapeHtml(employeeReport.monthLabel)}
          </p>
          <p class="detail-meta-line">
            <strong>Identifiant employé</strong> ${this.escapeHtml(employeeReport.employeeIdentifier)}
            <span class="detail-meta-separator">|</span>
            <strong>D&eacute;partement</strong> ${this.escapeHtml(employeeReport.departmentLabel)}
          </p>
        </div>
      </section>

      <section class="card table-card">
        <div class="section-header">
          <div>
            <p class="section-kicker">Vue quotidienne</p>
            <h2 class="section-title">Présence, retards et sorties</h2>
          </div>
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
                <th style="width: 15%;">Départs tôt</th>
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
          <h1 class="hero-title">Synthèse équipe</h1>
          <p class="hero-subtitle">${this.escapeHtml(this.formatPeriod(report.month, report.year))}</p>
          <p class="hero-copy">Vue consolidée des présences, absences et heures.</p>
        </div>
        <aside class="meta-card">
          <div>
            <p class="meta-label">Émission</p>
            <p class="meta-value">${this.escapeHtml(this.formatGeneratedAt(report.generatedAt))}</p>
          </div>
          <p class="meta-copy">Confidentiel RH</p>
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
    const monthLabel =
      this.frenchMonthLabels[report.month - 1] ?? String(report.month);
    const scope = report.employeeReport?.fullName ?? 'équipe';

    return `Rapport mensuel de présence ${scope} ${monthLabel} ${report.year}`;
  }

  private footer(
    report: MonthlyAttendanceExportReport,
    pageNumber: number,
    totalPages: number,
  ) {
    return `<footer class="footer">
      <span class="footer-mark">Document généré automatiquement par KONATECH POINTAGE</span>
      <span>Confidentiel RH</span>
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

  private analyticsCard(
    label: string,
    value: string,
    copy: string,
    tone: 'success' | 'warning' | 'danger' | 'info',
  ) {
    return `<article class="analytics-card analytics-card--${tone}">
      <p class="analytics-label">${this.escapeHtml(label)}</p>
      <p class="analytics-value">${this.escapeHtml(value)}</p>
      <p class="analytics-copy">${this.escapeHtml(copy)}</p>
    </article>`;
  }

  private scoreAnalyticsItem(
    label: string,
    value: string,
    percent: number,
    tone: 'success' | 'warning' | 'danger' | 'info',
  ) {
    return `<div class="score-analytics-item">
      <div class="score-analytics-top">
        <span>${this.escapeHtml(label)}</span>
        <span class="score-analytics-value">${this.escapeHtml(value)}</span>
      </div>
      <div class="score-analytics-track">
        <div class="score-analytics-fill score-analytics-fill--${tone}" style="width: ${percent}%;"></div>
      </div>
    </div>`;
  }

  private microBar(
    label: string,
    value: string,
    percent: number,
    tone: 'success' | 'warning' | 'danger' | 'info',
  ) {
    return `<div class="micro-bar-row">
      <span>${this.escapeHtml(label)}</span>
      <span class="micro-bar-track">
        <span class="micro-bar-fill micro-bar-fill--${tone}" style="width: ${percent}%;"></span>
      </span>
      <strong>${this.escapeHtml(value)}</strong>
    </div>`;
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
      return this.renderBadge('ABSENCE', 'danger');
    }

    if (normalized.includes('retard') || normalized.includes('incomplet')) {
      return this.renderBadge(
        this.normalizeStatusLabel(statusLabel).toUpperCase(),
        'warning',
      );
    }

    return this.renderBadge(
      this.normalizeStatusLabel(statusLabel).toUpperCase(),
      'success',
    );
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
        `Aucune présence sur ${employeeReport.workingDays} jour(s) planifié(s).`,
      );
      items.push(`Score critique : ${employeeReport.performanceScore}/100.`);
      items.push('Revue administrative recommandée.');

      return items;
    }

    if (employeeReport.absenceCount >= 2) {
      items.push(`${employeeReport.absenceCount} absences à traiter.`);
    } else if (employeeReport.absenceCount === 0) {
      items.push('Aucune absence');
    }

    if (employeeReport.lateCount >= 4) {
      items.push(`${employeeReport.lateCount} retards à suivre.`);
    } else if (employeeReport.lateCount === 0) {
      items.push('Aucun retard');
    }

    if (employeeReport.gpsBreakdown.nonGpsPointages > 0) {
      items.push(
        `${employeeReport.gpsBreakdown.nonGpsPointages} pointage(s) sans GPS.`,
      );
    } else {
      items.push('GPS conforme');
    }

    if (employeeReport.outsideScheduleWorkDays > 0) {
      items.push(
        `${employeeReport.outsideScheduleWorkDays} jour(s) hors planning.`,
      );
    }

    if (employeeReport.earlyExitCount > 0) {
      items.push(`${employeeReport.earlyExitCount} départ(s) anticipé(s).`);
    } else {
      items.push('Aucun départ anticipé');
    }

    return items;
  }

  private buildAnalysisConclusion(
    employeeReport: MonthlyAttendanceEmployeeReport,
  ) {
    if (this.hasNoPresenceMonth(employeeReport)) {
      return 'Intervention RH recommandée';
    }

    if (employeeReport.performanceScore < 50) {
      return 'Intervention RH recommandée';
    }

    if (employeeReport.absenceCount > 0 || employeeReport.lateCount > 0) {
      return 'Suivi managérial ciblé';
    }

    if (employeeReport.outsideScheduleWorkDays > 0) {
      return 'Présence stable, heures hors planning isolées';
    }

    return 'Mois maîtrisé';
  }

  private scoreNarrative(employeeReport: MonthlyAttendanceEmployeeReport) {
    if (employeeReport.performanceScore >= 85) {
      return 'Mois solide';
    }

    if (employeeReport.performanceScore >= 70) {
      return 'Mois stable';
    }

    if (employeeReport.performanceScore >= 50) {
      return 'Suivi recommandé';
    }

    return 'Intervention RH recommandée';
  }

  private renderDailyTimeValue(
    value: string,
    row: MonthlyAttendanceDailyReportRow,
  ) {
    const fallback = '';
    const displayValue = this.readableValue(value, fallback);

    if (displayValue === '') {
      if (this.isAbsenceStatus(row.statusLabel)) {
        return '<span class="table-value-absence">Absence</span>';
      }

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

  private dailyRowClass(statusLabel: string) {
    const normalized = this.normalizeText(statusLabel).toLowerCase();

    if (normalized.includes('absen')) {
      return 'row--absence';
    }

    if (normalized.includes('retard') || normalized.includes('incomplet')) {
      return 'row--late';
    }

    return 'row--present';
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
      return 'Attention';
    }

    return 'Critique';
  }

  private clampScore(score: number) {
    return Math.max(0, Math.min(score, 100));
  }

  private visibleScorePercent(score: number) {
    const clampedScore = this.clampScore(score);

    return clampedScore > 0 ? Math.max(8, clampedScore) : 5;
  }

  private visibleRatePercent(rate: number) {
    const clampedRate = Math.max(0, Math.min(rate, 100));

    return clampedRate > 0 ? Math.max(4, clampedRate) : 0;
  }

  private rateFromCount(value: number, total: number) {
    if (total <= 0) {
      return 0;
    }

    return (value / total) * 100;
  }

  private scoreRingDegrees(score: number) {
    return Math.round((this.visibleScorePercent(score) / 100) * 360);
  }

  private rateDegrees(rate: number) {
    const clampedRate = Math.max(0, Math.min(rate, 100));

    return Math.round((clampedRate / 100) * 360);
  }

  private scoreExecutiveBadge(employeeReport: MonthlyAttendanceEmployeeReport) {
    if (employeeReport.performanceScore < 50) {
      return 'Priorité RH';
    }

    if (employeeReport.absenceCount > 0 || employeeReport.lateCount > 0) {
      return 'Suivi ciblé';
    }

    return 'Conforme';
  }

  private readableGpsModeLabel(value: string) {
    const normalized = this.normalizeText(value).toLowerCase();

    if (normalized.includes('obligatoire')) {
      return 'Validation GPS active';
    }

    if (normalized.includes('gps')) {
      return 'GPS conforme';
    }

    return this.readableValue(value, 'Validation non renseignée');
  }

  private buildTeamSummary(
    rows: MonthlyAttendanceExportRow[],
  ): TeamReportSummary {
    return rows.reduce<TeamReportSummary>(
      (summary, row) => ({
        totalEmployees: summary.totalEmployees + 1,
        totalWorkingDays: summary.totalWorkingDays + row.workingDays,
        totalPresenceDays:
          summary.totalPresenceDays +
          (row.workingDays > 0 ? row.presenceDays : 0),
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
