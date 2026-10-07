import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { MembershipRole, Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { requireOrganizationContext } from '../auth/interfaces/organization-context.helpers';
import { AuthenticationContext } from '../auth/interfaces/authentication-context.interface';
import { EntitlementsService } from '../subscriptions/entitlements.service';
import { CreateAttendanceSiteDto } from './dto/create-attendance-site.dto';
import { UpdateAttendanceSiteDto } from './dto/update-attendance-site.dto';
import { UpdateSiteAttendanceSettingsDto } from './dto/update-site-attendance-settings.dto';

const select = {
  id: true,
  publicId: true,
  name: true,
  latitude: true,
  longitude: true,
  allowedRadiusMeters: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
};
@Injectable()
export class AttendanceSitesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly entitlements: EntitlementsService,
  ) {}
  list(authentication: AuthenticationContext) {
    const { organizationId } = requireOrganizationContext(authentication);
    return this.prisma.attendanceSite.findMany({
      where: { organizationId },
      select,
      orderBy: { createdAt: 'asc' },
    });
  }

  /** Shared tenant/site boundary for Admin reads. Inactive sites may be read
   * for historical data; operational endpoints explicitly require active. */
  async resolveAdminSite(
    id: string,
    authentication: AuthenticationContext,
    requireActive = false,
  ) {
    const { organizationId, membershipRole } = requireOrganizationContext(authentication);
    if (membershipRole !== MembershipRole.ADMIN) {
      throw new ForbiddenException('Organization Admin access is required.');
    }
    const site = await this.prisma.attendanceSite.findFirst({
      where: { id, organizationId, ...(requireActive ? { isActive: true } : {}) },
      select,
    });
    if (!site) throw new NotFoundException('Attendance site not found.');
    return site;
  }

  async resolvePublicActiveSite(publicId: string) {
    const site = await this.prisma.attendanceSite.findUnique({
      where: { publicId },
      select: {
        id: true,
        organizationId: true,
        publicId: true,
        name: true,
        latitude: true,
        longitude: true,
        allowedRadiusMeters: true,
        isActive: true,
        organization: { select: { status: true } },
      },
    });
    if (!site?.isActive || site.organization.status !== 'ACTIVE') {
      throw new NotFoundException('Attendance site not found.');
    }
    return site;
  }

  async resolveActiveAttendanceSite(
    authentication: AuthenticationContext,
    requestedSiteId?: string,
  ) {
    if (authentication.generation === 'legacy') return null;
    const organizationId = authentication.organizationId;
    if (!organizationId) {
      throw new ForbiddenException(
        'A valid organization context is required for attendance.',
      );
    }
    const tokenSiteId =
      authentication.purpose === 'attendance_entry'
        ? authentication.attendanceSiteId
        : null;
    if (tokenSiteId && requestedSiteId && tokenSiteId !== requestedSiteId) {
      throw new ForbiddenException('Attendance site does not match session.');
    }
    const siteId = tokenSiteId ?? requestedSiteId;
    if (!siteId) {
      throw new BadRequestException('siteId is required for SaaS attendance.');
    }
    const site = await this.prisma.attendanceSite.findFirst({
      where: { id: siteId, organizationId, isActive: true },
      select: {
        id: true,
        organizationId: true,
        publicId: true,
        name: true,
        latitude: true,
        longitude: true,
        allowedRadiusMeters: true,
        isActive: true,
      },
    });
    if (!site) {
      throw new NotFoundException('Attendance site not found or inactive.');
    }
    return site;
  }
  async create(
    dto: CreateAttendanceSiteDto,
    authentication: AuthenticationContext,
  ) {
    const { organizationId } = requireOrganizationContext(authentication);
    return this.runQuotaMutation(async (tx) => {
      await this.entitlements.assertMayIncrease(
        organizationId,
        'activeAttendanceSites',
        tx,
      );
      return tx.attendanceSite.create({
        data: {
          organizationId,
          name: dto.name.trim(),
          latitude: dto.latitude,
          longitude: dto.longitude,
          allowedRadiusMeters: dto.allowedRadiusMeters,
        },
        select,
      });
    });
  }
  async update(
    id: string,
    dto: UpdateAttendanceSiteDto,
    authentication: AuthenticationContext,
  ) {
    const { organizationId } = requireOrganizationContext(authentication);
    await this.find(id, organizationId);
    return this.prisma.attendanceSite.update({
      where: { id },
      data: {
        ...(dto.name === undefined ? {} : { name: dto.name.trim() }),
        ...(dto.latitude === undefined ? {} : { latitude: dto.latitude }),
        ...(dto.longitude === undefined ? {} : { longitude: dto.longitude }),
        ...(dto.allowedRadiusMeters === undefined
          ? {}
          : { allowedRadiusMeters: dto.allowedRadiusMeters }),
      },
      select,
    });
  }
  async setStatus(
    id: string,
    isActive: boolean,
    authentication: AuthenticationContext,
  ) {
    const { organizationId } = requireOrganizationContext(authentication);
    return this.runQuotaMutation(async (tx) => {
      const site = await tx.attendanceSite.findFirst({
        where: { id, organizationId },
        select: { id: true, isActive: true },
      });
      if (!site) throw new NotFoundException('Attendance site not found.');
      if (isActive && !site.isActive)
        await this.entitlements.assertMayIncrease(
          organizationId,
          'activeAttendanceSites',
          tx,
        );
      return tx.attendanceSite.update({
        where: { id },
        data: {
          isActive,
          ...(isActive === site.isActive ? {} : { statusChangedAt: new Date() }),
        },
        select,
      });
    });
  }

  async getSettings(id: string, authentication: AuthenticationContext) {
    const { organizationId } = requireOrganizationContext(authentication);
    await this.find(id, organizationId);
    const settings = await this.prisma.siteAttendanceSettings.findUnique({
      where: { organizationId_siteId: { organizationId, siteId: id } },
    });
    return settings ?? {
      organizationId,
      siteId: id,
      gpsRequired: null,
      selfieRequired: null,
      defaultLatenessMarginMinutes: null,
      defaultWorkDays: null,
    };
  }

  async updateSettings(
    id: string,
    payload: UpdateSiteAttendanceSettingsDto,
    authentication: AuthenticationContext,
  ) {
    const { organizationId } = requireOrganizationContext(authentication);
    if (Object.keys(payload).length === 0) {
      throw new BadRequestException('At least one site attendance setting is required.');
    }
    await this.ensureActiveSite(id, organizationId);
    const data = {
      ...(payload.gpsRequired === undefined ? {} : { gpsRequired: payload.gpsRequired }),
      ...(payload.selfieRequired === undefined ? {} : { selfieRequired: payload.selfieRequired }),
      ...(payload.defaultLatenessMarginMinutes === undefined
        ? {}
        : { defaultLatenessMarginMinutes: payload.defaultLatenessMarginMinutes }),
      ...(payload.defaultWorkDays === undefined
        ? {}
        : { defaultWorkDays: payload.defaultWorkDays ?? Prisma.JsonNull }),
    };
    return this.prisma.siteAttendanceSettings.upsert({
      where: { organizationId_siteId: { organizationId, siteId: id } },
      create: { organizationId, siteId: id, ...data },
      update: data,
    });
  }
  private async find(id: string, organizationId: string) {
    const site = await this.prisma.attendanceSite.findFirst({
      where: { id, organizationId },
      select: { id: true },
    });
    if (!site) throw new NotFoundException('Attendance site not found.');
    return site;
  }

  private async ensureActiveSite(id: string, organizationId: string) {
    const site = await this.prisma.attendanceSite.findFirst({
      where: { id, organizationId, isActive: true },
      select: { id: true },
    });
    if (!site) throw new NotFoundException('Attendance site not found or inactive.');
  }

  private async runQuotaMutation<T>(
    operation: (transaction: Prisma.TransactionClient) => Promise<T>,
  ) {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await this.prisma.$transaction(operation, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        });
      } catch (error) {
        const transactionConflict =
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2034';
        if (transactionConflict && attempt < 2) continue;
        if (transactionConflict)
          throw new ConflictException(
            'Concurrent quota update detected. Please retry.',
          );
        throw error;
      }
    }
    throw new ConflictException(
      'Concurrent quota update detected. Please retry.',
    );
  }
}
