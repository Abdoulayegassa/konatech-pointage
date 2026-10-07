import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  operationalScopeCreateData,
  scheduleOperationalWhere,
} from '../../common/prisma/operational-scope';
import {
  publicEmployeeSelect,
  scheduleSelect,
} from '../../common/prisma/selects';
import { AuthenticationContext } from '../auth/interfaces/authentication-context.interface';
import { CreateScheduleDto } from './dto/create-schedule.dto';
import { UpdateScheduleDto } from './dto/update-schedule.dto';
import { AttendanceSettingsService } from '../attendance/attendance-settings.service';
import { UpdateScheduleStatusDto } from './dto/update-schedule-status.dto';

@Injectable()
export class SchedulesService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly attendanceSettings?: AttendanceSettingsService,
  ) {}

  findAll(authentication?: AuthenticationContext) {
    const organizationId = this.tenantId(authentication);
    return this.prisma.schedule.findMany({
      where: this.scheduleTenantWhere(organizationId),
      select: this.scheduleSelect(organizationId),
      orderBy: [{ createdAt: 'desc' }, { name: 'asc' }],
    });
  }

  async findOne(id: string, authentication?: AuthenticationContext) {
    const organizationId = this.tenantId(authentication);
    const schedule = await this.prisma.schedule.findFirst({
      where: {
        id,
        ...this.scheduleTenantWhere(organizationId),
      },
      select: this.scheduleSelect(organizationId),
    });

    if (!schedule) {
      throw new NotFoundException('Schedule not found.');
    }

    return schedule;
  }

  async findOneForSite(
    siteId: string,
    id: string,
    authentication: AuthenticationContext,
  ) {
    const organizationId = this.tenantId(authentication);
    await this.ensureSite(siteId, organizationId, false);
    const schedule = await this.prisma.schedule.findFirst({
      where: {
        id,
        ...this.scheduleTenantWhere(organizationId),
        siteId,
      },
      select: this.scheduleSelect(organizationId),
    });
    if (!schedule) throw new NotFoundException('Schedule not found.');
    return schedule;
  }

  async create(
    createScheduleDto: CreateScheduleDto,
    authentication?: AuthenticationContext,
  ) {
    const organizationId = this.tenantId(authentication);
    if (organizationId && !createScheduleDto.siteId) {
      throw new BadRequestException('siteId is required for organization schedules.');
    }
    if (organizationId && createScheduleDto.siteId) {
      const site = await this.prisma.attendanceSite.findFirst({
        where: { id: createScheduleDto.siteId, organizationId, isActive: true },
        select: { id: true },
      });
      if (!site) throw new NotFoundException('Attendance site not found or inactive.');
    }
    this.assertValidScheduleWindow(
      createScheduleDto.startTime,
      createScheduleDto.endTime,
    );
    const defaults = this.attendanceSettings
      ? await this.attendanceSettings.resolveScheduleDefaults(
          authentication,
          createScheduleDto.siteId,
        )
      : {
          latenessMarginMinutes: 0,
          workDays: ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'],
        };

    try {
      return await this.prisma.schedule.create({
        data: {
          name: createScheduleDto.name,
          startTime: createScheduleDto.startTime,
          endTime: createScheduleDto.endTime,
          latenessMarginMinutes:
            createScheduleDto.latenessMarginMinutes ??
            defaults.latenessMarginMinutes,
          isActive: createScheduleDto.isActive ?? true,
          workDays: createScheduleDto.workDays ?? defaults.workDays,
          organizationId: organizationId ?? null,
          siteId: organizationId ? createScheduleDto.siteId : null,
          ...operationalScopeCreateData(organizationId),
        },
        select: this.scheduleSelect(organizationId),
      });
    } catch (error) {
      this.handlePersistenceError(error);
    }
  }

  async createForSite(
    siteId: string,
    payload: Omit<CreateScheduleDto, 'siteId'>,
    authentication: AuthenticationContext,
  ) {
    const organizationId = this.tenantId(authentication);
    await this.ensureSite(siteId, organizationId, true);
    return this.create({ ...payload, siteId }, authentication);
  }

  async update(
    id: string,
    updateScheduleDto: UpdateScheduleDto,
    authentication?: AuthenticationContext,
    expectedSiteId?: string,
  ) {
    const organizationId = this.tenantId(authentication);
    if (expectedSiteId) {
      await this.ensureSite(expectedSiteId, organizationId, true);
    }
    if ('siteId' in updateScheduleDto) {
      throw new BadRequestException('A schedule cannot be moved to another site.');
    }
    const existingSchedule = await this.ensureScheduleExists(
      id,
      organizationId,
      expectedSiteId,
    );
    const nextStartTime =
      updateScheduleDto.startTime ?? existingSchedule.startTime;
    const nextEndTime = updateScheduleDto.endTime ?? existingSchedule.endTime;

    this.assertValidScheduleWindow(nextStartTime, nextEndTime);

    try {
      return await this.prisma.schedule.update({
        where: { id },
        data: updateScheduleDto,
        select: this.scheduleSelect(organizationId),
      });
    } catch (error) {
      this.handlePersistenceError(error);
    }
  }

  async updateStatus(
    id: string,
    payload: UpdateScheduleStatusDto,
    authentication?: AuthenticationContext,
    expectedSiteId?: string,
  ) {
    const organizationId = this.tenantId(authentication);
    if (expectedSiteId) {
      await this.ensureSite(expectedSiteId, organizationId, true);
    }
    await this.ensureScheduleExists(id, organizationId, expectedSiteId);

    return this.prisma.schedule.update({
      where: {
        id,
      },
      data: {
        isActive: payload.isActive,
      },
      select: this.scheduleSelect(organizationId),
    });
  }

  private async ensureScheduleExists(
    id: string,
    organizationId?: string,
    expectedSiteId?: string,
  ) {
    const schedule = await this.prisma.schedule.findFirst({
      where: {
        id,
        ...this.scheduleTenantWhere(organizationId),
        ...(expectedSiteId ? { siteId: expectedSiteId } : {}),
      },
      select: {
        id: true,
        startTime: true,
        endTime: true,
      },
    });

    if (!schedule) {
      throw new NotFoundException('Schedule not found.');
    }

    return schedule;
  }

  private async ensureSite(
    siteId: string,
    organizationId: string | undefined,
    requireActive: boolean,
  ) {
    if (!organizationId) {
      throw new BadRequestException('A valid organization context is required.');
    }
    const site = await this.prisma.attendanceSite.findFirst({
      where: {
        id: siteId,
        organizationId,
        ...(requireActive ? { isActive: true } : {}),
      },
      select: { id: true },
    });
    if (!site) throw new NotFoundException('Attendance site not found or inactive.');
    return site;
  }

  private scheduleSelect(organizationId?: string) {
    return {
      ...scheduleSelect,
      employees: {
        where: organizationId
          ? { organizationId, v1ScopeStatus: 'OPERATIONAL' }
          : { organizationId: null, userId: null },
        select: publicEmployeeSelect,
      },
    } satisfies Prisma.ScheduleSelect;
  }

  private tenantId(authentication?: AuthenticationContext) {
    if (!authentication || authentication.generation === 'legacy') {
      return undefined;
    }

    if (
      authentication.purpose !== 'account' ||
      !authentication.organizationId
    ) {
      throw new BadRequestException(
        'A valid organization context is required.',
      );
    }

    return authentication.organizationId;
  }

  private scheduleTenantWhere(
    organizationId?: string,
  ): Prisma.ScheduleWhereInput {
    return scheduleOperationalWhere(organizationId);
  }

  private assertValidScheduleWindow(startTime: string, endTime: string) {
    const startValue = this.toMinutes(startTime);
    const endValue = this.toMinutes(endTime);

    if (endValue <= startValue) {
      throw new BadRequestException(
        'endTime must be later than startTime for the same schedule day.',
      );
    }
  }

  private toMinutes(time: string) {
    const [hours, minutes] = time.split(':').map(Number);

    return hours * 60 + minutes;
  }

  private handlePersistenceError(error: unknown): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002') {
        const target = error.meta?.target;
        const fields = Array.isArray(target)
          ? target
          : typeof target === 'string'
            ? [target]
            : [];

        throw new ConflictException(
          fields.includes('organizationId')
            ? 'Schedule name already exists in this organization.'
            : 'This schedule name is currently unavailable.',
        );
      }
    }

    throw error;
  }
}
