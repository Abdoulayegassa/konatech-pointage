import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuthenticationContext } from '../auth/interfaces/authentication-context.interface';
import { requireOrganizationContext } from '../auth/interfaces/organization-context.helpers';
import { UpdateOrganizationProfileDto } from './dto/update-organization-profile.dto';
import { UpdateAttendanceSettingsDto } from './dto/update-attendance-settings.dto';
import { isValidTimeZone } from '../../common/utils/attendance-date.util';
import { EntitlementsService } from '../subscriptions/entitlements.service';

const organizationProfileSelect = {
  id: true,
  name: true,
  slug: true,
  status: true,
  timezone: true,
  logoUrl: true,
  primaryColor: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.OrganizationSelect;

@Injectable()
export class OrganizationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly entitlements: EntitlementsService,
  ) {}

  async getCurrent(authentication: AuthenticationContext) {
    const context = requireOrganizationContext(authentication);
    const organization = await this.prisma.organization.findUnique({
      where: { id: context.organizationId },
      select: organizationProfileSelect,
    });

    if (!organization) {
      throw new NotFoundException('Organization not found.');
    }

    return organization;
  }

  async getOwnerOnboarding(authentication: AuthenticationContext) {
    const { organizationId } = requireOrganizationContext(authentication);
    const [
      organization,
      subscription,
      assignedScheduleCount,
      attendanceCount,
      pinConfiguredCount,
    ] = await Promise.all([
      this.prisma.organization.findUnique({
        where: { id: organizationId },
        select: { name: true, status: true, timezone: true },
      }),
      this.entitlements.getForOrganization(organizationId),
      this.prisma.schedule.count({
        where: {
          organizationId,
          isActive: true,
          employees: {
            some: { organizationId, isActive: true },
          },
        },
      }),
      this.prisma.attendance.count({
        where: {
          organizationId,
          clockInAt: { not: null },
        },
      }),
      this.prisma.employee.count({
        where: {
          organizationId,
          isActive: true,
          OR: [{ pinCodeHash: { not: null } }, { pinCode: { not: null } }],
        },
      }),
    ]);

    if (!organization) {
      throw new NotFoundException('Organization not found.');
    }

    return {
      organizationProfile: {
        configured: Boolean(
          organization.name.trim() && organization.timezone.trim(),
        ),
        name: organization.name,
        status: organization.status,
        timezone: organization.timezone,
      },
      subscription: {
        activeAdministratorCount: subscription.usage.activeAdministrators,
        pendingAdministratorInvitationCount:
          subscription.usage.pendingAdministratorInvitations,
        administratorCapacityUsed:
          subscription.usage.administratorCapacityUsed,
        administratorLimit: subscription.entitlements.activeAdministrators,
        plan: subscription.subscription.plan,
        status: subscription.subscription.status,
      },
      attendanceSites: {
        activeCount: subscription.usage.activeAttendanceSites,
        limit: subscription.entitlements.activeAttendanceSites,
      },
      employees: {
        activeCount: subscription.usage.activeEmployees,
        limit: subscription.entitlements.activeEmployees,
        pinConfiguredCount,
      },
      schedules: {
        activeAssignedCount: assignedScheduleCount,
      },
      attendance: {
        firstClockInCompleted: attendanceCount > 0,
      },
      qr: {
        available: subscription.usage.activeAttendanceSites > 0,
      },
    };
  }

  async updateCurrent(
    payload: UpdateOrganizationProfileDto,
    authentication: AuthenticationContext,
  ) {
    const context = requireOrganizationContext(authentication);
    const changedFields = Object.entries(payload)
      .filter(([, value]) => value !== undefined)
      .map(([field]) => field);

    if (changedFields.length === 0) {
      throw new BadRequestException(
        'At least one organization profile field is required.',
      );
    }
    if (
      payload.timezone !== undefined &&
      !isValidTimeZone(payload.timezone.trim())
    ) {
      throw new BadRequestException('timezone must be a valid IANA timezone.');
    }

    const existing = await this.prisma.organization.findUnique({
      where: { id: context.organizationId },
      select: { id: true },
    });

    if (!existing) {
      throw new NotFoundException('Organization not found.');
    }

    return this.prisma.organization.update({
      where: { id: context.organizationId },
      data: {
        name: payload.name?.trim(),
        timezone: payload.timezone?.trim(),
        logoUrl:
          typeof payload.logoUrl === 'string'
            ? payload.logoUrl.trim()
            : payload.logoUrl,
        primaryColor:
          typeof payload.primaryColor === 'string'
            ? payload.primaryColor.toUpperCase()
            : payload.primaryColor,
      },
      select: organizationProfileSelect,
    });
  }

  async getCurrentAttendanceSettings(authentication: AuthenticationContext) {
    const context = requireOrganizationContext(authentication);
    const settings =
      await this.prisma.organizationAttendanceSettings.findUnique({
        where: { organizationId: context.organizationId },
      });
    return (
      settings ?? {
        organizationId: context.organizationId,
        gpsRequired: null,
        selfieRequired: null,
        allowedRadiusMeters: null,
        defaultLatenessMarginMinutes: null,
        defaultWorkDays: null,
      }
    );
  }

  async updateCurrentAttendanceSettings(
    payload: UpdateAttendanceSettingsDto,
    authentication: AuthenticationContext,
  ) {
    const context = requireOrganizationContext(authentication);
    if (Object.keys(payload).length === 0) {
      throw new BadRequestException(
        'At least one attendance setting is required.',
      );
    }
    const data = {
      ...(payload.gpsRequired === undefined
        ? {}
        : { gpsRequired: payload.gpsRequired }),
      ...(payload.selfieRequired === undefined
        ? {}
        : { selfieRequired: payload.selfieRequired }),
      ...(payload.allowedRadiusMeters === undefined
        ? {}
        : { allowedRadiusMeters: payload.allowedRadiusMeters }),
      ...(payload.defaultLatenessMarginMinutes === undefined
        ? {}
        : {
            defaultLatenessMarginMinutes: payload.defaultLatenessMarginMinutes,
          }),
      ...(payload.defaultWorkDays === undefined
        ? {}
        : { defaultWorkDays: payload.defaultWorkDays ?? Prisma.JsonNull }),
    };
    return this.prisma.organizationAttendanceSettings.upsert({
      where: { organizationId: context.organizationId },
      create: { organizationId: context.organizationId, ...data },
      update: data,
    });
  }
}
