import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { AttendanceStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  addAttendanceDays,
  getAttendanceMonthRange,
  isScheduledOnDate,
  normalizeAttendanceDate,
} from '../../common/utils/attendance-date.util';
import {
  getAttendanceCheckOutOutcome,
  getOutsideScheduleAttendanceOutcome,
} from '../../common/utils/attendance-checkout.util';
import { scheduleSelect } from '../../common/prisma/selects';
import {
  buildAttendanceScheduleSnapshot,
  getResolvedAttendanceScheduledExitTime,
  isScheduledOnResolvedAttendanceDate,
  resolveAttendanceSchedule,
} from '../../common/utils/attendance-schedule-snapshot.util';
import { CalendarService } from '../calendar/calendar.service';

const monthlyMetricsScheduleSelect = {
  ...scheduleSelect,
  organizationId: true,
} satisfies Prisma.ScheduleSelect;

type EmployeeForMonthlyMetrics = {
  id: string;
  organizationId: string | null;
  schedule: Prisma.ScheduleGetPayload<{
    select: typeof monthlyMetricsScheduleSelect;
  }> | null;
};

type MonthRange = {
  startOfMonth: Date;
  endOfMonth: Date;
};

@Injectable()
export class AttendanceMonthlyMetricsService
  implements OnModuleInit, OnModuleDestroy
{
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly prisma: PrismaService,
    private readonly calendarService: CalendarService,
  ) {}

  onModuleInit() {
    this.timer = setInterval(
      () => {
        void this.runIfMonthClosed(new Date());
      },
      24 * 60 * 60 * 1000,
    );

    this.timer.unref?.();
  }

  onModuleDestroy() {
    if (this.timer) {
      clearInterval(this.timer);
    }
  }

  async recalculateMonth(year: number, month: number, employeeId?: string) {
    const range = this.getMonthRange(year, month);
    const effectiveRange = {
      startOfMonth: range.startOfMonth,
      endOfMonth: this.getEffectiveEndOfMonth(range, new Date()),
    };
    if (employeeId) {
      const employee = await this.prisma.employee.findFirst({
        where: {
          id: employeeId,
          isActive: true,
          OR: [
            { organizationId: null },
            { organization: { is: { status: 'ACTIVE' } } },
          ],
        },
        select: this.employeeForMonthlyMetricsSelect,
      });

      if (employee) {
        await this.recalculateEmployeeMonth(employee, effectiveRange);
      }

      return;
    }

    const activeOrganizations = await this.prisma.organization.findMany({
      where: { status: 'ACTIVE' },
      select: { id: true },
    });

    for (const organization of activeOrganizations) {
      const employees = await this.prisma.employee.findMany({
        where: {
          organizationId: organization.id,
          isActive: true,
        },
        select: this.employeeForMonthlyMetricsSelect,
      });

      for (const employee of employees) {
        await this.recalculateEmployeeMonth(employee, effectiveRange);
      }
    }

    const legacyEmployees = await this.prisma.employee.findMany({
      where: { organizationId: null, isActive: true },
      select: this.employeeForMonthlyMetricsSelect,
    });

    for (const employee of legacyEmployees) {
      await this.recalculateEmployeeMonth(employee, effectiveRange);
    }
  }

  private async runIfMonthClosed(referenceDate: Date) {
    if (referenceDate.getUTCDate() !== 1) {
      return;
    }

    const previousMonth = addAttendanceDays(
      getAttendanceMonthRange(
        referenceDate.getUTCFullYear(),
        referenceDate.getUTCMonth() + 1,
      ).startOfMonth,
      -1,
    );

    await this.recalculateMonth(
      previousMonth.getUTCFullYear(),
      previousMonth.getUTCMonth() + 1,
    );
  }

  private async recalculateEmployeeMonth(
    employee: EmployeeForMonthlyMetrics,
    range: MonthRange,
  ) {
    if (
      employee.organizationId &&
      employee.schedule?.organizationId !== employee.organizationId
    ) {
      return;
    }

    if (!employee.schedule?.isActive) {
      return;
    }

    await this.createMissingAbsenceRecords(employee, range);

    const [attendances, nonWorkingDateKeys] = await Promise.all([
      this.prisma.attendance.findMany({
        where: {
          employeeId: employee.id,
          ...(employee.organizationId
            ? { organizationId: employee.organizationId }
            : {}),
          date: {
            gte: range.startOfMonth,
            lt: range.endOfMonth,
          },
        },
        select: {
          id: true,
          date: true,
          clockInAt: true,
          clockOutAt: true,
          minutesLate: true,
          scheduleIdSnapshot: true,
          scheduleNameSnapshot: true,
          scheduleStartTimeSnapshot: true,
          scheduleEndTimeSnapshot: true,
          scheduleWorkDaysSnapshot: true,
          scheduleLatenessMarginSnapshot: true,
          scheduleCapturedAt: true,
        },
      }),
      this.getNonWorkingDateKeys(employee, range),
    ]);
    const absenceCount = attendances.filter(
      (attendance) =>
        !attendance.clockInAt &&
        !nonWorkingDateKeys.has(
          normalizeAttendanceDate(attendance.date).getTime(),
        ),
    ).length;

    for (const attendance of attendances) {
      const resolvedSchedule = resolveAttendanceSchedule(
        attendance,
        employee.schedule,
      );
      const isNonWorkingDay = nonWorkingDateKeys.has(
        normalizeAttendanceDate(attendance.date).getTime(),
      );
      const isOutsideScheduleWork =
        Boolean(attendance.clockInAt) &&
        (isNonWorkingDay ||
          !isScheduledOnResolvedAttendanceDate(
            resolvedSchedule,
            attendance.date,
          ));
      const scheduledExitTime = isOutsideScheduleWork
        ? null
        : getResolvedAttendanceScheduledExitTime(
            resolvedSchedule,
            attendance.date,
          );
      const exitOutcome = isOutsideScheduleWork
        ? getOutsideScheduleAttendanceOutcome(
            attendance.clockInAt,
            attendance.clockOutAt,
          )
        : getAttendanceCheckOutOutcome(
            scheduledExitTime,
            attendance.clockOutAt,
          );

      await this.prisma.attendance.updateMany({
        where: {
          id: attendance.id,
          organizationId: employee.organizationId,
        },
        data: {
          outsideScheduleWork: isOutsideScheduleWork,
          scheduledExitTime,
          earlyExit: exitOutcome.earlyExit,
          earlyExitMinutes: exitOutcome.earlyExitMinutes,
          lateExit: exitOutcome.lateExit,
          overtimeHours: exitOutcome.overtimeHours,
          overtimeMinutes: exitOutcome.overtimeMinutes,
          minutesLate: isNonWorkingDay ? 0 : attendance.minutesLate,
          absenceCount,
          status: attendance.clockInAt
            ? isNonWorkingDay
              ? AttendanceStatus.NON_WORKING_DAY_WORK
              : isOutsideScheduleWork && attendance.clockOutAt
                ? AttendanceStatus.PRESENT
                : undefined
            : isNonWorkingDay
              ? undefined
              : AttendanceStatus.ABSENT,
        },
      });
    }
  }

  private async createMissingAbsenceRecords(
    employee: EmployeeForMonthlyMetrics,
    range: MonthRange,
  ) {
    if (!employee.schedule?.isActive) {
      return;
    }

    const existingAttendances = await this.prisma.attendance.findMany({
      where: {
        employeeId: employee.id,
        ...(employee.organizationId
          ? { organizationId: employee.organizationId }
          : {}),
        date: {
          gte: range.startOfMonth,
          lt: range.endOfMonth,
        },
      },
      select: {
        date: true,
      },
    });
    const existingDateKeys = new Set(
      existingAttendances.map((attendance) =>
        normalizeAttendanceDate(attendance.date).getTime(),
      ),
    );
    const cursor = new Date(range.startOfMonth);
    const nonWorkingDateKeys = await this.getNonWorkingDateKeys(
      employee,
      range,
    );

    while (cursor < range.endOfMonth) {
      const date = normalizeAttendanceDate(cursor);

      if (
        isScheduledOnDate(employee.schedule.workDays, date) &&
        !nonWorkingDateKeys.has(date.getTime()) &&
        !existingDateKeys.has(date.getTime())
      ) {
        await this.prisma.attendance.create({
          data: {
            employeeId: employee.id,
            organizationId: employee.organizationId,
            date,
            status: AttendanceStatus.ABSENT,
            scheduledExitTime: getResolvedAttendanceScheduledExitTime(
              resolveAttendanceSchedule({}, employee.schedule),
              date,
            ),
            ...buildAttendanceScheduleSnapshot(employee.schedule, date),
          },
        });
        existingDateKeys.add(date.getTime());
      }

      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
  }

  private getMonthRange(year: number, month: number): MonthRange {
    return getAttendanceMonthRange(year, month);
  }

  private getNonWorkingDateKeys(
    employee: EmployeeForMonthlyMetrics,
    range: MonthRange,
  ) {
    return employee.organizationId
      ? this.calendarService.getNonWorkingDateKeysForOrganization(
          range.startOfMonth,
          range.endOfMonth,
          employee.organizationId,
        )
      : this.calendarService.getNonWorkingDateKeys(
          range.startOfMonth,
          range.endOfMonth,
        );
  }

  private readonly employeeForMonthlyMetricsSelect = {
    id: true,
    organizationId: true,
    schedule: {
      select: monthlyMetricsScheduleSelect,
    },
  } satisfies Prisma.EmployeeSelect;

  private getEffectiveEndOfMonth(range: MonthRange, referenceDate: Date) {
    if (referenceDate < range.startOfMonth) {
      return range.startOfMonth;
    }

    if (referenceDate >= range.endOfMonth) {
      return range.endOfMonth;
    }

    const nextDay = addAttendanceDays(
      normalizeAttendanceDate(referenceDate),
      1,
    );

    return nextDay < range.endOfMonth ? nextDay : range.endOfMonth;
  }
}
