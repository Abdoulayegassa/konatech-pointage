import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { scheduleWithEmployeesSelect } from '../../common/prisma/selects';
import { CreateScheduleDto } from './dto/create-schedule.dto';
import { UpdateScheduleDto } from './dto/update-schedule.dto';
import { UpdateScheduleStatusDto } from './dto/update-schedule-status.dto';

@Injectable()
export class SchedulesService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.schedule.findMany({
      select: scheduleWithEmployeesSelect,
      orderBy: [{ createdAt: 'desc' }, { name: 'asc' }],
    });
  }

  async findOne(id: string) {
    const schedule = await this.prisma.schedule.findUnique({
      where: {
        id,
      },
      select: scheduleWithEmployeesSelect,
    });

    if (!schedule) {
      throw new NotFoundException('Schedule not found.');
    }

    return schedule;
  }

  async create(createScheduleDto: CreateScheduleDto) {
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
        },
        select: scheduleWithEmployeesSelect,
      });
    } catch (error) {
      this.handlePersistenceError(error);
    }
  }

  async update(id: string, updateScheduleDto: UpdateScheduleDto) {
    const existingSchedule = await this.ensureScheduleExists(id);
    const nextStartTime =
      updateScheduleDto.startTime ?? existingSchedule.startTime;
    const nextEndTime = updateScheduleDto.endTime ?? existingSchedule.endTime;

    this.assertValidScheduleWindow(nextStartTime, nextEndTime);

    try {
      return await this.prisma.schedule.update({
        where: { id },
        data: updateScheduleDto,
        select: scheduleWithEmployeesSelect,
      });
    } catch (error) {
      this.handlePersistenceError(error);
    }
  }

  async updateStatus(id: string, payload: UpdateScheduleStatusDto) {
    await this.ensureScheduleExists(id);

    return this.prisma.schedule.update({
      where: {
        id,
      },
      data: {
        isActive: payload.isActive,
      },
      select: scheduleWithEmployeesSelect,
    });
  }

  private async ensureScheduleExists(id: string) {
    const schedule = await this.prisma.schedule.findUnique({
      where: {
        id,
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
