import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import {
  signJwtToken,
  verifyJwtToken,
} from '../../common/security/jwt.util';
import { getBusinessDate } from '../../common/utils/attendance-date.util';
import { OrganizationTimezoneService } from '../../common/time/organization-timezone.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuthenticationContext } from '../auth/interfaces/authentication-context.interface';
import { CalendarService } from '../calendar/calendar.service';
import { EffectiveScheduleResolver } from '../schedules/effective-schedule.resolver';
import { AttendanceSecurityService } from './attendance-security.service';
import type { AttendanceSecurityPolicy } from './attendance-security-policy.service';

export const OFFLINE_ATTENDANCE_MAX_AGE_MS = 24 * 60 * 60_000;
export const OFFLINE_ATTENDANCE_FUTURE_SKEW_MS = 2 * 60_000;
const CONTEXT_TTL = '24h';

export type VerifiedOfflineAttendanceContext = {
  version: 1 | 2;
  contextId: string;
  organizationId: string;
  employeeId: string;
  siteId: string;
  issuedAt: string;
  validUntil: string;
  employeeActiveAtIssue: true;
  siteActiveAtIssue: true;
  calendarCapturedAt: string;
  timeZone: string;
  siteAssignmentId: string;
  /** Activation-state version at issuance; detects deactivate/reactivate cycles. */
  siteStatusChangedAtAtIssue?: string;
  scheduleAssignmentId: string | null;
  site: {
    id: string;
    latitude: number;
    longitude: number;
    allowedRadiusMeters: number;
  };
  schedule: {
    id: string;
    name: string;
    startTime: string;
    endTime: string;
    latenessMarginMinutes: number;
    workDays: unknown;
  } | null;
  scheduleSnapshots: Array<{
    businessDate: string;
    siteAssignmentId: string;
    scheduleAssignmentId: string | null;
    schedule: VerifiedOfflineAttendanceContext['schedule'];
  }>;
  attendancePolicy: AttendanceSecurityPolicy;
  nonWorkingDates: string[];
};

@Injectable()
export class OfflineAttendanceContextService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly timezones: OrganizationTimezoneService,
    private readonly schedules: EffectiveScheduleResolver,
    private readonly calendar: CalendarService,
    private readonly security: AttendanceSecurityService,
  ) {}

  async issue(
    employeeId: string,
    authentication: AuthenticationContext,
    requestedSiteId?: string,
  ) {
    if (
      authentication.generation !== 'saas' ||
      (authentication.purpose !== 'attendance_entry' &&
        authentication.purpose !== 'account') ||
      !authentication.organizationId ||
      (authentication.purpose === 'attendance_entry' &&
        (!authentication.attendanceSiteId ||
          (requestedSiteId && requestedSiteId !== authentication.attendanceSiteId)))
    ) {
      throw new UnauthorizedException('Offline attendance context is unavailable.');
    }
    const employee = await this.prisma.employee.findFirst({
      where: {
        id: employeeId,
        organizationId: authentication.organizationId,
        isActive: true,
        organization: { is: { status: 'ACTIVE' } },
      },
      select: { id: true, organizationId: true, primarySiteId: true },
    });
    const selectedSiteId =
      authentication.attendanceSiteId ?? requestedSiteId ?? employee?.primarySiteId;
    if (!employee || !selectedSiteId) {
      throw new UnauthorizedException('Offline attendance context is unavailable.');
    }
    const [site, timeZone] = await Promise.all([
      this.prisma.attendanceSite.findFirst({
        where: {
          id: selectedSiteId,
          organizationId: authentication.organizationId,
          isActive: true,
        },
        select: {
          id: true,
          latitude: true,
          longitude: true,
          allowedRadiusMeters: true,
          statusChangedAt: true,
        },
      }),
      this.timezones.resolve(authentication),
    ]);
    if (!site) {
      throw new UnauthorizedException('Offline attendance context is unavailable.');
    }
    const issued = new Date();
    const businessDate = getBusinessDate(issued, timeZone);
    const assignment = await this.prisma.employeeSiteAssignment.findFirst({
      where: {
        organizationId: authentication.organizationId,
        employeeId,
        siteId: site.id,
        effectiveFrom: { lte: businessDate },
        OR: [{ effectiveTo: null }, { effectiveTo: { gt: businessDate } }],
      },
      select: { id: true },
    });
    if (!assignment) {
      throw new UnauthorizedException('Employee has no effective site assignment.');
    }
    const scheduleSnapshots: VerifiedOfflineAttendanceContext['scheduleSnapshots'] = [];
    // The bounded device clock skew can place a capture just before issuance,
    // including on the prior organization-local business date.
    for (let dayOffset = -1; dayOffset <= 1; dayOffset += 1) {
      const effectiveDate = new Date(businessDate);
      effectiveDate.setUTCDate(effectiveDate.getUTCDate() + dayOffset);
      const effectiveSiteAssignment = await this.prisma.employeeSiteAssignment.findFirst({
        where: {
          organizationId: authentication.organizationId,
          employeeId,
          siteId: site.id,
          effectiveFrom: { lte: effectiveDate },
          OR: [{ effectiveTo: null }, { effectiveTo: { gt: effectiveDate } }],
        },
        select: { id: true },
      });
      const resolved = effectiveSiteAssignment
        ? await this.schedules.resolveOptional(
            employeeId,
            authentication.organizationId,
            effectiveDate,
          )
        : null;
      scheduleSnapshots.push({
        businessDate: effectiveDate.toISOString().slice(0, 10),
        siteAssignmentId: effectiveSiteAssignment?.id ?? '',
        scheduleAssignmentId:
          resolved?.scheduleAssignment.id ?? null,
        schedule: resolved
          ? {
              id: resolved.schedule.id,
              name: resolved.schedule.name,
              startTime: resolved.schedule.startTime,
              endTime: resolved.schedule.endTime,
              latenessMarginMinutes: resolved.schedule.latenessMarginMinutes,
              workDays: resolved.schedule.workDays,
            }
          : null,
      });
    }
    const issuedDateSnapshot =
      scheduleSnapshots.find(
        (entry) => entry.businessDate === businessDate.toISOString().slice(0, 10),
      ) ?? scheduleSnapshots[0];
    const policy = await this.security.getEffectivePolicy(authentication, site);
    const calendarStart = new Date(businessDate);
    calendarStart.setUTCDate(calendarStart.getUTCDate() - 1);
    const calendarEnd = new Date(businessDate);
    calendarEnd.setUTCDate(calendarEnd.getUTCDate() + 2);
    const nonWorkingDateKeys = await this.calendar.getNonWorkingDateKeys(
      calendarStart,
      calendarEnd,
      authentication,
      site.id,
    );
    const validUntil = new Date(issued.getTime() + OFFLINE_ATTENDANCE_MAX_AGE_MS);
    const context: VerifiedOfflineAttendanceContext = {
      version: 2,
      contextId: randomUUID(),
      organizationId: authentication.organizationId,
      employeeId,
      siteId: site.id,
      issuedAt: issued.toISOString(),
      validUntil: validUntil.toISOString(),
      employeeActiveAtIssue: true,
      siteActiveAtIssue: true,
      calendarCapturedAt: issued.toISOString(),
      timeZone,
      siteAssignmentId: assignment.id,
      siteStatusChangedAtAtIssue: site.statusChangedAt.toISOString(),
      scheduleAssignmentId: issuedDateSnapshot.scheduleAssignmentId,
      site,
      schedule: issuedDateSnapshot.schedule,
      scheduleSnapshots,
      attendancePolicy: policy,
      nonWorkingDates: [...nonWorkingDateKeys].map((key) => new Date(key).toISOString().slice(0, 10)),
    };
    const token = signJwtToken(
      { sub: employeeId, purpose: 'offline_attendance_context', context },
      this.config.getOrThrow<string>('JWT_SECRET'),
      CONTEXT_TTL,
    );
    return {
      contextToken: token,
      contextId: context.contextId,
      issuedAt: context.issuedAt,
      validUntil: context.validUntil,
      version: 1,
    };
  }

  verify(
    token: string,
    employeeId: string,
    authentication: AuthenticationContext,
    capturedAt: Date,
    receivedAt: Date,
  ): { context: VerifiedOfflineAttendanceContext; expired: boolean } {
    let payload: ReturnType<typeof verifyJwtToken>;
    try {
      payload = verifyJwtToken(
        token,
        this.config.getOrThrow<string>('JWT_SECRET'),
        { allowExpired: true },
      );
    } catch {
      throw new BadRequestException('Offline attendance context is invalid or expired.');
    }
    if (payload.purpose !== 'offline_attendance_context') {
      throw new BadRequestException('Offline attendance context is invalid.');
    }
    const context = payload.context as unknown as VerifiedOfflineAttendanceContext;
    const issuedAt = Date.parse(context.issuedAt);
    const validUntil = Date.parse(context.validUntil);
    if (
      payload.sub !== employeeId ||
      context.employeeId !== employeeId ||
      context.organizationId !== authentication.organizationId ||
      (authentication.attendanceSiteId &&
        context.siteId !== authentication.attendanceSiteId) ||
      !context.contextId ||
      !Number.isFinite(issuedAt) ||
      !Number.isFinite(validUntil) ||
      validUntil - issuedAt !== OFFLINE_ATTENDANCE_MAX_AGE_MS ||
      capturedAt.getTime() < issuedAt - OFFLINE_ATTENDANCE_FUTURE_SKEW_MS ||
      capturedAt.getTime() - receivedAt.getTime() > OFFLINE_ATTENDANCE_FUTURE_SKEW_MS ||
      !Array.isArray(context.scheduleSnapshots) ||
      !Array.isArray(context.nonWorkingDates)
    ) {
      throw new BadRequestException('Offline attendance context does not authorize this event.');
    }
    // validUntil constrains when the event was captured. A delayed receipt may
    // arrive after the context window closes, provided the event itself is
    // still within the approved 24-hour acceptance age.
    const expired =
      capturedAt.getTime() > validUntil ||
      receivedAt.getTime() - capturedAt.getTime() > OFFLINE_ATTENDANCE_MAX_AGE_MS;
    return { context, expired };
  }
}
