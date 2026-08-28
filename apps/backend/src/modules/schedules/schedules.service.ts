import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  publicEmployeeSelect,
  scheduleSelect,
} from '../../common/prisma/selects';
import { AuthenticationContext } from '../auth/interfaces/authentication-context.interface';
import { CreateScheduleDto } from './dto/create-schedule.dto';
import { UpdateScheduleDto } from './dto/update-schedule.dto';
import { UpdateScheduleStatusDto } from './dto/update-schedule-status.dto';

@Injectable()
export class SchedulesService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(authentication?: AuthenticationContext) {
    const organizationId = this.tenantId(authentication);
    return this.prisma.schedule.findMany({
      where: organizationId ? { organizationId } : undefined,
      select: this.scheduleSelect(organizationId),
      orderBy: [{ createdAt: 'desc' }, { name: 'asc' }],
    });
  }

  async findOne(id: string, authentication?: AuthenticationContext) {
    const organizationId = this.tenantId(authentication);
    const schedule = await this.prisma.schedule.findFirst({
      where: {
        id,
        ...(organizationId ? { organizationId } : {}),
      },
      select: this.scheduleSelect(organizationId),
    });

    if (!schedule) {
      throw new NotFoundException('Schedule not found.');
    }

    return schedule;
  }

  async create(
    createScheduleDto: CreateScheduleDto,
    authentication?: AuthenticationContext,
  ) {
    const organizationId = this.tenantId(authentication);
    this.assertValidScheduleWindow(
      createScheduleDto.startTime,
      createScheduleDto.endTime,
    );

    try {
      return await this.prisma.schedule.create({
        data: {
          name: createScheduleDto.name,
          startTime: createScheduleDto.startTime,
          endTime: createScheduleDto.endTime,
          latenessMarginMinutes: createScheduleDto.latenessMarginMinutes ?? 0,
          isActive: createScheduleDto.isActive ?? true,
          workDays: createScheduleDto.workDays,
          organizationId: organizationId ?? null,
        },
        select: this.scheduleSelect(organizationId),
      });
    } catch (error) {
      this.handlePersistenceError(error);
    }
  }

  async update(
    id: string,
    updateScheduleDto: UpdateScheduleDto,
    authentication?: AuthenticationContext,
  ) {
    const organizationId = this.tenantId(authentication);
    const existingSchedule = await this.ensureScheduleExists(id, organizationId);
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
  ) {
    const organizationId = this.tenantId(authentication);
    await this.ensureScheduleExists(id, organizationId);

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

  private async ensureScheduleExists(id: string, organizationId?: string) {
    const schedule = await this.prisma.schedule.findFirst({
      where: {
        id,
        ...(organizationId ? { organizationId } : {}),
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

  private scheduleSelect(organizationId?: string) {
    return {
      ...scheduleSelect,
      employees: {
        where: organizationId ? { organizationId } : undefined,
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
      throw new BadRequestException('A valid organization context is required.');
    }

    return authentication.organizationId;
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
        throw new ConflictException(
          'A schedule with the same name already exists.',
        );
      }
    }

    throw error;
  }
}
