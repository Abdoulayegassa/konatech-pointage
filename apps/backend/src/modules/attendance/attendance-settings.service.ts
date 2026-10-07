import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuthenticationContext } from '../auth/interfaces/authentication-context.interface';
import { requireOrganizationContext } from '../auth/interfaces/organization-context.helpers';
import {
  AttendanceSecurityPolicyService,
  AttendanceSecurityPolicy,
} from './attendance-security-policy.service';

export type EffectiveAttendanceSettings = {
  organizationId: string;
  gpsRequired: boolean;
  selfieRequired: boolean;
  allowedRadiusMeters: number | null;
  defaultLatenessMarginMinutes: number | null;
  defaultWorkDays: unknown[] | null;
};

export type AttendanceSiteSecurityContext = {
  id?: string;
  latitude: number;
  longitude: number;
  allowedRadiusMeters: number;
};

const DEFAULT_WORK_DAYS = [
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
];

@Injectable()
export class AttendanceSettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly legacyPolicy: AttendanceSecurityPolicyService,
  ) {}

  async resolveSecurityPolicy(
    authentication: AuthenticationContext,
    site?: AttendanceSiteSecurityContext | null,
  ): Promise<AttendanceSecurityPolicy> {
    const legacy = this.legacyPolicy.getPolicy();
    if (
      authentication.generation !== 'saas' ||
      !authentication.organizationId
    ) {
      return legacy;
    }
    const [settings, siteSettings] = await Promise.all([
      this.prisma.organizationAttendanceSettings.findUnique({
        where: { organizationId: authentication.organizationId },
      }),
      site?.id
        ? this.prisma.siteAttendanceSettings.findUnique({
            where: {
              organizationId_siteId: {
                organizationId: authentication.organizationId,
                siteId: site.id,
              },
            },
          })
        : null,
    ]);
    const gpsRequired =
      siteSettings?.gpsRequired ?? settings?.gpsRequired ?? legacy.gpsRequired;
    const selfieRequired =
      siteSettings?.selfieRequired ??
      settings?.selfieRequired ??
      legacy.selfieRequired;
    return {
      ...legacy,
      enabled: gpsRequired || selfieRequired,
      gpsRequired,
      selfieRequired,
      allowedRadiusMeters:
        site?.allowedRadiusMeters ??
        settings?.allowedRadiusMeters ??
        legacy.allowedRadiusMeters,
      locationConfigured: gpsRequired
        ? Boolean(site) || legacy.locationConfigured
        : legacy.locationConfigured,
      companyLatitude: gpsRequired
        ? (site?.latitude ?? legacy.companyLatitude)
        : null,
      companyLongitude: gpsRequired
        ? (site?.longitude ?? legacy.companyLongitude)
        : null,
    };
  }

  async resolve(
    authentication: AuthenticationContext,
  ): Promise<EffectiveAttendanceSettings> {
    const context = requireOrganizationContext(authentication);
    const settings =
      await this.prisma.organizationAttendanceSettings.findUnique({
        where: { organizationId: context.organizationId },
      });
    return {
      organizationId: context.organizationId,
      gpsRequired: settings?.gpsRequired ?? false,
      selfieRequired: settings?.selfieRequired ?? false,
      allowedRadiusMeters: settings?.allowedRadiusMeters ?? null,
      defaultLatenessMarginMinutes:
        settings?.defaultLatenessMarginMinutes ?? null,
      defaultWorkDays: Array.isArray(settings?.defaultWorkDays)
        ? settings.defaultWorkDays
        : null,
    };
  }

  async resolveScheduleDefaults(
    authentication?: AuthenticationContext,
    siteId?: string,
  ) {
    if (
      !authentication?.organizationId ||
      authentication.generation !== 'saas'
    ) {
      return { latenessMarginMinutes: 0, workDays: DEFAULT_WORK_DAYS };
    }
    const [settings, siteSettings] = await Promise.all([
      this.prisma.organizationAttendanceSettings.findUnique({
        where: { organizationId: authentication.organizationId },
      }),
      siteId
        ? this.prisma.siteAttendanceSettings.findUnique({
            where: {
              organizationId_siteId: {
                organizationId: authentication.organizationId,
                siteId,
              },
            },
          })
        : null,
    ]);
    return {
      latenessMarginMinutes:
        siteSettings?.defaultLatenessMarginMinutes ??
        settings?.defaultLatenessMarginMinutes ??
        0,
      workDays:
        Array.isArray(siteSettings?.defaultWorkDays) &&
        siteSettings.defaultWorkDays.length > 0
          ? siteSettings.defaultWorkDays
          : Array.isArray(settings?.defaultWorkDays) &&
              settings.defaultWorkDays.length > 0
            ? settings.defaultWorkDays
          : DEFAULT_WORK_DAYS,
    };
  }
}
