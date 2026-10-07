import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import {
  AttendanceStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  attendanceOperationalWhere,
  employeeOperationalWhere,
  operationalScopeCreateData,
} from '../../common/prisma/operational-scope';
import {
  addAttendanceDays,
  getAttendanceMonthRange,
  getBusinessDate,
  getLocalDateParts,
  isScheduledOnDate,
  localScheduleTimeToUtc,
  normalizeAttendanceDate,
} from '../../common/utils/attendance-date.util';
import {
  getAttendanceCheckOutOutcome,
  getOutsideScheduleAttendanceOutcome,
} from '../../common/utils/attendance-checkout.util';
import { scheduleSelect } from '../../common/prisma/selects';
import {
  buildAttendanceScheduleSnapshot,
  hasAttendanceScheduleSnapshot,
  isScheduledOnResolvedAttendanceDate,
  resolveAttendanceSchedule,
} from '../../common/utils/attendance-schedule-snapshot.util';
import { CalendarService } from '../calendar/calendar.service';
import { EffectiveScheduleResolver } from '../schedules/effective-schedule.resolver';

const monthlyMetricsScheduleSelect = {
  ...scheduleSelect,
  organizationId: true,
  v1ScopeStatus: true,
} satisfies Prisma.ScheduleSelect;

type EmployeeForMonthlyMetrics = {
  id: string;
  organizationId: string | null;
  organization: { timezone: string } | null;
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
  private readonly logger = new Logger(AttendanceMonthlyMetricsService.name);
  private timer?: NodeJS.Timeout;
  private scheduledRecalculation?: Promise<void>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly calendarService: CalendarService,
    private readonly effectiveSchedules: EffectiveScheduleResolver,
  ) {}

  onModuleInit() {
    this.startScheduledRecalculation(new Date());
    this.timer = setInterval(
      () => {
        this.startScheduledRecalculation(new Date());
      },
      24 * 60 * 60 * 1000,
    );

    this.timer.unref?.();
  }

  async onModuleDestroy() {
    if (this.timer) {
      clearInterval(this.timer);
    }

    await this.scheduledRecalculation;
  }

  private startScheduledRecalculation(referenceDate: Date) {
    if (this.scheduledRecalculation) return;

    const task = this.runIfMonthClosed(referenceDate)
      .catch((error: unknown) => {
        this.logger.error(
          'Scheduled attendance monthly metrics recalculation failed.',
          error instanceof Error ? error.stack : String(error),
        );
      })
      .finally(() => {
        if (this.scheduledRecalculation === task) {
          this.scheduledRecalculation = undefined;
        }
      });
    this.scheduledRecalculation = task;
  }

  async recalculateMonth(year: number, month: number, employeeId?: string) {
    const range = this.getMonthRange(year, month);
    if (employeeId) {
      const employee = await this.prisma.employee.findFirst({
        where: {
          id: employeeId,
          isActive: true,
          OR: [
            { ...employeeOperationalWhere() },
            {
              v1ScopeStatus: 'OPERATIONAL',
              organization: { is: { status: 'ACTIVE' } },
            },
          ],
        },
        select: this.employeeForMonthlyMetricsSelect,
      });

      if (employee) {
        await this.recalculateEmployeeMonth(employee, range);
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
          ...employeeOperationalWhere(organization.id),
          isActive: true,
        },
        select: this.employeeForMonthlyMetricsSelect,
      });

      for (const employee of employees) {
        await this.recalculateEmployeeMonth(employee, range);
      }
    }

    const legacyEmployees = await this.prisma.employee.findMany({
      where: { ...employeeOperationalWhere(), isActive: true },
      select: this.employeeForMonthlyMetricsSelect,
    });

    for (const employee of legacyEmployees) {
      await this.recalculateEmployeeMonth(employee, range);
    }
  }

  private async runIfMonthClosed(referenceDate: Date) {
    const organizations = await this.prisma.organization.findMany({
      where: { status: 'ACTIVE' },
      select: { id: true, timezone: true },
    });

    for (const organization of organizations) {
      const localDate = getLocalDateParts(referenceDate, organization.timezone);
      if (localDate.day !== 1) continue;

      const previousMonth = addAttendanceDays(
        getAttendanceMonthRange(localDate.year, localDate.month).startOfMonth,
        -1,
      );
      const range = this.getMonthRange(
        previousMonth.getUTCFullYear(),
        previousMonth.getUTCMonth() + 1,
      );
      const employees = await this.prisma.employee.findMany({
        where: { ...employeeOperationalWhere(organization.id), isActive: true },
        select: this.employeeForMonthlyMetricsSelect,
      });

      for (const employee of employees) {
        await this.recalculateEmployeeMonth(employee, range);
      }
    }

    if (referenceDate.getUTCDate() === 1) {
      const previousMonth = addAttendanceDays(
        getAttendanceMonthRange(
          referenceDate.getUTCFullYear(),
          referenceDate.getUTCMonth() + 1,
        ).startOfMonth,
        -1,
      );
      const range = this.getMonthRange(
        previousMonth.getUTCFullYear(),
        previousMonth.getUTCMonth() + 1,
      );
      const legacyEmployees = await this.prisma.employee.findMany({
        where: { ...employeeOperationalWhere(), isActive: true },
        select: this.employeeForMonthlyMetricsSelect,
      });

      for (const employee of legacyEmployees) {
        await this.recalculateEmployeeMonth(employee, range);
      }
    }
  }

  private async recalculateEmployeeMonth(
    employee: EmployeeForMonthlyMetrics,
    range: MonthRange,
  ) {
    const timezone = employee.organization?.timezone ?? 'UTC';
    range = {
      ...range,
      endOfMonth: this.getEffectiveEndOfMonth(
        range,
        getBusinessDate(new Date(), timezone),
      ),
    };
    await this.createMissingAbsenceRecords(employee, range);

    const [attendances, nonWorkingDateKeys] = await Promise.all([
      this.prisma.attendance.findMany({
        where: {
          employeeId: employee.id,
          ...attendanceOperationalWhere(employee.organizationId ?? undefined),
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
          calendarNonWorkingDaySnapshot: true,
          scheduledExitTime: true,
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
        !(attendance.calendarNonWorkingDaySnapshot ?? nonWorkingDateKeys.has(
          normalizeAttendanceDate(attendance.date).getTime(),
        )),
    ).length;

    for (const attendance of attendances) {
      const effectiveSchedule = hasAttendanceScheduleSnapshot(attendance)
        ? null
        : await this.resolveEffectiveSchedule(employee, attendance.date);
      // Unsnapshotted records without deterministic assignment history must
      // remain untouched rather than being recalculated from a mutable
      // Employee.scheduleId projection.
      if (!hasAttendanceScheduleSnapshot(attendance) && !effectiveSchedule) {
        continue;
      }
      const resolvedSchedule = resolveAttendanceSchedule(
        attendance,
        effectiveSchedule?.schedule ?? null,
      );
      const isNonWorkingDay = attendance.calendarNonWorkingDaySnapshot ??
        nonWorkingDateKeys.has(normalizeAttendanceDate(attendance.date).getTime());
      const isOutsideScheduleWork =
        Boolean(attendance.clockInAt) &&
        (isNonWorkingDay ||
          !isScheduledOnResolvedAttendanceDate(
            resolvedSchedule,
            attendance.date,
          ));
      const scheduledExitTime = isOutsideScheduleWork
        ? null
        : (attendance.scheduledExitTime ??
          this.getScheduledExitTime(
            resolvedSchedule,
            attendance.date,
            timezone,
          ));
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
          ...attendanceOperationalWhere(employee.organizationId ?? undefined),
        },
        data: {
          outsideScheduleWork: isOutsideScheduleWork,
          calendarNonWorkingDaySnapshot:
            attendance.calendarNonWorkingDaySnapshot ?? isNonWorkingDay,
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
    const existingAttendances = await this.prisma.attendance.findMany({
      where: {
        employeeId: employee.id,
        ...attendanceOperationalWhere(employee.organizationId ?? undefined),
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

      const effectiveSchedule = await this.resolveEffectiveSchedule(
        employee,
        date,
      );
      if (
        effectiveSchedule?.schedule.isActive &&
        isScheduledOnDate(effectiveSchedule.schedule.workDays, date) &&
        !nonWorkingDateKeys.has(date.getTime()) &&
        !existingDateKeys.has(date.getTime())
      ) {
        await this.prisma.attendance.create({
          data: {
            employeeId: employee.id,
            organizationId: employee.organizationId,
            attendanceSiteId: effectiveSchedule.siteAssignment?.siteId ?? null,
            employeeSiteAssignmentId: effectiveSchedule.siteAssignment?.id ?? null,
            ...operationalScopeCreateData(employee.organizationId ?? undefined),
            date,
            calendarNonWorkingDaySnapshot: false,
            status: AttendanceStatus.ABSENT,
            scheduledExitTime: this.getScheduledExitTime(
              resolveAttendanceSchedule({}, effectiveSchedule.schedule),
              date,
              employee.organization?.timezone ?? 'UTC',
            ),
            ...buildAttendanceScheduleSnapshot(effectiveSchedule.schedule, date),
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
      ? this.calendarService.getNonWorkingDateKeysForEmployeeInOrganization(
          range.startOfMonth,
          range.endOfMonth,
          employee.id,
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
    organization: { select: { timezone: true } },
    schedule: {
      select: monthlyMetricsScheduleSelect,
    },
  } satisfies Prisma.EmployeeSelect;

  /**
   * Tenant calculations resolve site and schedule history together. The
   * legacy projection is retained only for pre-SaaS records.
   */
  private async resolveEffectiveSchedule(
    employee: EmployeeForMonthlyMetrics,
    businessDate: Date,
  ) {
    if (!employee.organizationId) {
      return employee.schedule?.isActive
        ? { schedule: employee.schedule, siteAssignment: null }
        : null;
    }

    return this.effectiveSchedules.resolveOptional(
      employee.id,
      employee.organizationId,
      businessDate,
    );
  }

  private getScheduledExitTime(
    schedule: ReturnType<typeof resolveAttendanceSchedule>,
    businessDate: Date,
    timezone: string,
  ) {
    if (
      !schedule.startTime ||
      !schedule.endTime ||
      !isScheduledOnResolvedAttendanceDate(schedule, businessDate)
    ) {
      return null;
    }
    const exitDate =
      schedule.endTime <= schedule.startTime
        ? addAttendanceDays(businessDate, 1)
        : businessDate;
    return localScheduleTimeToUtc(exitDate, schedule.endTime, timezone);
  }

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
