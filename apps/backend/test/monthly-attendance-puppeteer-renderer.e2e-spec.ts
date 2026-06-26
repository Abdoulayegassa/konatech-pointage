import { MonthlyAttendancePuppeteerPdfRendererService } from '../src/modules/attendance/exports/monthly-attendance-puppeteer-pdf-renderer.service';
import { MonthlyAttendancePdfExporterService } from '../src/modules/attendance/exports/monthly-attendance-pdf-exporter.service';
import {
  MonthlyAttendanceDailyReportRow,
  MonthlyAttendanceExportReport,
} from '../src/modules/attendance/exports/monthly-attendance-export.types';

describe('MonthlyAttendancePuppeteerPdfRendererService', () => {
  const renderer = new MonthlyAttendancePuppeteerPdfRendererService();

  const buildDailyRows = (count: number): MonthlyAttendanceDailyReportRow[] =>
    Array.from({ length: count }, (_, index) => ({
      date: `${String(index + 1).padStart(2, '0')}/04/2026`,
      dayLabel: ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi'][index % 5],
      clockInTime: index % 6 === 0 ? '' : '08:05',
      clockOutTime: index % 7 === 0 ? '' : '17:10',
      statusLabel: index % 6 === 0 ? 'Absence' : 'Présence',
      lateLabel: index % 4 === 0 ? '00:10' : '',
      earlyExitLabel: index % 5 === 0 ? '00:08' : '',
      workTypeLabel:
        index % 3 === 0 ? 'Travail jour non ouvré' : '-',
      overtimeLabel:
        index % 3 === 0
          ? 'Travail jour non ouvré - 05:00'
          : '',
      gpsVerificationLabel: '',
      sanctionLabel:
        index === 0
          ? 'Tolérance'
          : index === 1
            ? '2 000 FCFA'
            : index === 2
              ? '5 000 FCFA'
              : '-',
    }));

  const buildReport = (
    dailyRows: MonthlyAttendanceDailyReportRow[],
  ): MonthlyAttendanceExportReport => ({
    month: 4,
    year: 2026,
    generatedAt: '2026-04-29T12:00:00.000Z',
    currentVerificationModelLabel:
      'Mode de vérification actif : sécurité GPS pour le flux de pointage employé',
    legacyVerificationLabel:
      'Les photos historiques restent archivées sans être actives dans ce rapport',
    blockedAttemptsLabel:
      'Les tentatives hors zone peuvent être bloquées en temps réel mais ne sont pas historisées dans cet export',
    rows: [],
    employeeReport: {
      fullName: 'Awa Traoré',
      employeeIdentifier: 'EMP-2026-005',
      departmentLabel: 'Finance',
      assignedScheduleLabel: 'Matin (08:00 - 17:00 | Lun, Mar, Mer, Jeu, Ven)',
      monthLabel: 'Avril 2026',
      generationDateLabel: '29 avril 2026 à 12:00',
      workingDays: 21,
      presenceDays: 18,
      presenceRate: 85.71,
      absenceCount: 3,
      outsideScheduleWorkDays: 1,
      entryCount: 18,
      exitCount: 18,
      totalWorkedHours: '151 h 40',
      scheduledOvertimeHours: '0 h',
      outsideScheduleOvertimeHours: '5,00 h',
      overtimeHours: '4 h 15',
      earlyExitCount: 4,
      lateCount: 5,
      performanceScore: 68,
      lateBreakdown: {
        minorCount: 3,
        moderateCount: 1,
        criticalCount: 1,
      },
      lateRangeBreakdown: {
        fiveToFifteenCount: 3,
        sixteenToThirtyCount: 1,
        overThirtyCount: 1,
      },
      exitBreakdown: {
        normalExitCount: 14,
        earlyExitCount: 4,
        overtimeDayCount: 6,
        overtimeHours: '4 h 15',
        outsideScheduleWorkDays: 1,
        outsideScheduleOvertimeHours: '5,00 h',
      },
      gpsBreakdown: {
        gpsValidatedPointages: 31,
        nonGpsPointages: 5,
        insideZonePointages: 29,
        outsideZoneAttempts: null,
        modeLabel: 'GPS obligatoire',
      },
      sanctionSummary: {
        minorLatenessCount: 2,
        majorLatenessCount: 1,
        toleratedCount: 1,
        appliedCount: 2,
        totalAmount: 7000,
        totalAmountLabel: '7 000 FCFA',
        recommendation:
          'Sanctions financières à prendre en compte dans le suivi RH.',
      },
      dailyRows,
    },
  });

  const buildDocument = (report: MonthlyAttendanceExportReport) =>
    (
      renderer as unknown as {
        buildDocument: (value: MonthlyAttendanceExportReport) => string;
      }
    ).buildDocument(report);

  it('builds the employee detail table without GPS or dot placeholders', () => {
    const html = buildDocument(buildReport(buildDailyRows(3)));

    expect(html).toContain('KONATECH POINTAGE');
    expect(html).toContain('Synth\u00e8se RH mensuelle');
    expect(html).toContain('Analytics mensuels');
    expect(html).toContain('Journal quotidien');
    expect(html).not.toContain('KONATECH ATTENDANCE');
    expect(html).toContain('page-synthesis');
    expect(html).toContain('page-analysis');
    expect(html).toContain('page-details');
    expect(html).toContain('Présence, retards et sorties');
    expect(html).toContain('Heures supp.');
    expect(html).toContain('Départs tôt');
    expect(html).toContain('Identifiant employé');
    expect(html).toContain('D&eacute;partement');
    expect(html).toContain('08:00 - 17:00 | Lun, Mar, Mer, Jeu, Ven');
    expect(html).not.toContain('Entrées, sorties, statuts et GPS');
    expect(html).not.toContain('table-value-muted');
    expect(html).not.toContain('>.<');
    expect(html).toContain('writing-mode: horizontal-tb');
    expect(html).not.toContain('writing-mode: vertical');
    expect(html).not.toContain('transform: rotate');
    expect(html).not.toContain('word-break: break-word');
    expect(html).toContain('Suivi managérial ciblé');
    expect(html).toContain(
      'Document généré automatiquement par KONATECH POINTAGE',
    );
    expect(html).toContain('Conformité');
    expect(html).toContain('score-analytics');
    expect(html).toContain('mini-donut');
    expect(html).toContain('micro-bars');
    expect(html).toContain('Validation GPS active');
    expect(html).toContain('Sanctions RH');
    expect(html).toContain('Discipline RH');
    expect(html).toContain('Sanctions et tolérances');
    expect(html).toContain('Retards mineurs');
    expect(html).toContain('Retards majeurs');
    expect(html).toContain('Tolérance');
    expect(html).toContain('2 000 FCFA');
    expect(html).toContain('5 000 FCFA');
    expect(html).toContain('7 000 FCFA');
    expect(html).toContain('Sanctions financières à prendre en compte');
    expect(html).toContain('Sanction');
    expect(html).not.toContain('GPS obligatoire');
    expect(html).toContain('<strong>Page 3 / 3</strong>');
    expect(html).not.toContain(
      '<span class="badge badge--neutral">Page 3 / 3</span>',
    );
    expect(html).toContain('Travail jour non ouvré');
    expect(html).not.toContain('Flux PDF Puppeteer');
    expect(html).not.toContain('Rendu PDF unifié');
    expect(html).not.toContain('planifi?');
    expect(html).not.toContain('t?t');
  });

  it('keeps very low scores visually readable without changing the score', () => {
    const report = buildReport(buildDailyRows(1));

    report.employeeReport!.performanceScore = 0;

    const html = buildDocument(report);

    expect(html).toContain('<div class="score-value">0</div>');
    expect(html).toContain('score-card--danger');
    expect(html).toContain('score-ring--danger');
    expect(html).toContain('style="--score-deg: 18deg;"');
    expect(html).toContain('style="width: 5%;"');
    expect(html).toContain('Intervention RH recommandée');
  });

  it('keeps a single detail page for a 21-row employee report', () => {
    const html = buildDocument(buildReport(buildDailyRows(21)));
    const detailPageCount = (
      html.match(/<section class="page page-details">/g) ?? []
    ).length;

    expect(detailPageCount).toBe(1);
  });

  it('rebalances chunks to avoid a last detail page with one isolated row', () => {
    const chunkRows = (
      renderer as unknown as {
        chunkRows: <T>(rows: T[], size: number) => T[][];
      }
    ).chunkRows.bind(renderer);

    expect(
      chunkRows(
        Array.from({ length: 22 }, (_, index) => index),
        21,
      ),
    ).toEqual([Array.from({ length: 20 }, (_, index) => index), [20, 21]]);
  });

  it('does not silently fallback to the legacy PDF renderer in premium mode', async () => {
    const previousRenderer = process.env.ATTENDANCE_PDF_RENDERER;
    const previousFallback = process.env.ATTENDANCE_PDF_ALLOW_LEGACY_FALLBACK;
    const exporter = new MonthlyAttendancePdfExporterService({
      render: async () => {
        throw new Error('Chromium missing');
      },
    } as unknown as MonthlyAttendancePuppeteerPdfRendererService);

    process.env.ATTENDANCE_PDF_RENDERER = 'premium';
    delete process.env.ATTENDANCE_PDF_ALLOW_LEGACY_FALLBACK;

    try {
      await expect(
        exporter.export(buildReport(buildDailyRows(1))),
      ).rejects.toThrow(
        'Premium PDF renderer unavailable. Install Chromium or configure ATTENDANCE_PDF_EXECUTABLE_PATH.',
      );
    } finally {
      if (previousRenderer === undefined) {
        delete process.env.ATTENDANCE_PDF_RENDERER;
      } else {
        process.env.ATTENDANCE_PDF_RENDERER = previousRenderer;
      }

      if (previousFallback === undefined) {
        delete process.env.ATTENDANCE_PDF_ALLOW_LEGACY_FALLBACK;
      } else {
        process.env.ATTENDANCE_PDF_ALLOW_LEGACY_FALLBACK = previousFallback;
      }
    }
  });
});
