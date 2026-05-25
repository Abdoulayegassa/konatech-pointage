import { AttendanceStatus, AttendanceVerificationMethod } from '@prisma/client';
import { Injectable } from '@nestjs/common';
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
  MonthlyAttendanceDailyReportRow,
  MonthlyAttendanceEmployeeReport,
  MonthlyAttendanceExportReport,
  MonthlyAttendanceExportRow,
} from './monthly-attendance-export.types';

type ScheduleWorkDays = Parameters<typeof isScheduledOnDate>[0];

type ExportAttendanceRecord = {
  date: Date;
  status: AttendanceStatus;
  clockInAt: Date | null;
  clockOutAt: Date | null;
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
  ) {}

  async buildMonthlyReport(
    query: MonthlyAttendanceExportQueryDto,
  ): Promise<MonthlyAttendanceExportReport> {
    const { startOfMonth, endOfMonth } = this.getMonthRange(
      query.year,
      query.month,
    );
    const absenceCountingEnd = this.getAbsenceCountingEnd(
      startOfMonth,
      endOfMonth,
      new Date(),
    );

    const employees = await this.prisma.employee.findMany({
      where: {
        isActive: true,
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
            date: {
              gte: startOfMonth,
              lt: endOfMonth,
            },
          },
          orderBy: {
            date: 'asc',
          },
          select: {
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

    const securityPolicy = this.attendanceSecurityPolicyService.getPolicy();
    const allowedRadiusMeters = securityPolicy.allowedRadiusMeters;
    const generatedAt = new Date().toISOString();
    const employeeExports = employees.map((employee) =>
      this.buildEmployeeExport(
        employee,
        query.month,
        query.year,
        generatedAt,
        startOfMonth,
        absenceCountingEnd,
        allowedRadiusMeters,
      ),
    );

    return {
      month: query.month,
      year: query.year,
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
    month: number,
    year: number,
    generatedAt: string,
    startOfMonth: Date,
    absenceCountingEnd: Date,
    allowedRadiusMeters: number | null,
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
    const assignedScheduleSummary = this.getMonthlyAssignedScheduleSummary(
      employee.schedule,
      employee.attendances,
    );

    for (const attendance of employee.attendances) {
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

        if (isOutsideScheduleWork) {
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

      dailyRows.push(this.buildDailyReportRow(attendance, allowedRadiusMeters));
    }

    const { absentDays, workingDays } = this.getScheduleCoverage(
      employee.schedule,
      employee.attendances,
      startOfMonth,
      absenceCountingEnd,
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
        monthLabel: this.formatMonthLabel(month, year),
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
        dailyRows,
      },
    };
  }

  private buildDailyReportRow(
    attendance: ExportAttendanceRecord,
    allowedRadiusMeters: number | null,
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
      lateLabel:
        attendance.minutesLate > 0 ? `${attendance.minutesLate} min` : '-',
      earlyExitLabel:
        attendance.earlyExit && attendance.earlyExitMinutes > 0
          ? `${attendance.earlyExitMinutes} min`
          : '-',
      workTypeLabel: attendance.outsideScheduleWork
        ? 'Travail hors planning / Outside schedule work'
        : attendance.overtimeHours > 0
          ? 'Heures supplementaires apres service'
          : '-',
      overtimeLabel:
        attendance.overtimeHours > 0
          ? attendance.outsideScheduleWork
            ? `Travail hors planning / Outside schedule work - ${this.formatHoursLabel(attendance.overtimeHours)}`
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
    };
  }

  private getScheduleCoverage(
    schedule: ExportEmployeeRecord['schedule'],
    attendances: ExportAttendanceRecord[],
    startOfMonth: Date,
    endOfMonth: Date,
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

      if (this.isScheduledDay(resolvedSchedule, currentDate)) {
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

    const referenceDayEnd = addAttendanceDays(
      normalizeAttendanceDate(referenceDate),
      1,
    );

    return referenceDayEnd < endOfMonth ? referenceDayEnd : endOfMonth;
  }
}
