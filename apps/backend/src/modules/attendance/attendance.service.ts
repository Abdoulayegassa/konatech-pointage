import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AttendanceStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  attendanceWithEmployeeSelect,
  employeeWithScheduleSelect,
  scheduleSelect,
} from '../../common/prisma/selects';
import {
  addAttendanceDays,
  formatAttendanceMonth,
  getAttendanceMonthRange,
  getAttendanceMonthRangeFromDate,
  isScheduledOnDate,
  normalizeAttendanceDate,
  setTimeOnDate,
} from '../../common/utils/attendance-date.util';
import {
  getAttendanceCheckOutOutcome,
  getOutsideScheduleAttendanceOutcome,
} from '../../common/utils/attendance-checkout.util';
import { AttendanceSecurityService } from './attendance-security.service';
import {
  buildAttendanceScheduleSnapshot,
  getResolvedAttendanceScheduledExitTime,
  isScheduledOnResolvedAttendanceDate,
  resolveAttendanceSchedule,
} from '../../common/utils/attendance-schedule-snapshot.util';
import { CheckInDto } from './dto/check-in.dto';
import { CheckInSecurityProofDto } from './dto/check-in-security.dto';
import { CheckOutDto } from './dto/check-out.dto';
import { CalendarService } from '../calendar/calendar.service';
import { AuthenticationContext } from '../auth/interfaces/authentication-context.interface';

@Injectable()
/**
 * SOURCE OF TRUTH
 * Attendance engine.
 *
 * Check-in, check-out, lateness, early departure, overtime, non-working-day
 * work status, and attendance history rules live here. Do not duplicate these
 * rules in frontend components or report renderers.
 */
export class AttendanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly attendanceSecurityService: AttendanceSecurityService,
    private readonly calendarService: CalendarService,
  ) {}

  async getTodaySummary(
    referenceDate: Date = new Date(),
    authentication?: AuthenticationContext,
  ) {
    const organizationId = this.tenantId(authentication);
    const today = normalizeAttendanceDate(referenceDate);

    const [attendances, scheduledEmployees, isNonWorkingDay] =
      await Promise.all([
        this.prisma.attendance.findMany({
          where: {
            date: today,
            ...(organizationId ? { organizationId } : {}),
          },
          select: {
            employeeId: true,
            clockInAt: true,
            clockOutAt: true,
            minutesLate: true,
            status: true,
          },
        }),
        this.prisma.employee.findMany({
          where: {
            isActive: true,
            ...this.employeeScheduleTenantWhere(organizationId),
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
        this.calendarService.isNonWorkingDay(today, authentication),
      ]);

    const attendanceByEmployeeId = new Map(
      attendances.map((attendance) => [attendance.employeeId, attendance]),
    );

    const expectedEmployees = scheduledEmployees.filter(
      (employee) =>
        !isNonWorkingDay &&
        employee.schedule &&
        employee.schedule.isActive &&
        isScheduledOnDate(employee.schedule.workDays, referenceDate),
    );

    const checkedIn = attendances.filter(
      (attendance) => attendance.clockInAt !== null,
    ).length;
    const checkedOut = attendances.filter(
      (attendance) => attendance.clockOutAt !== null,
    ).length;
    const late = attendances.filter(
      (attendance) => attendance.minutesLate > 0,
    ).length;
    const absences = expectedEmployees.filter((employee) => {
      const attendance = attendanceByEmployeeId.get(employee.id);

      if (!attendance) {
        return true;
      }

      if (attendance.status === AttendanceStatus.ABSENT) {
        return true;
      }

      return attendance.clockInAt === null;
    }).length;

    return {
      asOf: new Date().toISOString(),
      date: today.toISOString(),
      expected: expectedEmployees.length,
      checkedIn,
      checkedOut,
      late,
      absences,
    };
  }

  async getMonthlyHistory(
    month?: string,
    authentication?: AuthenticationContext,
  ) {
    return this.getAttendanceHistory(month, undefined, authentication);
  }

  async getEmployeeMonthlyHistory(
    employeeId: string,
    month?: string,
    authentication?: AuthenticationContext,
  ) {
    return this.getAttendanceHistory(month, employeeId, authentication);
  }

  async getEmployeeTodayAttendance(
    employeeId: string,
    referenceDate: Date = new Date(),
    authentication?: AuthenticationContext,
  ) {
    const organizationId = this.tenantId(authentication);
    const today = normalizeAttendanceDate(referenceDate);
    const employee = await this.prisma.employee.findFirst({
      where: {
        id: employeeId,
        ...this.employeeScheduleTenantWhere(organizationId),
      },
      select: employeeWithScheduleSelect,
    });

    if (!employee) {
      throw new NotFoundException('Employee not found.');
    }

    const attendance = await this.prisma.attendance.findFirst({
      where: {
        employeeId,
        date: today,
        ...(organizationId ? { organizationId } : {}),
      },
      select: attendanceWithEmployeeSelect,
    });
    const monthlyAbsenceCount = await this.getMonthlyAbsenceCount(
      employee.id,
      employee.schedule,
      referenceDate,
      attendance?.clockInAt ? today : undefined,
      organizationId,
      authentication,
    );

    const expectedToday = employee.schedule
      ? employee.schedule.isActive &&
        !(await this.calendarService.isNonWorkingDay(today, authentication)) &&
        isScheduledOnDate(employee.schedule.workDays, referenceDate)
      : false;

    return {
      date: today.toISOString(),
      expectedToday,
      canCheckIn: !attendance?.clockInAt,
      canCheckOut: Boolean(attendance?.clockInAt && !attendance.clockOutAt),
      monthlyAbsenceCount,
      securityPolicy: this.attendanceSecurityService.getPolicy(),
      attendance,
      employee,
    };
  }

  getCheckInSecurityPolicy() {
    return this.attendanceSecurityService.getPolicy();
  }

  async checkIn(
    checkInDto: CheckInDto,
    authentication?: AuthenticationContext,
  ) {
    return this.recordCheckIn(
      checkInDto.employeeId,
      checkInDto,
      {
        enforceSecurity: false,
      },
      authentication,
    );
  }

  async checkOut(
    checkOutDto: CheckOutDto,
    authentication?: AuthenticationContext,
  ) {
    return this.recordCheckOut(
      checkOutDto.employeeId,
      checkOutDto,
      {
        enforceSecurity: false,
      },
      authentication,
    );
  }

  async checkInForEmployee(
    employeeId: string,
    payload: {
      occurredAt?: string;
      notes?: string;
      security?: CheckInSecurityProofDto;
    },
    authentication?: AuthenticationContext,
  ) {
    return this.recordCheckIn(
      employeeId,
      payload,
      {
        enforceSecurity: true,
      },
      authentication,
    );
  }

  async checkOutForEmployee(
    employeeId: string,
    payload: {
      occurredAt?: string;
      notes?: string;
      security?: CheckInSecurityProofDto;
    },
    authentication?: AuthenticationContext,
  ) {
    return this.recordCheckOut(
      employeeId,
      payload,
      {
        enforceSecurity: true,
      },
      authentication,
    );
  }

  private async getAttendanceHistory(
    month?: string,
    employeeId?: string,
    authentication?: AuthenticationContext,
  ) {
    const organizationId = this.tenantId(authentication);
    const { start, end } = this.getMonthRange(month);

    return this.prisma.attendance.findMany({
      where: {
        date: {
          gte: start,
          lt: end,
        },
        ...(employeeId
          ? {
              employeeId,
            }
          : {}),
        ...(organizationId ? { organizationId } : {}),
      },
      select: attendanceWithEmployeeSelect,
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
    });
  }

  private async recordCheckIn(
    employeeId: string,
    payload: {
      occurredAt?: string;
      notes?: string;
      security?: CheckInSecurityProofDto;
    },
    options: {
      enforceSecurity: boolean;
    },
    authentication?: AuthenticationContext,
  ) {
    const organizationId = this.tenantId(authentication);
    const employee = await this.getActiveEmployeeWithSchedule(
      employeeId,
      organizationId,
    );
    const occurredAt = this.parseOccurredAt(payload.occurredAt);
    const date = normalizeAttendanceDate(occurredAt);
    const existingAttendance = await this.prisma.attendance.findFirst({
      where: {
        employeeId: employee.id,
        date,
        ...(organizationId ? { organizationId } : {}),
      },
      select: {
        id: true,
        clockInAt: true,
        clockOutAt: true,
        scheduledExitTime: true,
        notes: true,
      },
    });
    const { minutesLate, status } = this.getCheckInOutcome(
      employee.schedule,
      occurredAt,
      await this.calendarService.isNonWorkingDay(date, authentication),
    );
    const scheduledExitTime = this.getScheduledExitTime(
      employee.schedule,
      occurredAt,
      status === AttendanceStatus.NON_WORKING_DAY_WORK,
    );
    const scheduleSnapshot = buildAttendanceScheduleSnapshot(
      employee.schedule,
      occurredAt,
    );
    const absenceCount = await this.getMonthlyAbsenceCount(
      employee.id,
      employee.schedule,
      occurredAt,
      date,
      organizationId,
      authentication,
    );

    if (existingAttendance?.clockInAt) {
      throw new ConflictException(
        'A check-in has already been recorded for this attendance day.',
      );
    }

    if (existingAttendance?.clockOutAt) {
      throw new ConflictException(
        'Cannot record a new check-in after the attendance has been checked out.',
      );
    }

    const securityMetadata =
      await this.attendanceSecurityService.evaluateCheckIn(payload.security, {
        ...options,
        employeeId: employee.id,
        occurredAt,
        notes: payload.notes,
      });

    if (existingAttendance) {
      const updateResult = await this.prisma.attendance.updateMany({
        where: {
          id: existingAttendance.id,
          clockInAt: null,
          clockOutAt: null,
          ...(organizationId ? { organizationId } : {}),
        },
        data: {
          clockInAt: occurredAt,
          outsideScheduleWork: false,
          scheduledExitTime,
          earlyExit: false,
          earlyExitMinutes: 0,
          lateExit: false,
          overtimeHours: 0,
          overtimeMinutes: 0,
          absenceCount,
          minutesLate,
          status,
          notes: payload.notes ?? existingAttendance.notes ?? null,
          ...scheduleSnapshot,
          ...securityMetadata,
        },
      });

      if (updateResult.count === 0) {
        throw new ConflictException(
          'A check-in has already been recorded for this attendance day.',
        );
      }

      return this.getAttendanceById(existingAttendance.id, organizationId);
    }

    try {
      return await this.prisma.attendance.create({
        data: {
          employeeId: employee.id,
          organizationId: organizationId ?? null,
          date,
          clockInAt: occurredAt,
          outsideScheduleWork: false,
          scheduledExitTime,
          earlyExit: false,
          earlyExitMinutes: 0,
          lateExit: false,
          overtimeHours: 0,
          overtimeMinutes: 0,
          absenceCount,
          minutesLate,
          status,
          notes: payload.notes ?? null,
          ...scheduleSnapshot,
          ...securityMetadata,
        },
        select: attendanceWithEmployeeSelect,
      });
    } catch (error) {
      if (this.isEmployeeDateConstraintError(error)) {
        throw new ConflictException(
          'A check-in has already been recorded for this attendance day.',
        );
      }

      throw error;
    }
  }

  private async recordCheckOut(
    employeeId: string,
    payload: {
      occurredAt?: string;
      notes?: string;
      security?: CheckInSecurityProofDto;
    },
    options: {
      enforceSecurity: boolean;
    },
    authentication?: AuthenticationContext,
  ) {
    const organizationId = this.tenantId(authentication);
    const occurredAt = this.parseOccurredAt(payload.occurredAt);
    const date = normalizeAttendanceDate(occurredAt);
    const attendance = await this.prisma.attendance.findFirst({
      where: {
        employeeId,
        date,
        ...(organizationId ? { organizationId } : {}),
        ...(organizationId
          ? {
              employee: {
                is: this.employeeScheduleTenantWhere(organizationId),
              },
            }
          : {}),
      },
      select: {
        id: true,
        clockInAt: true,
        clockOutAt: true,
        outsideScheduleWork: true,
        scheduledExitTime: true,
        minutesLate: true,
        scheduleIdSnapshot: true,
        scheduleNameSnapshot: true,
        scheduleStartTimeSnapshot: true,
        scheduleEndTimeSnapshot: true,
        scheduleWorkDaysSnapshot: true,
        scheduleLatenessMarginSnapshot: true,
        scheduleCapturedAt: true,
        employee: {
          select: {
            schedule: {
              select: scheduleSelect,
            },
          },
        },
      },
    });

    if (!attendance?.clockInAt) {
      throw new BadRequestException(
        'Cannot check out before a check-in has been recorded.',
      );
    }

    if (attendance.clockOutAt) {
      throw new ConflictException(
        'A check-out has already been recorded for this attendance day.',
      );
    }

    if (occurredAt.getTime() < attendance.clockInAt.getTime()) {
      throw new BadRequestException(
        'Check-out time cannot be earlier than check-in time.',
      );
    }

    const securityMetadata =
      await this.attendanceSecurityService.evaluateCheckOut(payload.security, {
        ...options,
        employeeId,
        occurredAt,
        notes: payload.notes,
      });
    const resolvedSchedule = resolveAttendanceSchedule(
      attendance,
      attendance.employee.schedule,
    );
    const isNonWorkingDay = await this.calendarService.isNonWorkingDay(
      date,
      authentication,
    );
    const isOutsideScheduleWork =
      Boolean(attendance.clockInAt) &&
      (isNonWorkingDay ||
        !isScheduledOnResolvedAttendanceDate(resolvedSchedule, date));
    const scheduledExitTime = isNonWorkingDay
      ? null
      : (attendance.scheduledExitTime ??
        getResolvedAttendanceScheduledExitTime(resolvedSchedule, occurredAt));
    const exitOutcome = isOutsideScheduleWork
      ? getOutsideScheduleAttendanceOutcome(attendance.clockInAt, occurredAt)
      : getAttendanceCheckOutOutcome(scheduledExitTime, occurredAt);
    const absenceCount = await this.getMonthlyAbsenceCount(
      employeeId,
      attendance.employee.schedule,
      occurredAt,
      date,
      organizationId,
      authentication,
    );

    const updateResult = await this.prisma.attendance.updateMany({
      where: {
        id: attendance.id,
        clockInAt: {
          not: null,
        },
        clockOutAt: null,
        ...(organizationId ? { organizationId } : {}),
      },
      data: {
        clockOutAt: occurredAt,
        outsideScheduleWork: isOutsideScheduleWork,
        scheduledExitTime: exitOutcome.scheduledExitTime,
        earlyExit: exitOutcome.earlyExit,
        earlyExitMinutes: exitOutcome.earlyExitMinutes,
        lateExit: exitOutcome.lateExit,
        overtimeHours: exitOutcome.overtimeHours,
        overtimeMinutes: exitOutcome.overtimeMinutes,
        absenceCount,
        notes: payload.notes ?? undefined,
        status: isNonWorkingDay
          ? AttendanceStatus.NON_WORKING_DAY_WORK
          : isOutsideScheduleWork
            ? AttendanceStatus.PRESENT
            : this.getCompletedStatus(attendance.minutesLate),
        ...securityMetadata,
      },
    });

    if (updateResult.count === 0) {
      throw new ConflictException(
        'A check-out has already been recorded for this attendance day.',
      );
    }

    return this.getAttendanceById(attendance.id, organizationId);
  }

  private async getActiveEmployeeWithSchedule(
    employeeId: string,
    organizationId?: string,
  ) {
    const employee = await this.prisma.employee.findFirst({
      where: {
        id: employeeId,
        ...this.employeeScheduleTenantWhere(organizationId),
      },
      select: {
        id: true,
        isActive: true,
        schedule: {
          select: scheduleSelect,
        },
      },
    });

    if (!employee || !employee.isActive) {
      throw new NotFoundException('Employee not found.');
    }

    return employee;
  }

  private async getAttendanceById(id: string, organizationId?: string) {
    const attendance = await this.prisma.attendance.findFirst({
      where: {
        id,
        ...(organizationId ? { organizationId } : {}),
      },
      select: attendanceWithEmployeeSelect,
    });

    if (!attendance) {
      throw new NotFoundException('Attendance record not found.');
    }

    return attendance;
  }

  private parseOccurredAt(value?: string) {
    const occurredAt = value ? new Date(value) : new Date();

    if (Number.isNaN(occurredAt.getTime())) {
      throw new BadRequestException(
        'occurredAt must be a valid ISO-8601 date-time string.',
      );
    }

    if (occurredAt.getTime() > Date.now()) {
      throw new BadRequestException('occurredAt cannot be in the future.');
    }

    return occurredAt;
  }

  private getMonthRange(month?: string) {
    const resolvedMonth = month ?? formatAttendanceMonth(new Date());

    if (!/^\d{4}-\d{2}$/.test(resolvedMonth)) {
      throw new BadRequestException('month must be in YYYY-MM format.');
    }

    const [year, monthIndex] = resolvedMonth.split('-').map(Number);
    const { startOfMonth: start, endOfMonth: end } = getAttendanceMonthRange(
      year,
      monthIndex,
    );

    return {
      start,
      end,
    };
  }

  private getCheckInOutcome(
    schedule: {
      isActive: boolean;
      startTime: string;
      latenessMarginMinutes: number;
      workDays: Prisma.JsonValue;
    } | null,
    occurredAt: Date,
    isNonWorkingDay: boolean,
  ) {
    if (isNonWorkingDay) {
      return {
        minutesLate: 0,
        status: AttendanceStatus.NON_WORKING_DAY_WORK,
      };
    }

    if (
      !schedule ||
      !schedule.isActive ||
      !isScheduledOnDate(schedule.workDays, occurredAt)
    ) {
      return {
        minutesLate: 0,
        status: AttendanceStatus.INCOMPLETE,
      };
    }

    const minutesLate = this.getMinutesLate(
      schedule.startTime,
      occurredAt,
      schedule.latenessMarginMinutes,
    );

    if (minutesLate > 0) {
      return {
        minutesLate,
        status: AttendanceStatus.LATE,
      };
    }

    return {
      minutesLate: 0,
      status: AttendanceStatus.INCOMPLETE,
    };
  }

  private getCompletedStatus(minutesLate: number) {
    return minutesLate > 0 ? AttendanceStatus.LATE : AttendanceStatus.PRESENT;
  }

  private getScheduledExitTime(
    schedule: {
      isActive: boolean;
      endTime: string;
      workDays: Prisma.JsonValue;
    } | null,
    occurredAt: Date,
    isNonWorkingDay = false,
  ) {
    if (isNonWorkingDay) {
      return null;
    }

    if (
      !schedule ||
      !schedule.isActive ||
      !isScheduledOnDate(schedule.workDays, occurredAt)
    ) {
      return null;
    }

    return setTimeOnDate(occurredAt, schedule.endTime);
  }

  private isOutsideScheduledWorkday(
    schedule: {
      isActive: boolean;
      workDays: Prisma.JsonValue;
    } | null,
    occurredAt: Date,
  ) {
    if (!schedule?.isActive) {
      return false;
    }

    return !isScheduledOnDate(schedule.workDays, occurredAt);
  }

  private async getMonthlyAbsenceCount(
    employeeId: string,
    schedule: {
      isActive: boolean;
      workDays: Prisma.JsonValue;
    } | null,
    referenceDate: Date,
    attendedDate?: Date,
    organizationId?: string,
    authentication?: AuthenticationContext,
  ) {
    if (!schedule || !schedule.isActive) {
      return 0;
    }

    const { start, end } = this.getDateMonthRange(referenceDate);
    const workedAttendances = await this.prisma.attendance.findMany({
      where: {
        employeeId,
        ...(organizationId ? { organizationId } : {}),
        date: {
          gte: start,
          lt: end,
        },
        clockInAt: {
          not: null,
        },
      },
      select: {
        date: true,
      },
    });
    const workedDateKeys = new Set(
      workedAttendances.map((attendance) =>
        normalizeAttendanceDate(attendance.date).getTime(),
      ),
    );

    if (attendedDate) {
      workedDateKeys.add(normalizeAttendanceDate(attendedDate).getTime());
    }

    const cursor = new Date(start);
    const endOfCountingWindow = this.getAbsenceCountingEnd(end, referenceDate);
    const nonWorkingDateKeys = await this.calendarService.getNonWorkingDateKeys(
      start,
      endOfCountingWindow,
      authentication,
    );
    let absenceCount = 0;

    while (cursor < endOfCountingWindow) {
      const currentDate = normalizeAttendanceDate(cursor);

      if (
        isScheduledOnDate(schedule.workDays, currentDate) &&
        !nonWorkingDateKeys.has(currentDate.getTime()) &&
        !workedDateKeys.has(currentDate.getTime())
      ) {
        absenceCount += 1;
      }

      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }

    return absenceCount;
  }

  private getDateMonthRange(referenceDate: Date) {
    const { start, end } = getAttendanceMonthRangeFromDate(referenceDate);

    return {
      start,
      end,
    };
  }

  private getAbsenceCountingEnd(monthEnd: Date, referenceDate: Date) {
    const referenceDayEnd = addAttendanceDays(
      normalizeAttendanceDate(referenceDate),
      1,
    );

    return referenceDayEnd < monthEnd ? referenceDayEnd : monthEnd;
  }

  private getMinutesLate(
    startTime: string,
    occurredAt: Date,
    latenessMarginMinutes = 0,
  ) {
    const [hours, minutes] = startTime.split(':').map(Number);
    const scheduledAt = new Date(occurredAt);

    scheduledAt.setUTCHours(hours, minutes, 0, 0);

    const delta =
      occurredAt.getTime() -
      scheduledAt.getTime() -
      latenessMarginMinutes * 60_000;

    return Math.max(0, Math.round(delta / 60000));
  }

  private isEmployeeDateConstraintError(error: unknown) {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    );
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

  private employeeScheduleTenantWhere(
    organizationId?: string,
  ): Prisma.EmployeeWhereInput {
    if (!organizationId) {
      return {};
    }

    return {
      organizationId,
      OR: [{ scheduleId: null }, { schedule: { is: { organizationId } } }],
    };
  }
}
