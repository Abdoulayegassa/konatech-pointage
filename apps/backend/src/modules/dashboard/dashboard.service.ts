import { Injectable } from '@nestjs/common';
import {
  AttendanceStatus,
  AttendanceVerificationLevel,
  AttendanceVerificationMethod,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  addAttendanceDays,
  getAttendanceMonthRangeFromDate,
  isScheduledOnDate,
  normalizeAttendanceDate,
} from '../../common/utils/attendance-date.util';
import {
  DashboardAnalytics,
  DashboardOverview,
  DashboardRecentActivity,
  DashboardTopEarlyExitEmployee,
  DashboardTopLateEmployee,
  DashboardTopOvertimeEmployee,
  DashboardTopSuspiciousEmployee,
} from './dashboard.types';

type DashboardEmployeeSummary = {
  id: string;
  employeeIdentifier: string | null;
  employeeCode: string | null;
  firstName: string;
  lastName: string;
  department: string | null;
};

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getOverview(
    referenceDate: Date = new Date(),
  ): Promise<DashboardOverview> {
    const { startOfDay, endOfDay } = this.getDayRange(referenceDate);
    const { startOfMonth, endOfMonth } = this.getMonthRange(referenceDate);

    const [
      totalEmployees,
      scheduledEmployees,
      presentToday,
      lateEmployeesToday,
      earlyExitToday,
      overtimeTodayAggregate,
      totalAttendanceRecordsToday,
      gpsValidatedCheckInCount,
      insideZoneCheckInCount,
      legacySensitiveCheckInCount,
      legacyPhotoCheckInCount,
      gpsValidatedCheckOutCount,
      insideZoneCheckOutCount,
      legacySensitiveCheckOutCount,
      legacyPhotoCheckOutCount,
      recentAttendanceRecords,
    ] = await Promise.all([
      this.prisma.employee.count({
        where: {
          isActive: true,
        },
      }),
      this.prisma.employee.findMany({
        where: {
          isActive: true,
          scheduleId: {
            not: null,
          },
        },
        select: {
          id: true,
          schedule: {
            select: {
              isActive: true,
              workDays: true,
            },
          },
        },
      }),
      this.prisma.attendance.count({
        where: {
          date: {
            gte: startOfDay,
            lt: endOfDay,
          },
          clockInAt: {
            not: null,
          },
        },
      }),
      this.prisma.attendance.count({
        where: {
          date: {
            gte: startOfDay,
            lt: endOfDay,
          },
          minutesLate: {
            gt: 0,
          },
        },
      }),
      this.prisma.attendance.count({
        where: {
          date: {
            gte: startOfDay,
            lt: endOfDay,
          },
          earlyExit: true,
        },
      }),
      this.prisma.attendance.aggregate({
        where: {
          date: {
            gte: startOfDay,
            lt: endOfDay,
          },
          overtimeHours: {
            gt: 0,
          },
        },
        _sum: {
          overtimeHours: true,
        },
      }),
      this.prisma.attendance.count({
        where: {
          date: {
            gte: startOfDay,
            lt: endOfDay,
          },
        },
      }),
      this.prisma.attendance.count({
        where: {
          date: {
            gte: startOfDay,
            lt: endOfDay,
          },
          clockInAt: {
            not: null,
          },
          checkInVerificationMethod: AttendanceVerificationMethod.GPS,
        },
      }),
      this.prisma.attendance.count({
        where: {
          date: {
            gte: startOfDay,
            lt: endOfDay,
          },
          clockInAt: {
            not: null,
          },
          checkInVerificationReason: 'WITHIN_ALLOWED_RADIUS',
        },
      }),
      this.prisma.attendance.count({
        where: {
          date: {
            gte: startOfDay,
            lt: endOfDay,
          },
          clockInAt: {
            not: null,
          },
          checkInVerificationLevel: {
            in: [
              AttendanceVerificationLevel.WARNING,
              AttendanceVerificationLevel.STRICT,
            ],
          },
        },
      }),
      this.prisma.attendance.count({
        where: {
          date: {
            gte: startOfDay,
            lt: endOfDay,
          },
          clockInAt: {
            not: null,
          },
          checkInVerificationMethod: AttendanceVerificationMethod.PHOTO,
        },
      }),
      this.prisma.attendance.count({
        where: {
          date: {
            gte: startOfDay,
            lt: endOfDay,
          },
          clockOutAt: {
            not: null,
          },
          checkOutVerificationMethod: AttendanceVerificationMethod.GPS,
        },
      }),
      this.prisma.attendance.count({
        where: {
          date: {
            gte: startOfDay,
            lt: endOfDay,
          },
          clockOutAt: {
            not: null,
          },
          checkOutVerificationReason: 'WITHIN_ALLOWED_RADIUS',
        },
      }),
      this.prisma.attendance.count({
        where: {
          date: {
            gte: startOfDay,
            lt: endOfDay,
          },
          clockOutAt: {
            not: null,
          },
          checkOutVerificationLevel: {
            in: [
              AttendanceVerificationLevel.WARNING,
              AttendanceVerificationLevel.STRICT,
            ],
          },
        },
      }),
      this.prisma.attendance.count({
        where: {
          date: {
            gte: startOfDay,
            lt: endOfDay,
          },
          clockOutAt: {
            not: null,
          },
          checkOutVerificationMethod: AttendanceVerificationMethod.PHOTO,
        },
      }),
      this.prisma.attendance.findMany({
        take: 5,
        orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
        select: {
          id: true,
          employeeId: true,
          date: true,
          status: true,
          clockInAt: true,
          clockOutAt: true,
          outsideScheduleWork: true,
          scheduledExitTime: true,
          earlyExit: true,
          earlyExitMinutes: true,
          overtimeHours: true,
          overtimeMinutes: true,
          absenceCount: true,
          minutesLate: true,
          notes: true,
          checkInDistanceMeters: true,
          checkInVerificationMethod: true,
          checkInVerificationLevel: true,
          checkInVerificationReason: true,
          checkInVerificationPhoto: true,
          checkInVerificationPhotoPublicId: true,
          checkOutDistanceMeters: true,
          checkOutVerificationMethod: true,
          checkOutVerificationLevel: true,
          checkOutVerificationReason: true,
          checkOutVerificationPhoto: true,
          checkOutVerificationPhotoPublicId: true,
          employee: {
            select: {
              employeeIdentifier: true,
              employeeCode: true,
              firstName: true,
              lastName: true,
              department: true,
            },
          },
        },
      }),
    ]);

    const scheduledEmployeeIds = scheduledEmployees
      .filter(
        (employee) =>
          employee.schedule &&
          employee.schedule.isActive &&
          isScheduledOnDate(employee.schedule.workDays, referenceDate),
      )
      .map((employee) => employee.id);

    const [
      todayScheduledAttendances,
      topLateEmployees,
      topLegacySecurityEmployees,
      topOvertimeEmployees,
      topEarlyExitEmployees,
      monthlyOvertimeAggregate,
      outsideScheduleMonthlyAggregate,
      earlyExitCount,
      absenceCountThisMonth,
    ] = await Promise.all([
      scheduledEmployeeIds.length === 0
        ? []
        : this.prisma.attendance.findMany({
            where: {
              employeeId: {
                in: scheduledEmployeeIds,
              },
              date: {
                gte: startOfDay,
                lt: endOfDay,
              },
            },
            select: {
              employeeId: true,
              status: true,
              clockInAt: true,
            },
          }),
      this.getTopLateEmployees(startOfMonth, endOfMonth),
      this.getTopSuspiciousEmployees(startOfMonth, endOfMonth),
      this.getTopOvertimeEmployees(startOfMonth, endOfMonth),
      this.getTopEarlyExitEmployees(startOfMonth, endOfMonth),
      this.prisma.attendance.aggregate({
        where: {
          date: {
            gte: startOfMonth,
            lt: endOfMonth,
          },
          overtimeHours: {
            gt: 0,
          },
        },
        _sum: {
          overtimeHours: true,
        },
      }),
      this.prisma.attendance.aggregate({
        where: {
          date: {
            gte: startOfMonth,
            lt: endOfMonth,
          },
          outsideScheduleWork: true,
        },
        _count: {
          id: true,
        },
        _sum: {
          overtimeHours: true,
        },
      }),
      this.prisma.attendance.count({
        where: {
          date: {
            gte: startOfMonth,
            lt: endOfMonth,
          },
          earlyExit: true,
        },
      }),
      this.countMonthlyAbsences(
        scheduledEmployees,
        startOfMonth,
        endOfMonth,
        referenceDate,
      ),
    ]);
    const absentEmployeesToday = this.countAbsentEmployees(
      scheduledEmployeeIds,
      todayScheduledAttendances,
    );
    const scheduledPresentToday = todayScheduledAttendances.filter(
      (attendance) =>
        attendance.clockInAt !== null &&
        attendance.status !== AttendanceStatus.ABSENT,
    ).length;

    return {
      generatedAt: new Date().toISOString(),
      date: startOfDay.toISOString(),
      summary: {
        totalEmployees,
        presentToday,
        lateEmployeesToday,
        absentEmployeesToday,
        earlyExitToday,
        overtimeHoursToday: this.roundHours(
          overtimeTodayAggregate._sum.overtimeHours ?? 0,
        ),
        totalAttendanceRecordsToday,
      },
      analytics: this.buildAnalytics({
        expectedEmployeesToday: scheduledEmployeeIds.length,
        presentToday: scheduledPresentToday,
        lateEmployeesToday,
        absentEmployeesToday,
        outsideScheduleWorkDays:
          outsideScheduleMonthlyAggregate._count.id ?? 0,
        outsideScheduleOvertimeHoursThisMonth: this.roundHours(
          outsideScheduleMonthlyAggregate._sum.overtimeHours ?? 0,
        ),
        gpsValidatedCheckInCount,
        gpsValidatedCheckOutCount,
        insideZoneCheckInCount,
        insideZoneCheckOutCount,
        blockedCheckInCount: null,
        blockedCheckOutCount: null,
        legacySensitiveCheckInCount,
        legacySensitiveCheckOutCount,
        earlyExitCount,
        absenceCountThisMonth,
        overtimeHoursThisMonth: this.roundHours(
          monthlyOvertimeAggregate._sum.overtimeHours ?? 0,
        ),
        legacyPhotoCheckInCount,
        legacyPhotoCheckOutCount,
        topLateEmployees,
        topLegacySecurityEmployees,
        topOvertimeEmployees,
        topEarlyExitEmployees,
      }),
      recentActivity: this.mapRecentActivity(recentAttendanceRecords),
    };
  }

  private countAbsentEmployees(
    scheduledEmployeeIds: string[],
    attendances: Array<{
      employeeId: string;
      status: AttendanceStatus;
      clockInAt: Date | null;
    }>,
  ) {
    const attendanceByEmployeeId = new Map(
      attendances.map((attendance) => [attendance.employeeId, attendance]),
    );

    return scheduledEmployeeIds.reduce((count, employeeId) => {
      const attendance = attendanceByEmployeeId.get(employeeId);

      if (!attendance) {
        return count + 1;
      }

      if (attendance.status === AttendanceStatus.ABSENT) {
        return count + 1;
      }

      if (attendance.clockInAt === null) {
        return count + 1;
      }

      return count;
    }, 0);
  }

  private getDayRange(referenceDate: Date) {
    const startOfDay = normalizeAttendanceDate(referenceDate);
    const endOfDay = addAttendanceDays(startOfDay, 1);

    return {
      startOfDay,
      endOfDay,
    };
  }

  private getMonthRange(referenceDate: Date) {
    const { start: startOfMonth, end: endOfMonth } =
      getAttendanceMonthRangeFromDate(referenceDate);

    return {
      startOfMonth,
      endOfMonth,
    };
  }

  private buildAnalytics(input: {
    expectedEmployeesToday: number;
    presentToday: number;
    lateEmployeesToday: number;
    absentEmployeesToday: number;
    outsideScheduleWorkDays: number;
    outsideScheduleOvertimeHoursThisMonth: number;
    gpsValidatedCheckInCount: number;
    gpsValidatedCheckOutCount: number;
    insideZoneCheckInCount: number;
    insideZoneCheckOutCount: number;
    blockedCheckInCount: number | null;
    blockedCheckOutCount: number | null;
    legacySensitiveCheckInCount: number;
    legacySensitiveCheckOutCount: number;
    earlyExitCount: number;
    absenceCountThisMonth: number;
    overtimeHoursThisMonth: number;
    legacyPhotoCheckInCount: number;
    legacyPhotoCheckOutCount: number;
    topLateEmployees: DashboardTopLateEmployee[];
    topLegacySecurityEmployees: DashboardTopSuspiciousEmployee[];
    topOvertimeEmployees: DashboardTopOvertimeEmployee[];
    topEarlyExitEmployees: DashboardTopEarlyExitEmployee[];
  }): DashboardAnalytics {
    const gpsValidatedAttendanceCount =
      input.gpsValidatedCheckInCount + input.gpsValidatedCheckOutCount;
    const insideZoneAttendanceCount =
      input.insideZoneCheckInCount + input.insideZoneCheckOutCount;
    const blockedAttendanceAttemptCount =
      input.blockedCheckInCount !== null && input.blockedCheckOutCount !== null
        ? input.blockedCheckInCount + input.blockedCheckOutCount
        : null;
    const legacyHistoricalVerificationCount =
      input.legacySensitiveCheckInCount + input.legacySensitiveCheckOutCount;
    const legacyHistoricalPhotoCount =
      input.legacyPhotoCheckInCount + input.legacyPhotoCheckOutCount;
    const topLegacySecurityEmployees =
      input.topLegacySecurityEmployees ?? [];

    return {
      attendanceRate: this.toRate(
        input.presentToday,
        input.expectedEmployeesToday,
      ),
      latenessRate: this.toRate(input.lateEmployeesToday, input.presentToday),
      absenceRate: this.toRate(
        input.absentEmployeesToday,
        input.expectedEmployeesToday,
      ),
      absenceCountThisMonth: input.absenceCountThisMonth,
      outsideScheduleWorkDays: input.outsideScheduleWorkDays,
      outsideScheduleOvertimeHoursThisMonth:
        input.outsideScheduleOvertimeHoursThisMonth,
      gpsValidatedCheckInCount: input.gpsValidatedCheckInCount,
      gpsValidatedCheckOutCount: input.gpsValidatedCheckOutCount,
      gpsValidatedAttendanceCount,
      insideZoneCheckInCount: input.insideZoneCheckInCount,
      insideZoneCheckOutCount: input.insideZoneCheckOutCount,
      insideZoneAttendanceCount,
      blockedCheckInCount: input.blockedCheckInCount,
      blockedCheckOutCount: input.blockedCheckOutCount,
      blockedAttendanceAttemptCount,
      outsideZoneRejectedAttemptCount: blockedAttendanceAttemptCount,
      legacySensitiveCheckInCount: input.legacySensitiveCheckInCount,
      legacySensitiveCheckOutCount: input.legacySensitiveCheckOutCount,
      legacyHistoricalVerificationCount,
      legacyPhotoCheckInCount: input.legacyPhotoCheckInCount,
      legacyPhotoCheckOutCount: input.legacyPhotoCheckOutCount,
      legacyHistoricalPhotoCount,
      suspiciousCheckInCount: input.legacySensitiveCheckInCount,
      suspiciousCheckOutCount: input.legacySensitiveCheckOutCount,
      earlyExitCount: input.earlyExitCount,
      overtimeHoursThisMonth: input.overtimeHoursThisMonth,
      photoVerificationCount: input.legacyPhotoCheckInCount,
      checkOutPhotoVerificationCount: input.legacyPhotoCheckOutCount,
      topLateEmployees: input.topLateEmployees,
      topLegacySecurityEmployees,
      topSuspiciousEmployees: topLegacySecurityEmployees,
      topOvertimeEmployees: input.topOvertimeEmployees,
      topEarlyExitEmployees: input.topEarlyExitEmployees,
    };
  }

  private toRate(value: number, total: number) {
    if (total <= 0) {
      return 0;
    }

    return Math.round((value / total) * 1000) / 10;
  }

  private roundHours(value: number) {
    return Math.round(value * 100) / 100;
  }

  private async getTopLateEmployees(
    startOfMonth: Date,
    endOfMonth: Date,
  ): Promise<DashboardTopLateEmployee[]> {
    const lateGroups = await this.prisma.attendance.groupBy({
      by: ['employeeId'],
      where: {
        date: {
          gte: startOfMonth,
          lt: endOfMonth,
        },
        clockInAt: {
          not: null,
        },
        minutesLate: {
          gt: 0,
        },
      },
      _count: {
        _all: true,
      },
      _sum: {
        minutesLate: true,
      },
      orderBy: {
        _sum: {
          minutesLate: 'desc',
        },
      },
      take: 5,
    });
    const employees = await this.getEmployeeSummaryMap(
      lateGroups.map((group) => group.employeeId),
    );

    return lateGroups.flatMap((group) => {
      const employee = employees.get(group.employeeId);

      if (!employee) {
        return [];
      }

      const lateCount = group._count._all;
      const totalMinutesLate = group._sum.minutesLate ?? 0;

      return {
        employeeId: group.employeeId,
        employeeIdentifier: this.resolveEmployeeIdentifierLabel(
          employee.employeeIdentifier,
          employee.employeeCode,
        ),
        employeeName: `${employee.firstName} ${employee.lastName}`,
        department: employee.department,
        lateCount,
        totalMinutesLate,
        averageMinutesLate:
          lateCount > 0 ? Math.round(totalMinutesLate / lateCount) : 0,
      };
    });
  }

  private async countMonthlyAbsences(
    scheduledEmployees: Array<{
      id: string;
      schedule: {
        isActive: boolean;
        workDays: Prisma.JsonValue;
      } | null;
    }>,
    startOfMonth: Date,
    endOfMonth: Date,
    referenceDate: Date,
  ) {
    const eligibleEmployees = scheduledEmployees.filter(
      (employee) => employee.schedule?.isActive,
    );

    if (eligibleEmployees.length === 0) {
      return 0;
    }

    const countingEnd = this.getAbsenceCountingEnd(endOfMonth, referenceDate);

    if (countingEnd <= startOfMonth) {
      return 0;
    }

    const workedAttendances = await this.prisma.attendance.findMany({
      where: {
        employeeId: {
          in: eligibleEmployees.map((employee) => employee.id),
        },
        date: {
          gte: startOfMonth,
          lt: countingEnd,
        },
        clockInAt: {
          not: null,
        },
      },
      select: {
        employeeId: true,
        date: true,
      },
    });
    const workedDateKeysByEmployee = new Map<string, Set<number>>();

    for (const attendance of workedAttendances) {
      const workedDateKeys =
        workedDateKeysByEmployee.get(attendance.employeeId) ?? new Set();

      workedDateKeys.add(normalizeAttendanceDate(attendance.date).getTime());
      workedDateKeysByEmployee.set(attendance.employeeId, workedDateKeys);
    }

    let absenceCount = 0;

    for (const employee of eligibleEmployees) {
      if (!employee.schedule) {
        continue;
      }

      const workedDateKeys =
        workedDateKeysByEmployee.get(employee.id) ?? new Set();
        const cursor = new Date(startOfMonth);

      while (cursor < countingEnd) {
        const currentDate = normalizeAttendanceDate(cursor);

        if (
          isScheduledOnDate(employee.schedule.workDays, currentDate) &&
          !workedDateKeys.has(currentDate.getTime())
        ) {
          absenceCount += 1;
        }

        cursor.setUTCDate(cursor.getUTCDate() + 1);
      }
    }

    return absenceCount;
  }

  private getAbsenceCountingEnd(monthEnd: Date, referenceDate: Date) {
    const referenceDayEnd = addAttendanceDays(
      normalizeAttendanceDate(referenceDate),
      1,
    );

    return referenceDayEnd < monthEnd ? referenceDayEnd : monthEnd;
  }

  private async getTopOvertimeEmployees(
    startOfMonth: Date,
    endOfMonth: Date,
  ): Promise<DashboardTopOvertimeEmployee[]> {
    const overtimeGroups = await this.prisma.attendance.groupBy({
      by: ['employeeId'],
      where: {
        date: {
          gte: startOfMonth,
          lt: endOfMonth,
        },
        overtimeHours: {
          gt: 0,
        },
      },
      _sum: {
        overtimeHours: true,
      },
      orderBy: {
        _sum: {
          overtimeHours: 'desc',
        },
      },
      take: 5,
    });
    const employees = await this.getEmployeeSummaryMap(
      overtimeGroups.map((group) => group.employeeId),
    );

    return overtimeGroups.flatMap((group) => {
      const employee = employees.get(group.employeeId);

      if (!employee) {
        return [];
      }

      return {
        employeeId: group.employeeId,
        employeeIdentifier: this.resolveEmployeeIdentifierLabel(
          employee.employeeIdentifier,
          employee.employeeCode,
        ),
        employeeName: `${employee.firstName} ${employee.lastName}`,
        department: employee.department,
        overtimeHours: this.roundHours(group._sum.overtimeHours ?? 0),
      };
    });
  }

  private async getTopEarlyExitEmployees(
    startOfMonth: Date,
    endOfMonth: Date,
  ): Promise<DashboardTopEarlyExitEmployee[]> {
    const earlyExitGroups = await this.prisma.attendance.groupBy({
      by: ['employeeId'],
      where: {
        date: {
          gte: startOfMonth,
          lt: endOfMonth,
        },
        earlyExit: true,
        earlyExitMinutes: {
          gt: 0,
        },
      },
      _count: {
        _all: true,
      },
      _sum: {
        earlyExitMinutes: true,
      },
      orderBy: {
        _sum: {
          earlyExitMinutes: 'desc',
        },
      },
      take: 5,
    });
    const employees = await this.getEmployeeSummaryMap(
      earlyExitGroups.map((group) => group.employeeId),
    );

    return earlyExitGroups.flatMap((group) => {
      const employee = employees.get(group.employeeId);

      if (!employee) {
        return [];
      }

      return {
        employeeId: group.employeeId,
        employeeIdentifier: this.resolveEmployeeIdentifierLabel(
          employee.employeeIdentifier,
          employee.employeeCode,
        ),
        employeeName: `${employee.firstName} ${employee.lastName}`,
        department: employee.department,
        earlyExitCount: group._count._all,
        totalEarlyExitMinutes: group._sum.earlyExitMinutes ?? 0,
      };
    });
  }

  private async getTopSuspiciousEmployees(
    startOfMonth: Date,
    endOfMonth: Date,
  ): Promise<DashboardTopSuspiciousEmployee[]> {
    const suspiciousGroups = await this.prisma.attendance.groupBy({
      by: [
        'employeeId',
        'checkInVerificationLevel',
        'checkInVerificationMethod',
      ],
      where: {
        date: {
          gte: startOfMonth,
          lt: endOfMonth,
        },
        clockInAt: {
          not: null,
        },
        checkInVerificationLevel: {
          in: [
            AttendanceVerificationLevel.WARNING,
            AttendanceVerificationLevel.STRICT,
          ],
        },
      },
      _count: {
        _all: true,
      },
      _max: {
        checkInDistanceMeters: true,
      },
    });
    const employees = await this.getEmployeeSummaryMap(
      suspiciousGroups.map((group) => group.employeeId),
    );
    const totals = new Map<
      string,
      {
        suspiciousCount: number;
        warningCount: number;
        strictCount: number;
        photoVerificationCount: number;
        maxDistanceMeters: number | null;
      }
    >();

    for (const group of suspiciousGroups) {
      const current = totals.get(group.employeeId) ?? {
        suspiciousCount: 0,
        warningCount: 0,
        strictCount: 0,
        photoVerificationCount: 0,
        maxDistanceMeters: null,
      };
      const count = group._count._all;

      current.suspiciousCount += count;

      if (
        group.checkInVerificationLevel === AttendanceVerificationLevel.WARNING
      ) {
        current.warningCount += count;
      }

      if (
        group.checkInVerificationLevel === AttendanceVerificationLevel.STRICT
      ) {
        current.strictCount += count;
      }

      if (
        group.checkInVerificationMethod === AttendanceVerificationMethod.PHOTO
      ) {
        current.photoVerificationCount += count;
      }

      if (group._max.checkInDistanceMeters !== null) {
        current.maxDistanceMeters =
          current.maxDistanceMeters === null
            ? group._max.checkInDistanceMeters
            : Math.max(
                current.maxDistanceMeters,
                group._max.checkInDistanceMeters,
              );
      }

      totals.set(group.employeeId, current);
    }

    return [...totals.entries()]
      .flatMap(([employeeId, total]) => {
        const employee = employees.get(employeeId);

        if (!employee) {
          return [];
        }

        return {
          employeeId,
          employeeIdentifier: this.resolveEmployeeIdentifierLabel(
            employee.employeeIdentifier,
            employee.employeeCode,
          ),
          employeeName: `${employee.firstName} ${employee.lastName}`,
          department: employee.department,
          legacySensitiveCount: total.suspiciousCount,
          legacyWarningCount: total.warningCount,
          legacyStrictCount: total.strictCount,
          legacyPhotoVerificationCount: total.photoVerificationCount,
          ...total,
        };
      })
      .sort(
        (first, second) =>
          second.suspiciousCount - first.suspiciousCount ||
          second.strictCount - first.strictCount ||
          (second.maxDistanceMeters ?? 0) - (first.maxDistanceMeters ?? 0),
      )
      .slice(0, 5);
  }

  private async getEmployeeSummaryMap(employeeIds: string[]) {
    const uniqueEmployeeIds = [...new Set(employeeIds)];

    if (uniqueEmployeeIds.length === 0) {
      return new Map<string, DashboardEmployeeSummary>();
    }

    const employees = await this.prisma.employee.findMany({
      where: {
        id: {
          in: uniqueEmployeeIds,
        },
      },
      select: {
        id: true,
        employeeIdentifier: true,
        employeeCode: true,
        firstName: true,
        lastName: true,
        department: true,
      },
    });

    return new Map(employees.map((employee) => [employee.id, employee]));
  }

  private mapRecentActivity(
    records: Array<{
      id: string;
      employeeId: string;
      date: Date;
      status: AttendanceStatus;
      clockInAt: Date | null;
      clockOutAt: Date | null;
      outsideScheduleWork: boolean;
      scheduledExitTime: Date | null;
      earlyExit: boolean;
      earlyExitMinutes: number;
      overtimeHours: number;
      overtimeMinutes: number;
      absenceCount: number;
      minutesLate: number;
      notes: string | null;
      checkInDistanceMeters: number | null;
      checkInVerificationMethod: AttendanceVerificationMethod;
      checkInVerificationLevel: AttendanceVerificationLevel;
      checkInVerificationReason: string | null;
      checkInVerificationPhoto: string | null;
      checkInVerificationPhotoPublicId: string | null;
      checkOutDistanceMeters: number | null;
      checkOutVerificationMethod: AttendanceVerificationMethod;
      checkOutVerificationLevel: AttendanceVerificationLevel;
      checkOutVerificationReason: string | null;
      checkOutVerificationPhoto: string | null;
      checkOutVerificationPhotoPublicId: string | null;
      employee: {
        employeeIdentifier: string | null;
        employeeCode: string | null;
        firstName: string;
        lastName: string;
        department: string | null;
      };
    }>,
  ): DashboardRecentActivity[] {
    return records.map((record) => ({
      id: record.id,
      employeeId: record.employeeId,
      employeeIdentifier: this.resolveEmployeeIdentifierLabel(
        record.employee.employeeIdentifier,
        record.employee.employeeCode,
      ),
      employeeName: `${record.employee.firstName} ${record.employee.lastName}`,
      department: record.employee.department,
      status: record.status,
      date: record.date.toISOString(),
      clockInAt: record.clockInAt?.toISOString() ?? null,
      clockOutAt: record.clockOutAt?.toISOString() ?? null,
      outsideScheduleWork: record.outsideScheduleWork,
      scheduledExitTime: record.scheduledExitTime?.toISOString() ?? null,
      earlyExit: record.earlyExit,
      earlyExitMinutes: record.earlyExitMinutes,
      overtimeHours: record.overtimeHours,
      overtimeMinutes: record.overtimeMinutes,
      absenceCount: record.absenceCount,
      minutesLate: record.minutesLate,
      notes: record.notes,
      checkInDistanceMeters: record.checkInDistanceMeters,
      checkInVerificationMethod: record.checkInVerificationMethod,
      checkInVerificationLevel: record.checkInVerificationLevel,
      checkInVerificationReason: record.checkInVerificationReason,
      checkInVerificationPhoto: record.checkInVerificationPhoto,
      checkInVerificationPhotoPublicId: record.checkInVerificationPhotoPublicId,
      checkOutDistanceMeters: record.checkOutDistanceMeters,
      checkOutVerificationMethod: record.checkOutVerificationMethod,
      checkOutVerificationLevel: record.checkOutVerificationLevel,
      checkOutVerificationReason: record.checkOutVerificationReason,
      checkOutVerificationPhoto: record.checkOutVerificationPhoto,
      checkOutVerificationPhotoPublicId:
        record.checkOutVerificationPhotoPublicId,
    }));
  }

  private resolveEmployeeIdentifierLabel(
    employeeIdentifier: string | null,
    employeeCode: string | null,
  ) {
    return employeeIdentifier?.trim() || employeeCode?.trim() || 'ID non defini';
  }
}
