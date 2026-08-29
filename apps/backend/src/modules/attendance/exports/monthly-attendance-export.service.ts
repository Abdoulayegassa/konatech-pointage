import { AttendanceStatus, AttendanceVerificationMethod } from '@prisma/client';
import { BadRequestException, Injectable } from '@nestjs/common';
import { scheduleSelect } from '../../../common/prisma/selects';
import { PrismaService } from '../../../common/prisma/prisma.service';
import {
  addAttendanceDays,
  getAttendanceMonthRange,
  isScheduledOnDate,
  normalizeAttendanceDate,
} from '../../../common/utils/attendance-date.util';
import {
  resolveAttendanceSchedule,
  type ResolvedAttendanceSchedule,
} from '../../../common/utils/attendance-schedule-snapshot.util';
import { AttendanceSecurityPolicyService } from '../attendance-security-policy.service';
import { MonthlyAttendanceExportQueryDto } from '../dto/monthly-attendance-export-query.dto';
import {
  SanctionResult,
  SanctionRuleType,
  SanctionStatus,
} from '../../sanctions/sanction-engine.types';
import { SanctionsService } from '../../sanctions/sanctions.service';
import {
  MonthlyAttendanceDailyReportRow,
  MonthlyAttendanceEmployeeReport,
  MonthlyAttendanceExportReport,
  MonthlyAttendanceExportRow,
  MonthlyAttendanceSanctionSummary,
} from './monthly-attendance-export.types';
import { CalendarService } from '../../calendar/calendar.service';
import { AppClockService } from '../../../common/time/app-clock.service';
import { AuthenticationContext } from '../../auth/interfaces/authentication-context.interface';

type ScheduleWorkDays = Parameters<typeof isScheduledOnDate>[0];

type ReportPeriodMode = 'monthly' | 'custom';

type ResolvedReportPeriod = {
  mode: ReportPeriodMode;
  month: number;
  year: number;
  label: string;
  reportTitle: string;
  startDate: Date;
  endDateExclusive: Date;
};

type ExportAttendanceRecord = {
  id: string;
  date: Date;
  status: AttendanceStatus;
  clockInAt: Date | null;
  clockOutAt: Date | null;
  notes: string | null;
  outsideScheduleWork: boolean;
  earlyExit: boolean;
  earlyExitMinutes: number;
  overtimeHours: number;
  minutesLate: number;
  scheduleIdSnapshot: string | null;
  scheduleNameSnapshot: string | null;
  scheduleStartTimeSnapshot: string | null;
  scheduleEndTimeSnapshot: string | null;
  scheduleWorkDaysSnapshot: ScheduleWorkDays | null;
  scheduleLatenessMarginSnapshot: number | null;
  scheduleCapturedAt: Date | null;
  checkInDistanceMeters: number | null;
  checkOutDistanceMeters: number | null;
  checkInVerificationMethod: AttendanceVerificationMethod;
  checkOutVerificationMethod: AttendanceVerificationMethod;
  checkInVerificationReason: string | null;
  checkOutVerificationReason: string | null;
};

type ExportEmployeeRecord = {
  id: string;
  employeeIdentifier: string | null;
  employeeCode: string | null;
  firstName: string;
  lastName: string;
  department: string | null;
  schedule: {
    id: string;
    name: string;
    startTime: string;
    endTime: string;
    latenessMarginMinutes: number;
    isActive: boolean;
    workDays: ScheduleWorkDays;
    createdAt: Date;
    updatedAt: Date;
  } | null;
  attendances: ExportAttendanceRecord[];
};

type EmployeeExportPayload = {
  detail: MonthlyAttendanceEmployeeReport;
  row: MonthlyAttendanceExportRow;
};

@Injectable()
/**
 * SOURCE OF TRUTH
 * Monthly attendance report data assembly.
 *
 * Calendar-aware absences, non-working-day work, sanction summaries, and
 * monthly export rows are prepared here. Renderers must display this data
 * without recalculating attendance, sanctions, or calendar rules.
 */
export class MonthlyAttendanceExportService {
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

  private readonly frenchWeekdayLabels = [
    'Dimanche',
    'Lundi',
    'Mardi',
    'Mercredi',
    'Jeudi',
    'Vendredi',
    'Samedi',
  ] as const;
  private readonly workDayEnglishLabels: Record<string, string> = {
    MONDAY: 'Mon',
    TUESDAY: 'Tue',
    WEDNESDAY: 'Wed',
    THURSDAY: 'Thu',
    FRIDAY: 'Fri',
    SATURDAY: 'Sat',
    SUNDAY: 'Sun',
  };
  private readonly workDayFrenchLabels: Record<string, string> = {
    MONDAY: 'Lun',
    TUESDAY: 'Mar',
    WEDNESDAY: 'Mer',
    THURSDAY: 'Jeu',
    FRIDAY: 'Ven',
    SATURDAY: 'Sam',
    SUNDAY: 'Dim',
  };

  constructor(
    private readonly prisma: PrismaService,
    private readonly attendanceSecurityPolicyService: AttendanceSecurityPolicyService,
    private readonly sanctionsService: SanctionsService,
    private readonly calendarService: CalendarService,
    private readonly clock: AppClockService,
  ) {}

  async buildMonthlyReport(
    query: MonthlyAttendanceExportQueryDto,
    authentication?: AuthenticationContext,
  ): Promise<MonthlyAttendanceExportReport> {
    const organizationId =
      authentication?.generation === 'saas'
        ? authentication.organizationId
        : undefined;
    if (authentication?.generation === 'saas' && !organizationId) {
      throw new BadRequestException(
        'A valid organization context is required.',
      );
    }
    const period = this.resolveReportPeriod(query);
    const absenceCountingEnd =
      period.mode === 'monthly'
        ? this.getAbsenceCountingEnd(
            period.startDate,
            period.endDateExclusive,
            this.clock.now(),
          )
        : period.endDateExclusive;

    const employees = await this.prisma.employee.findMany({
      where: {
        isActive: true,
        ...(organizationId ? { organizationId } : {}),
        ...(query.employeeId ? { id: query.employeeId } : {}),
      },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      select: {
        id: true,
        employeeIdentifier: true,
        employeeCode: true,
        firstName: true,
        lastName: true,
        department: true,
        schedule: {
          select: scheduleSelect,
        },
        attendances: {
          where: {
            ...(organizationId ? { organizationId } : {}),
            date: {
              gte: period.startDate,
              lt: period.endDateExclusive,
            },
          },
          orderBy: {
            date: 'asc',
          },
          select: {
            id: true,
            date: true,
            status: true,
            clockInAt: true,
            clockOutAt: true,
            outsideScheduleWork: true,
            earlyExit: true,
            earlyExitMinutes: true,
            overtimeHours: true,
            minutesLate: true,
            scheduleIdSnapshot: true,
            scheduleNameSnapshot: true,
            scheduleStartTimeSnapshot: true,
            scheduleEndTimeSnapshot: true,
            scheduleWorkDaysSnapshot: true,
            scheduleLatenessMarginSnapshot: true,
            scheduleCapturedAt: true,
            notes: true,
            checkInDistanceMeters: true,
            checkOutDistanceMeters: true,
            checkInVerificationMethod: true,
            checkOutVerificationMethod: true,
            checkInVerificationReason: true,
            checkOutVerificationReason: true,
          },
        },
      },
    });

    const monthlySanctions =
      period.mode === 'monthly'
        ? await this.sanctionsService.getMonthlySanctions(
            `${period.year}-${String(period.month).padStart(2, '0')}`,
            query.employeeId,
            authentication,
          )
        : await this.sanctionsService.getSanctionsForDateRange(
            period.startDate,
            period.endDateExclusive,
            query.employeeId,
            authentication,
          );
    const sanctionsByAttendanceId = new Map(
      monthlySanctions.map((sanction) => [sanction.attendanceId, sanction]),
    );
    const securityPolicy = this.attendanceSecurityPolicyService.getPolicy();
    const allowedRadiusMeters = securityPolicy.allowedRadiusMeters;
    const generatedAt = this.clock.now().toISOString();
    const nonWorkingDateKeys = await this.calendarService.getNonWorkingDateKeys(
      period.startDate,
      absenceCountingEnd,
    );
    const employeeExports = employees.map((employee) =>
      this.buildEmployeeExport(
        employee,
        period,
        generatedAt,
        period.startDate,
        absenceCountingEnd,
        nonWorkingDateKeys,
        allowedRadiusMeters,
        sanctionsByAttendanceId,
      ),
    );

    return {
      reportingMode: period.mode,
      periodLabel: period.label,
      month: period.month,
      year: period.year,
      generatedAt,
      currentVerificationModelLabel:
        'Mode de vérification actif : sécurité GPS pour le flux de pointage employé',
      legacyVerificationLabel:
        'Les photos historiques restent archivées sans être actives dans ce rapport',
      blockedAttemptsLabel:
        'Les tentatives hors zone peuvent être bloquées en temps réel mais ne sont pas historisées dans cet export',
      rows: employeeExports.map((employeeExport) => employeeExport.row),
      employeeReport: query.employeeId
        ? (employeeExports[0]?.detail ?? null)
        : null,
    };
  }

  private buildEmployeeExport(
    employee: ExportEmployeeRecord,
    period: ResolvedReportPeriod,
    generatedAt: string,
    startOfPeriod: Date,
    absenceCountingEnd: Date,
    nonWorkingDateKeys: Set<number>,
    allowedRadiusMeters: number | null,
    sanctionsByAttendanceId: Map<string, SanctionResult>,
  ): EmployeeExportPayload {
    const dailyRows: MonthlyAttendanceDailyReportRow[] = [];
    let totalWorkedDays = 0;
    let scheduledPresenceDays = 0;
    let outsideScheduleWorkDays = 0;
    let entryCount = 0;
    let exitCount = 0;
    let lateDays = 0;
    let lateMinorCount = 0;
    let lateModerateCount = 0;
    let lateCriticalCount = 0;
    let lateFiveToFifteenCount = 0;
    let lateSixteenToThirtyCount = 0;
    let lateOverThirtyCount = 0;
    let earlyExitDays = 0;
    let earlyExitMinutes = 0;
    let overtimeHours = 0;
    let scheduledOvertimeHours = 0;
    let outsideScheduleOvertimeHours = 0;
    let overtimeDayCount = 0;
    let incompleteAttendanceDays = 0;
    let totalWorkedMilliseconds = 0;
    let totalPointages = 0;
    let gpsValidatedPointages = 0;
    let insideZonePointages = 0;
    let normalExitCount = 0;
    const sanctionSummary = this.buildEmptySanctionSummary();
    const assignedScheduleSummary = this.getMonthlyAssignedScheduleSummary(
      employee.schedule,
      employee.attendances,
    );
    const attendanceByDateKey = new Map(
      employee.attendances.map((attendance) => [
        normalizeAttendanceDate(attendance.date).getTime(),
        attendance,
      ]),
    );
    const cursor = new Date(startOfPeriod);

    while (cursor < absenceCountingEnd) {
      const currentDate = normalizeAttendanceDate(cursor);
      const attendance = attendanceByDateKey.get(currentDate.getTime()) ?? null;
      const resolvedSchedule = resolveAttendanceSchedule(
        attendance ?? {},
        employee.schedule,
      );
      const isNonWorkingDay = nonWorkingDateKeys.has(currentDate.getTime());
      const isScheduledDay =
        this.isScheduledDay(resolvedSchedule, currentDate) && !isNonWorkingDay;

      if (!attendance && !isScheduledDay) {
        cursor.setUTCDate(cursor.getUTCDate() + 1);
        continue;
      }

      if (!attendance) {
        dailyRows.push(this.buildAbsenceDailyReportRow(currentDate));
        cursor.setUTCDate(cursor.getUTCDate() + 1);
        continue;
      }

      const hasClockIn = attendance.clockInAt !== null;
      const hasClockOut = attendance.clockOutAt !== null;
      const isOutsideScheduleWork = attendance.outsideScheduleWork;
      const hasGpsCheckIn =
        hasClockIn &&
        attendance.checkInVerificationMethod ===
          AttendanceVerificationMethod.GPS;
      const hasGpsCheckOut =
        hasClockOut &&
        attendance.checkOutVerificationMethod ===
          AttendanceVerificationMethod.GPS;

      if (hasGpsCheckIn) {
        gpsValidatedPointages += 1;
      }

      if (hasGpsCheckOut) {
        gpsValidatedPointages += 1;
      }

      if (
        this.isInsideZone(
          attendance.checkInDistanceMeters,
          allowedRadiusMeters,
          hasGpsCheckIn,
        )
      ) {
        insideZonePointages += 1;
      }

      if (
        this.isInsideZone(
          attendance.checkOutDistanceMeters,
          allowedRadiusMeters,
          hasGpsCheckOut,
        )
      ) {
        insideZonePointages += 1;
      }

      if (hasClockIn) {
        entryCount += 1;
        totalWorkedDays += 1;
        totalPointages += 1;

        if (
          isOutsideScheduleWork ||
          attendance.status === AttendanceStatus.NON_WORKING_DAY_WORK
        ) {
          outsideScheduleWorkDays += 1;
        } else {
          scheduledPresenceDays += 1;
        }
      }

      if (attendance.minutesLate > 0) {
        lateDays += 1;

        if (attendance.minutesLate <= 5) {
          lateMinorCount += 1;
        } else if (attendance.minutesLate <= 15) {
          lateModerateCount += 1;
        } else {
          lateCriticalCount += 1;
        }

        if (attendance.minutesLate <= 15) {
          lateFiveToFifteenCount += 1;
        } else if (attendance.minutesLate <= 30) {
          lateSixteenToThirtyCount += 1;
        } else {
          lateOverThirtyCount += 1;
        }
      }

      if (hasClockIn && !hasClockOut) {
        incompleteAttendanceDays += 1;
      }

      if (hasClockOut) {
        exitCount += 1;
        totalPointages += 1;

        if (attendance.earlyExit && attendance.earlyExitMinutes > 0) {
          earlyExitDays += 1;
          earlyExitMinutes += attendance.earlyExitMinutes;
        }

        if (attendance.overtimeHours > 0) {
          if (isOutsideScheduleWork) {
            outsideScheduleOvertimeHours += attendance.overtimeHours;
          } else {
            scheduledOvertimeHours += attendance.overtimeHours;
            overtimeDayCount += 1;
          }
        }

        if (
          !isOutsideScheduleWork &&
          !attendance.earlyExit &&
          attendance.overtimeHours <= 0
        ) {
          normalExitCount += 1;
        }
      }

      overtimeHours += attendance.overtimeHours;

      if (attendance.clockInAt && attendance.clockOutAt) {
        const workedMilliseconds =
          attendance.clockOutAt.getTime() - attendance.clockInAt.getTime();

        if (workedMilliseconds > 0) {
          totalWorkedMilliseconds += workedMilliseconds;
        }
      }

      const sanction = sanctionsByAttendanceId.get(attendance.id) ?? null;

      this.addSanctionToSummary(sanctionSummary, sanction);
      dailyRows.push(
        this.buildDailyReportRow(attendance, allowedRadiusMeters, sanction),
      );

      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }

    this.finalizeSanctionSummary(sanctionSummary);

    const { absentDays, workingDays } = this.getScheduleCoverage(
      employee.schedule,
      employee.attendances,
      startOfPeriod,
      absenceCountingEnd,
      nonWorkingDateKeys,
    );
    const presenceDays =
      workingDays > 0 ? scheduledPresenceDays : totalWorkedDays;
    const presenceRate =
      workingDays > 0 ? (scheduledPresenceDays / workingDays) * 100 : 0;
    const fullName = `${employee.firstName} ${employee.lastName}`;

    return {
      row: {
        fullName,
        employeeIdentifier: this.resolveEmployeeIdentifierLabel(
          employee.employeeIdentifier,
          employee.employeeCode,
        ),
        department: employee.department ?? 'Unassigned',
        assignedSchedule: assignedScheduleSummary.assignedSchedule,
        workingDays,
        presenceDays,
        totalWorkedDays,
        outsideScheduleWorkDays,
        entryCount,
        exitCount,
        lateDays,
        absentDays,
        absenceCount: absentDays,
        incompleteAttendanceDays,
        totalWorkedHours: this.formatDuration(totalWorkedMilliseconds),
        earlyExitDays,
        earlyExitMinutes,
        scheduledOvertimeHours: this.formatHours(scheduledOvertimeHours),
        outsideScheduleOvertimeHours: this.formatHours(
          outsideScheduleOvertimeHours,
        ),
        overtimeHours: this.formatHours(overtimeHours),
      },
      detail: {
        fullName,
        employeeIdentifier: this.resolveEmployeeIdentifierLabel(
          employee.employeeIdentifier,
          employee.employeeCode,
        ),
        departmentLabel: employee.department ?? 'Non affecté',
        assignedScheduleLabel: assignedScheduleSummary.assignedScheduleLabel,
        monthLabel: period.label,
        generationDateLabel: this.formatDateTimeLabel(generatedAt),
        workingDays,
        presenceDays,
        presenceRate,
        absenceCount: absentDays,
        outsideScheduleWorkDays,
        entryCount,
        exitCount,
        totalWorkedHours:
          this.formatDurationLabel(totalWorkedMilliseconds) ?? '0 h 00',
        scheduledOvertimeHours: this.formatHoursLabel(scheduledOvertimeHours),
        outsideScheduleOvertimeHours: this.formatHoursLabel(
          outsideScheduleOvertimeHours,
        ),
        overtimeHours: this.formatHoursLabel(overtimeHours),
        earlyExitCount: earlyExitDays,
        lateCount: lateDays,
        performanceScore: this.calculatePerformanceScore({
          workingDays,
          presenceRate,
          absenceCount: absentDays,
          lateCount: lateDays,
        }),
        lateBreakdown: {
          minorCount: lateMinorCount,
          moderateCount: lateModerateCount,
          criticalCount: lateCriticalCount,
        },
        lateRangeBreakdown: {
          fiveToFifteenCount: lateFiveToFifteenCount,
          sixteenToThirtyCount: lateSixteenToThirtyCount,
          overThirtyCount: lateOverThirtyCount,
        },
        exitBreakdown: {
          normalExitCount,
          earlyExitCount: earlyExitDays,
          overtimeDayCount,
          overtimeHours: this.formatHoursLabel(scheduledOvertimeHours),
          outsideScheduleWorkDays,
          outsideScheduleOvertimeHours: this.formatHoursLabel(
            outsideScheduleOvertimeHours,
          ),
        },
        gpsBreakdown: {
          gpsValidatedPointages,
          nonGpsPointages: Math.max(totalPointages - gpsValidatedPointages, 0),
          insideZonePointages,
          outsideZoneAttempts: null,
          modeLabel: 'GPS obligatoire',
        },
        sanctionSummary,
        dailyRows,
      },
    };
  }

  private buildDailyReportRow(
    attendance: ExportAttendanceRecord,
    allowedRadiusMeters: number | null,
    sanction: SanctionResult | null,
  ): MonthlyAttendanceDailyReportRow {
    const hasClockIn = attendance.clockInAt !== null;
    const hasClockOut = attendance.clockOutAt !== null;
    const totalPointages = Number(hasClockIn) + Number(hasClockOut);
    const gpsValidatedPointages =
      Number(
        hasClockIn &&
          attendance.checkInVerificationMethod ===
            AttendanceVerificationMethod.GPS,
      ) +
      Number(
        hasClockOut &&
          attendance.checkOutVerificationMethod ===
            AttendanceVerificationMethod.GPS,
      );

    const insideZonePointages =
      Number(
        this.isInsideZone(
          attendance.checkInDistanceMeters,
          allowedRadiusMeters,
          hasClockIn &&
            attendance.checkInVerificationMethod ===
              AttendanceVerificationMethod.GPS,
        ),
      ) +
      Number(
        this.isInsideZone(
          attendance.checkOutDistanceMeters,
          allowedRadiusMeters,
          hasClockOut &&
            attendance.checkOutVerificationMethod ===
              AttendanceVerificationMethod.GPS,
        ),
      );

    return {
      date: this.formatShortDate(attendance.date),
      dayLabel: this.frenchWeekdayLabels[attendance.date.getUTCDay()],
      clockInTime: this.formatTime(attendance.clockInAt),
      clockOutTime: this.formatTime(attendance.clockOutAt),
      statusLabel: this.getStatusLabel(attendance.status),
      commentLabel: attendance.notes?.trim() || null,
      lateLabel:
        attendance.minutesLate > 0 ? `${attendance.minutesLate} min` : '-',
      earlyExitLabel:
        attendance.earlyExit && attendance.earlyExitMinutes > 0
          ? `${attendance.earlyExitMinutes} min`
          : '-',
      workTypeLabel: attendance.outsideScheduleWork
        ? attendance.status === AttendanceStatus.NON_WORKING_DAY_WORK
          ? 'Travail jour non ouvré'
          : 'Travail jour non ouvré'
        : attendance.overtimeHours > 0
          ? 'Heures supplémentaires après service'
          : '-',
      overtimeLabel:
        attendance.overtimeHours > 0
          ? attendance.outsideScheduleWork
            ? attendance.status === AttendanceStatus.NON_WORKING_DAY_WORK
              ? `Travail jour non ouvré - ${this.formatHoursLabel(attendance.overtimeHours)}`
              : `Travail jour non ouvré - ${this.formatHoursLabel(attendance.overtimeHours)}`
            : this.formatHoursLabel(attendance.overtimeHours)
          : '-',
      gpsVerificationLabel: this.getGpsVerificationLabel({
        gpsValidatedPointages,
        insideZonePointages,
        totalPointages,
        hasOutsideZoneReason:
          this.isOutsideZoneReason(attendance.checkInVerificationReason) ||
          this.isOutsideZoneReason(attendance.checkOutVerificationReason),
      }),
      sanctionLabel: this.getDailySanctionLabel(sanction),
    };
  }

  private buildAbsenceDailyReportRow(
    date: Date,
  ): MonthlyAttendanceDailyReportRow {
    return {
      date: this.formatShortDate(date),
      dayLabel: this.frenchWeekdayLabels[date.getUTCDay()],
      clockInTime: '-',
      clockOutTime: '-',
      statusLabel: 'Absence',
      commentLabel: null,
      lateLabel: '-',
      earlyExitLabel: '-',
      workTypeLabel: '-',
      overtimeLabel: '-',
      gpsVerificationLabel: '-',
      sanctionLabel: '-',
    };
  }

  private buildEmptySanctionSummary(): MonthlyAttendanceSanctionSummary {
    return {
      minorLatenessCount: 0,
      majorLatenessCount: 0,
      toleratedCount: 0,
      appliedCount: 0,
      totalAmount: 0,
      totalAmountLabel: this.formatMoney(0),
      recommendation: 'Aucune sanction financière appliquée ce mois-ci.',
    };
  }

  private addSanctionToSummary(
    summary: MonthlyAttendanceSanctionSummary,
    sanction: SanctionResult | null,
  ) {
    if (!sanction || sanction.status === SanctionStatus.NOT_APPLICABLE) {
      return;
    }

    if (sanction.ruleType === SanctionRuleType.MINOR_LATENESS) {
      summary.minorLatenessCount += 1;
    }

    if (sanction.ruleType === SanctionRuleType.MAJOR_LATENESS) {
      summary.majorLatenessCount += 1;
    }

    if (sanction.status === SanctionStatus.TOLERATED) {
      summary.toleratedCount += 1;
      return;
    }

    if (sanction.status === SanctionStatus.APPLIED) {
      summary.appliedCount += 1;
      summary.totalAmount += sanction.amount;
    }
  }

  private finalizeSanctionSummary(summary: MonthlyAttendanceSanctionSummary) {
    summary.totalAmountLabel = this.formatMoney(summary.totalAmount);

    if (summary.appliedCount > 0) {
      summary.recommendation =
        'Sanctions financières à prendre en compte dans le suivi RH.';
      return;
    }

    if (summary.toleratedCount > 0) {
      summary.recommendation = 'Tolérance appliquée selon les règles RH.';
      return;
    }

    summary.recommendation = 'Aucune sanction financière appliquée ce mois-ci.';
  }

  private getDailySanctionLabel(sanction: SanctionResult | null) {
    if (!sanction || sanction.status === SanctionStatus.NOT_APPLICABLE) {
      return '-';
    }

    if (sanction.status === SanctionStatus.TOLERATED) {
      return 'Tolérance';
    }

    return this.formatMoney(sanction.amount);
  }

  private getScheduleCoverage(
    schedule: ExportEmployeeRecord['schedule'],
    attendances: ExportAttendanceRecord[],
    startOfMonth: Date,
    endOfMonth: Date,
    nonWorkingDateKeys: Set<number>,
  ) {
    if (!schedule?.isActive && attendances.length === 0) {
      return {
        absentDays: 0,
        workingDays: 0,
      };
    }

    const attendanceByDateKey = new Map(
      attendances.map((attendance) => [
        normalizeAttendanceDate(attendance.date).getTime(),
        attendance,
      ]),
    );
    const cursor = new Date(startOfMonth);
    let absentDays = 0;
    let workingDays = 0;

    while (cursor < endOfMonth) {
      const currentDate = normalizeAttendanceDate(cursor);
      const attendance = attendanceByDateKey.get(currentDate.getTime());
      const resolvedSchedule = resolveAttendanceSchedule(
        attendance ?? {},
        schedule,
      );

      if (
        this.isScheduledDay(resolvedSchedule, currentDate) &&
        !nonWorkingDateKeys.has(currentDate.getTime())
      ) {
        workingDays += 1;

        if (!attendance?.clockInAt) {
          absentDays += 1;
        }
      }

      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }

    return {
      absentDays,
      workingDays,
    };
  }

  private getMonthlyAssignedScheduleSummary(
    schedule: ExportEmployeeRecord['schedule'],
    attendances: ExportAttendanceRecord[],
  ) {
    const snapshotSummaries = new Map<
      string,
      {
        assignedSchedule: string;
        assignedScheduleLabel: string;
      }
    >();
    const fallbackSummaries = new Map<
      string,
      {
        assignedSchedule: string;
        assignedScheduleLabel: string;
      }
    >();

    for (const attendance of attendances) {
      const resolvedSchedule = resolveAttendanceSchedule(attendance, schedule);
      const summary = this.formatResolvedScheduleSummary(resolvedSchedule);

      if (summary) {
        const targetSummaries =
          resolvedSchedule.source === 'snapshot'
            ? snapshotSummaries
            : fallbackSummaries;

        targetSummaries.set(summary.assignedSchedule, summary);
      }
    }

    const summaries =
      snapshotSummaries.size > 0 ? snapshotSummaries : fallbackSummaries;

    if (summaries.size === 0) {
      const fallbackSummary = this.formatResolvedScheduleSummary(
        resolveAttendanceSchedule({}, schedule),
      );

      return (
        fallbackSummary ?? {
          assignedSchedule: 'No schedule assigned',
          assignedScheduleLabel: 'Aucun planning assignÃ©',
        }
      );
    }

    if (summaries.size === 1) {
      return [...summaries.values()][0];
    }

    return {
      assignedSchedule: `Varies during month: ${[...summaries.values()]
        .map((summary) => summary.assignedSchedule)
        .join('; ')}`,
      assignedScheduleLabel: `Planning variable sur le mois : ${[
        ...summaries.values(),
      ]
        .map((summary) => summary.assignedScheduleLabel)
        .join(' ; ')}`,
    };
  }

  private isInsideZone(
    distanceMeters: number | null,
    allowedRadiusMeters: number | null,
    gpsValidated: boolean,
  ) {
    if (!gpsValidated) {
      return false;
    }

    if (distanceMeters === null || allowedRadiusMeters === null) {
      return true;
    }

    return distanceMeters <= allowedRadiusMeters;
  }

  private getGpsVerificationLabel(input: {
    gpsValidatedPointages: number;
    insideZonePointages: number;
    totalPointages: number;
    hasOutsideZoneReason: boolean;
  }) {
    if (input.totalPointages === 0) {
      return '-';
    }

    if (input.hasOutsideZoneReason) {
      return 'Hors zone';
    }

    if (input.gpsValidatedPointages === input.totalPointages) {
      return input.insideZonePointages === input.totalPointages
        ? 'Validé'
        : 'GPS validé';
    }

    if (input.gpsValidatedPointages > 0) {
      return `Partiel (${input.gpsValidatedPointages}/${input.totalPointages})`;
    }

    return 'Sans GPS';
  }

  private isOutsideZoneReason(reason: string | null) {
    return reason?.toUpperCase().includes('OUTSIDE') ?? false;
  }

  private getStatusLabel(status: AttendanceStatus) {
    switch (status) {
      case AttendanceStatus.PRESENT:
        return 'Présent';
      case AttendanceStatus.LATE:
        return 'Retard';
      case AttendanceStatus.INCOMPLETE:
        return 'Pointage incomplet';
      case AttendanceStatus.ABSENT:
        return 'Absence';
      case AttendanceStatus.NON_WORKING_DAY_WORK:
        return 'Travail jour non ouvré';
      default:
        return 'Présent';
    }
  }

  private formatAssignedSchedule(schedule: ExportEmployeeRecord['schedule']) {
    const summary = this.formatResolvedScheduleSummary(
      resolveAttendanceSchedule({}, schedule),
    );

    return summary?.assignedSchedule ?? 'No schedule assigned';
  }

  private formatAssignedScheduleLabel(
    schedule: ExportEmployeeRecord['schedule'],
  ) {
    if (!schedule) {
      return 'Aucun planning assigné';
    }

    const summary = this.formatResolvedScheduleSummary(
      resolveAttendanceSchedule({}, schedule),
    );

    return summary?.assignedScheduleLabel ?? 'Aucun planning assignÃ©';
  }

  private formatResolvedScheduleSummary(schedule: ResolvedAttendanceSchedule) {
    if (!schedule.name || !schedule.startTime || !schedule.endTime) {
      return null;
    }

    const englishWorkDays = this.formatWorkDaysLabel(schedule.workDays, 'en');
    const frenchWorkDays = this.formatWorkDaysLabel(schedule.workDays, 'fr');

    return {
      assignedSchedule: `${schedule.name} (${schedule.startTime}-${schedule.endTime}${englishWorkDays ? ` | ${englishWorkDays}` : ''})`,
      assignedScheduleLabel: `${schedule.name} (${schedule.startTime} - ${schedule.endTime}${frenchWorkDays ? ` | ${frenchWorkDays}` : ''})`,
    };
  }

  private formatWorkDaysLabel(
    workDays: ResolvedAttendanceSchedule['workDays'],
    locale: 'en' | 'fr',
  ) {
    if (!Array.isArray(workDays) || workDays.length === 0) {
      return null;
    }

    const labels = workDays
      .filter((day): day is string => typeof day === 'string')
      .map((day) => day.toUpperCase())
      .map((day) =>
        locale === 'fr'
          ? (this.workDayFrenchLabels[day] ?? day)
          : (this.workDayEnglishLabels[day] ?? day),
      );

    return labels.length > 0 ? labels.join(', ') : null;
  }

  private isScheduledDay(schedule: ResolvedAttendanceSchedule, date: Date) {
    if (!schedule.workDays) {
      return false;
    }

    return isScheduledOnDate(
      schedule.workDays as Parameters<typeof isScheduledOnDate>[0],
      date,
    );
  }

  private formatDuration(totalWorkedMilliseconds: number) {
    if (totalWorkedMilliseconds <= 0) {
      return '';
    }

    const totalMinutes = Math.round(totalWorkedMilliseconds / 60000);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;

    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
  }

  private formatDurationLabel(totalWorkedMilliseconds: number) {
    if (totalWorkedMilliseconds <= 0) {
      return null;
    }

    const totalMinutes = Math.round(totalWorkedMilliseconds / 60000);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;

    return `${hours} h ${String(minutes).padStart(2, '0')}`;
  }

  private formatHours(value: number) {
    if (value <= 0) {
      return '';
    }

    return value.toFixed(2);
  }

  private formatHoursLabel(value: number) {
    if (value <= 0) {
      return '0 h';
    }

    return `${value.toFixed(2).replace('.', ',')} h`;
  }

  private formatMoney(value: number) {
    return `${new Intl.NumberFormat('fr-FR').format(value)} FCFA`;
  }

  private formatMonthLabel(month: number, year: number) {
    return `${this.capitalize(this.frenchMonthLabels[month - 1] ?? '')} ${year}`;
  }

  private formatDateTimeLabel(value: string) {
    const date = new Date(value);
    const day = String(date.getUTCDate()).padStart(2, '0');
    const month = this.frenchMonthLabels[date.getUTCMonth()] ?? '';
    const year = date.getUTCFullYear();
    const hours = String(date.getUTCHours()).padStart(2, '0');
    const minutes = String(date.getUTCMinutes()).padStart(2, '0');

    return `${day} ${month} ${year} à ${hours}:${minutes}`;
  }

  private calculatePerformanceScore(input: {
    workingDays: number;
    presenceRate: number;
    absenceCount: number;
    lateCount: number;
  }) {
    if (input.workingDays <= 0) {
      return 0;
    }

    const absencePenalty = (input.absenceCount / input.workingDays) * 35;
    const latePenalty = (input.lateCount / input.workingDays) * 15;
    const rawScore = input.presenceRate - absencePenalty - latePenalty;

    return Math.max(0, Math.min(100, Math.round(rawScore)));
  }

  private formatShortDate(value: Date) {
    const day = String(value.getUTCDate()).padStart(2, '0');
    const month = String(value.getUTCMonth() + 1).padStart(2, '0');
    const year = value.getUTCFullYear();

    return `${day}/${month}/${year}`;
  }

  private formatTime(value: Date | null) {
    if (!value) {
      return '-';
    }

    const hours = String(value.getUTCHours()).padStart(2, '0');
    const minutes = String(value.getUTCMinutes()).padStart(2, '0');

    return `${hours}:${minutes}`;
  }

  private resolveEmployeeIdentifierLabel(
    employeeIdentifier: string | null,
    employeeCode: string | null,
  ) {
    return (
      employeeIdentifier?.trim() || employeeCode?.trim() || 'ID non defini'
    );
  }

  private capitalize(value: string) {
    if (!value) {
      return value;
    }

    return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
  }

  private getMonthRange(year: number, month: number) {
    return getAttendanceMonthRange(year, month);
  }

  private resolveReportPeriod(
    query: MonthlyAttendanceExportQueryDto,
  ): ResolvedReportPeriod {
    if (query.mode === 'custom') {
      if (!query.startDate || !query.endDate) {
        throw new BadRequestException(
          'Custom report period requires startDate and endDate.',
        );
      }

      const startDate = normalizeAttendanceDate(new Date(query.startDate));
      const endDate = normalizeAttendanceDate(new Date(query.endDate));

      if (
        Number.isNaN(startDate.getTime()) ||
        Number.isNaN(endDate.getTime())
      ) {
        throw new BadRequestException(
          'Custom report period dates are invalid.',
        );
      }

      if (endDate < startDate) {
        throw new BadRequestException(
          'endDate must be greater than or equal to startDate.',
        );
      }

      return {
        mode: 'custom',
        month: startDate.getUTCMonth() + 1,
        year: startDate.getUTCFullYear(),
        label: this.formatCustomPeriodLabel(startDate, endDate),
        reportTitle: 'Synthèse RH — Période personnalisée',
        startDate,
        endDateExclusive: addAttendanceDays(endDate, 1),
      };
    }

    if (typeof query.month !== 'number' || typeof query.year !== 'number') {
      throw new BadRequestException(
        'month and year are required for monthly reports.',
      );
    }

    const { startOfMonth, endOfMonth } = this.getMonthRange(
      query.year,
      query.month,
    );

    return {
      mode: 'monthly',
      month: query.month,
      year: query.year,
      label: this.formatMonthLabel(query.month, query.year),
      reportTitle: 'Synthèse RH mensuelle',
      startDate: startOfMonth,
      endDateExclusive: endOfMonth,
    };
  }

  private formatCustomPeriodLabel(startDate: Date, endDate: Date) {
    return `Du ${this.formatLongDateLabel(startDate)} au ${this.formatLongDateLabel(endDate)}`;
  }

  private formatLongDateLabel(date: Date) {
    const day = String(date.getUTCDate()).padStart(2, '0');
    const month = this.frenchMonthLabels[date.getUTCMonth()] ?? '';
    const year = date.getUTCFullYear();

    return `${day} ${month} ${year}`;
  }

  private getAbsenceCountingEnd(
    startOfMonth: Date,
    endOfMonth: Date,
    referenceDate: Date,
  ) {
    if (referenceDate < startOfMonth) {
      return startOfMonth;
    }

    if (referenceDate >= endOfMonth) {
      return endOfMonth;
    }

    const completedDayEnd = normalizeAttendanceDate(referenceDate);

    return completedDayEnd < endOfMonth ? completedDayEnd : endOfMonth;
  }
}
