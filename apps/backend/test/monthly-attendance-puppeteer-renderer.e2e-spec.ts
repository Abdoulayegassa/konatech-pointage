import { MonthlyAttendancePuppeteerPdfRendererService } from '../src/modules/attendance/exports/monthly-attendance-puppeteer-pdf-renderer.service';
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
        index % 3 === 0
          ? 'Travail hors planning / Outside schedule work'
          : '-',
      overtimeLabel:
        index % 3 === 0
          ? 'Travail hors planning / Outside schedule work - 05:00'
          : '',
      gpsVerificationLabel: '',
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
      "Les tentatives hors zone peuvent être bloquées en temps réel mais ne sont pas historisées dans cet export",
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
    const html = buildDocument(buildReport(buildDailyRows(1)));

    expect(html).toContain('KONATECH POINTAGE');
    expect(html).toContain('page-synthesis');
    expect(html).toContain('page-analysis');
    expect(html).toContain('page-details');
    expect(html).toContain('Entrées, sorties et statuts');
    expect(html).toContain('Heures supp.');
    expect(html).toContain('Départ tôt');
    expect(html).toContain('Identifiant employe');
    expect(html).toContain('D&eacute;partement');
    expect(html).toContain('08:00 - 17:00 | Lun, Mar, Mer, Jeu, Ven');
    expect(html).not.toContain('Entrées, sorties, statuts et GPS');
    expect(html).not.toContain('>GPS<');
    expect(html).not.toContain('table-value-muted');
    expect(html).not.toContain('>.<');
    expect(html).toContain('writing-mode: horizontal-tb');
    expect(html).not.toContain('writing-mode: vertical');
    expect(html).not.toContain('transform: rotate');
    expect(html).not.toContain('word-break: break-word');
    expect(html).toContain('Conclusion : la période reste exploitable');
    expect(html).toContain('Sécurité GPS');
    expect(html).toContain('Travail hors planning / Outside schedule work');
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

    expect(chunkRows(Array.from({ length: 22 }, (_, index) => index), 21)).toEqual(
      [Array.from({ length: 20 }, (_, index) => index), [20, 21]],
    );
  });
});
