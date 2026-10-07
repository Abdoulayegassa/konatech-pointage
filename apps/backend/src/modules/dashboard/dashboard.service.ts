import { BadRequestException, Injectable, Optional } from '@nestjs/common';
import { AttendanceStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  attendanceOperationalWhere,
  employeeOperationalWhere,
} from '../../common/prisma/operational-scope';
import {
  addAttendanceDays,
  getBusinessDate,
  getAttendanceMonthRangeFromDate,
  isScheduledOnDate,
  normalizeAttendanceDate,
} from '../../common/utils/attendance-date.util';
import {
  DashboardOverview,
  DashboardRecentActivity,
  DashboardTopEarlyExitEmployee,
  DashboardTopLateEmployee,
  DashboardTopOvertimeEmployee,
} from './dashboard.types';
import { CalendarService } from '../calendar/calendar.service';
import { AuthenticationContext } from '../auth/interfaces/authentication-context.interface';
import { OrganizationTimezoneService } from '../../common/time/organization-timezone.service';
import { EffectiveScheduleResolver } from '../schedules/effective-schedule.resolver';

type DashboardEmployeeSummary = {
  id: string;
  firstName: string;
  lastName: string;
  department: string | null;
};

@Injectable()
/**
 * SOURCE OF TRUTH
 * Dashboard metrics aggregation.
 *
 * This service aggregates attendance and calendar data for admin
 * dashboards. It must not redefine attendance, sanctions, or calendar rules.
 */
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly calendarService: CalendarService,
    @Optional()
    private readonly effectiveSchedules?: EffectiveScheduleResolver,
    @Optional()
    private readonly organizationTimezones?: OrganizationTimezoneService,
  ) {}

  async getOverview(
    referenceDate: Date = new Date(),
    authentication?: AuthenticationContext,
  ): Promise<DashboardOverview> {
    const organizationId = this.tenantId(authentication);
    const timezone = (await this.resolveTimezone(authentication)) ?? 'UTC';
    const businessDate = getBusinessDate(referenceDate, timezone);
    const { startOfDay, endOfDay } = this.getDayRange(businessDate);
    const { startOfMonth, endOfMonth } = this.getMonthRange(businessDate);

    const [
      totalEmployees,
      scheduledEmployees,
      presentToday,
      lateEmployeesToday,
      earlyExitToday,
      overtimeTodayAggregate,
      recentAttendanceRecords,
    ] = await Promise.all([
      this.prisma.employee.count({
        where: {
          ...this.employeeTenantWhere(organizationId),
          isActive: true,
        },
      }),
      this.prisma.employee.findMany({
        where: {
          ...this.employeeTenantWhere(organizationId),
          isActive: true,
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
          ...this.attendanceTenantWhere(organizationId),
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
          ...this.attendanceTenantWhere(organizationId),
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
          ...this.attendanceTenantWhere(organizationId),
          date: {
            gte: startOfDay,
            lt: endOfDay,
          },
          earlyExit: true,
        },
      }),
      this.prisma.attendance.aggregate({
        where: {
          ...this.attendanceTenantWhere(organizationId),
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
      this.prisma.attendance.findMany({
        where: this.attendanceTenantWhere(organizationId),
        take: 5,
        orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
        select: {
          date: true,
          status: true,
          clockInAt: true,
          clockOutAt: true,
          earlyExit: true,
          earlyExitMinutes: true,
          overtimeHours: true,
          overtimeMinutes: true,
          absenceCount: true,
          minutesLate: true,
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

    const scheduledEmployeeIds = (
      await Promise.all(
        scheduledEmployees.map(async (employee) => ({
          id: employee.id,
          schedule: await this.resolveEffectiveSchedule(
            employee.id,
            organizationId,
            businessDate,
            employee.schedule,
          ),
          isNonWorkingDay: (await this.calendarService.getNonWorkingDateKeysForEmployee(
            businessDate,
            addAttendanceDays(businessDate, 1),
            employee.id,
            authentication,
          )).has(businessDate.getTime()),
        })),
      )
    )
      .filter(
        ({ schedule, isNonWorkingDay }) =>
          !isNonWorkingDay &&
          schedule?.isActive &&
          isScheduledOnDate(schedule.workDays, businessDate),
      )
      .map(({ id }) => id);

    const [
      todayScheduledAttendances,
      topLateEmployees,
      topOvertimeEmployees,
      topEarlyExitEmployees,
      monthlyOvertimeAggregate,
      earlyExitCount,
      absenceCountThisMonth,
    ] = await Promise.all([
      scheduledEmployeeIds.length === 0
        ? []
        : this.prisma.attendance.findMany({
            where: {
              ...this.attendanceTenantWhere(organizationId),
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
      this.getTopLateEmployees(startOfMonth, endOfMonth, organizationId),
      this.getTopOvertimeEmployees(startOfMonth, endOfMonth, organizationId),
      this.getTopEarlyExitEmployees(startOfMonth, endOfMonth, organizationId),
      this.prisma.attendance.aggregate({
        where: {
          ...this.attendanceTenantWhere(organizationId),
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
      this.prisma.attendance.count({
        where: {
          ...this.attendanceTenantWhere(organizationId),
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
        businessDate,
        authentication,
        organizationId,
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
        scheduledPresentToday,
        lateEmployeesToday,
        absentEmployeesToday,
        earlyExitToday,
        overtimeHoursToday: this.roundHours(
          overtimeTodayAggregate._sum.overtimeHours ?? 0,
        ),
      },
      analytics: {
        earlyExitCount,
        absenceCountThisMonth,
        overtimeHoursThisMonth: this.roundHours(
          monthlyOvertimeAggregate._sum.overtimeHours ?? 0,
        ),
        topLateEmployees,
        topOvertimeEmployees,
        topEarlyExitEmployees,
      },
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

  private roundHours(value: number) {
    return Math.round(value * 100) / 100;
  }

  private async getTopLateEmployees(
    startOfMonth: Date,
    endOfMonth: Date,
    organizationId?: string,
  ): Promise<DashboardTopLateEmployee[]> {
    const lateGroups = await this.prisma.attendance.groupBy({
      by: ['employeeId'],
      where: {
        ...this.attendanceTenantWhere(organizationId),
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
      organizationId,
    );

    return lateGroups.flatMap((group) => {
      const employee = employees.get(group.employeeId);

      if (!employee) {
        return [];
      }

      const lateCount = group._count._all;
      const totalMinutesLate = group._sum.minutesLate ?? 0;

      return {
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
    authentication?: AuthenticationContext,
    organizationId?: string,
  ) {
    if (scheduledEmployees.length === 0) {
      return 0;
    }

    const countingEnd = this.getAbsenceCountingEnd(endOfMonth, referenceDate);

    if (countingEnd <= startOfMonth) {
      return 0;
    }

    const workedAttendances = await this.prisma.attendance.findMany({
      where: {
        ...this.attendanceTenantWhere(organizationId),
        employeeId: {
          in: scheduledEmployees.map((employee) => employee.id),
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

    for (const employee of scheduledEmployees) {
      const nonWorkingDateKeys = await this.calendarService.getNonWorkingDateKeysForEmployee(
        startOfMonth, countingEnd, employee.id, authentication,
      );
      const workedDateKeys =
        workedDateKeysByEmployee.get(employee.id) ?? new Set();
      const cursor = new Date(startOfMonth);

      while (cursor < countingEnd) {
        const currentDate = normalizeAttendanceDate(cursor);
        const schedule = await this.resolveEffectiveSchedule(
          employee.id,
          organizationId,
          currentDate,
          employee.schedule,
        );

        if (
          schedule?.isActive &&
          isScheduledOnDate(schedule.workDays, currentDate) &&
          !nonWorkingDateKeys.has(currentDate.getTime()) &&
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
    organizationId?: string,
  ): Promise<DashboardTopOvertimeEmployee[]> {
    const overtimeGroups = await this.prisma.attendance.groupBy({
      by: ['employeeId'],
      where: {
        ...this.attendanceTenantWhere(organizationId),
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
      organizationId,
    );

    return overtimeGroups.flatMap((group) => {
      const employee = employees.get(group.employeeId);

      if (!employee) {
        return [];
      }

      return {
        employeeName: `${employee.firstName} ${employee.lastName}`,
        department: employee.department,
        overtimeHours: this.roundHours(group._sum.overtimeHours ?? 0),
      };
    });
  }

  private async getTopEarlyExitEmployees(
    startOfMonth: Date,
    endOfMonth: Date,
    organizationId?: string,
  ): Promise<DashboardTopEarlyExitEmployee[]> {
    const earlyExitGroups = await this.prisma.attendance.groupBy({
      by: ['employeeId'],
      where: {
        ...this.attendanceTenantWhere(organizationId),
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
      organizationId,
    );

    return earlyExitGroups.flatMap((group) => {
      const employee = employees.get(group.employeeId);

      if (!employee) {
        return [];
      }

      return {
        employeeName: `${employee.firstName} ${employee.lastName}`,
        department: employee.department,
        earlyExitCount: group._count._all,
        totalEarlyExitMinutes: group._sum.earlyExitMinutes ?? 0,
      };
    });
  }

  private async getEmployeeSummaryMap(
    employeeIds: string[],
    organizationId?: string,
  ) {
    const uniqueEmployeeIds = [...new Set(employeeIds)];

    if (uniqueEmployeeIds.length === 0) {
      return new Map<string, DashboardEmployeeSummary>();
    }

    const employees = await this.prisma.employee.findMany({
      where: {
        ...this.employeeTenantWhere(organizationId),
        id: {
          in: uniqueEmployeeIds,
        },
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        department: true,
      },
    });

    return new Map(employees.map((employee) => [employee.id, employee]));
  }

  private tenantId(authentication?: AuthenticationContext) {
    if (!authentication || authentication.generation === 'legacy') {
      return undefined;
    }

    if (!authentication.organizationId) {
      throw new BadRequestException(
        'A valid organization context is required.',
      );
    }

    return authentication.organizationId;
  }

  private resolveTimezone(authentication?: AuthenticationContext) {
    return (
      this.organizationTimezones ?? new OrganizationTimezoneService(this.prisma)
    ).resolve(authentication);
  }

  private employeeTenantWhere(
    organizationId?: string,
  ): Prisma.EmployeeWhereInput {
    return employeeOperationalWhere(organizationId);
  }

  private attendanceTenantWhere(
    organizationId?: string,
  ): Prisma.AttendanceWhereInput {
    return attendanceOperationalWhere(organizationId);
  }

  private async resolveEffectiveSchedule(
    employeeId: string,
    organizationId: string | undefined,
    businessDate: Date,
    legacySchedule: {
      isActive: boolean;
      workDays: Prisma.JsonValue;
    } | null,
  ) {
    if (!organizationId) return legacySchedule;
    const resolver = this.effectiveSchedules;
    if (!resolver) return null;
    return (
      await resolver.resolveOptional(
        employeeId,
        organizationId,
        businessDate,
      )
    )?.schedule ?? null;
  }

  private mapRecentActivity(
    records: Array<{
      date: Date;
      status: AttendanceStatus;
      clockInAt: Date | null;
      clockOutAt: Date | null;
      earlyExit: boolean;
      earlyExitMinutes: number;
      overtimeHours: number;
      overtimeMinutes: number;
      absenceCount: number;
      minutesLate: number;
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
      earlyExit: record.earlyExit,
      earlyExitMinutes: record.earlyExitMinutes,
      overtimeHours: record.overtimeHours,
      overtimeMinutes: record.overtimeMinutes,
      absenceCount: record.absenceCount,
      minutesLate: record.minutesLate,
    }));
  }

  private resolveEmployeeIdentifierLabel(
    employeeIdentifier: string | null,
    employeeCode: string | null,
  ) {
    return (
      employeeIdentifier?.trim() || employeeCode?.trim() || 'ID non defini'
    );
  }
}
