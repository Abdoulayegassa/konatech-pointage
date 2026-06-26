import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CalendarEntryType as PrismaCalendarEntryType, Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { getAttendanceMonthRange, normalizeAttendanceDate } from '../../common/utils/attendance-date.util';
import {
  CalendarDayRecord,
  CalendarDayType,
  CalendarEntryRecord,
  CalendarMonthResponse,
  CalendarSummary,
} from './calendar.types';
import { CreateCalendarEntryDto } from './dto/create-calendar-entry.dto';
import { UpdateCalendarEntryDto } from './dto/update-calendar-entry.dto';

type CalendarEntryWithEmployee = Prisma.CalendarEntryGetPayload<{
  select: {
    id: true;
    name: true;
    description: true;
    date: true;
    type: true;
    employeeId: true;
    isActive: true;
    employee: {
      select: {
        employeeIdentifier: true;
        firstName: true;
        lastName: true;
        department: true;
      };
    };
  };
}>;

@Injectable()
/**
 * SOURCE OF TRUTH
 * HR calendar engine.
 *
 * Weekend, public holiday, company holiday, and employee event handling lives
 * here. Monthly absence calculations must use this service for non-working-day
 * exclusion.
 */
export class CalendarService {
  constructor(private readonly prisma: PrismaService) {}

  async getMonthOverview(month?: string): Promise<CalendarMonthResponse> {
    const { monthLabel, monthKey, startOfMonth, endOfMonth } =
      this.resolveMonthWindow(month);
    const entries = await this.prisma.calendarEntry.findMany({
      where: {
        date: {
          gte: startOfMonth,
          lt: endOfMonth,
        },
      },
      orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
      select: this.calendarEntrySelect,
    });
    const normalizedEntries = entries
      .filter((entry) => entry.isActive)
      .map((entry) => this.mapEntry(entry));
    const entriesByDay = new Map<string, CalendarEntryRecord[]>();

    for (const entry of normalizedEntries) {
      const key = entry.date;
      const bucket = entriesByDay.get(key) ?? [];

      bucket.push(entry);
      entriesByDay.set(key, bucket);
    }

    const days: CalendarDayRecord[] = [];
    const summary: CalendarSummary = {
      workingDays: 0,
      weekends: 0,
      publicHolidays: 0,
      companyHolidays: 0,
    };

    const cursor = new Date(startOfMonth);

    while (cursor < endOfMonth) {
      const currentDate = normalizeAttendanceDate(cursor);
      const currentKey = currentDate.toISOString();
      const dayEntries = entriesByDay.get(currentKey) ?? [];
      const dayType = this.resolveDayType(currentDate, dayEntries);
      const label = this.resolveDayLabel(dayType, dayEntries);

      if (dayType === 'WORKING_DAY') {
        summary.workingDays += 1;
      } else if (dayType === 'WEEKEND') {
        summary.weekends += 1;
      } else if (dayType === 'PUBLIC_HOLIDAY') {
        summary.publicHolidays += 1;
      } else if (dayType === 'COMPANY_HOLIDAY') {
        summary.companyHolidays += 1;
      }

      days.push({
        date: currentKey,
        dayLabel: this.formatWeekdayLabel(currentDate),
        isoWeekLabel: this.formatIsoWeekLabel(currentDate),
        type: dayType,
        label,
        description: dayEntries[0]?.description ?? null,
        isNonWorkingDay: dayType !== 'WORKING_DAY',
        entries: dayEntries,
      });

      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }

    return {
      month: monthKey,
      monthLabel,
      summary,
      days,
      entries: normalizedEntries,
    };
  }

  async findMonthEntries(month?: string) {
    const { startOfMonth, endOfMonth } = this.resolveMonthWindow(month);

    return this.prisma.calendarEntry.findMany({
      where: {
        date: {
          gte: startOfMonth,
          lt: endOfMonth,
        },
      },
      orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
      select: this.calendarEntrySelect,
    });
  }

  async getNonWorkingDateKeys(start: Date, end: Date) {
    const entries = await this.prisma.calendarEntry.findMany({
      where: {
        isActive: true,
        type: {
          in: ['PUBLIC_HOLIDAY', 'COMPANY_HOLIDAY'],
        },
        date: {
          gte: start,
          lt: end,
        },
      },
      orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
      select: this.calendarEntrySelect,
    });
    const entriesByDay = new Map<string, CalendarEntryRecord[]>();

    for (const entry of entries.map((item) => this.mapEntry(item))) {
      const bucket = entriesByDay.get(entry.date) ?? [];

      bucket.push(entry);
      entriesByDay.set(entry.date, bucket);
    }

    const nonWorkingDateKeys = new Set<number>();
    const cursor = new Date(start);

    while (cursor < end) {
      const currentDate = normalizeAttendanceDate(cursor);
      const currentKey = currentDate.toISOString();
      const dayType = this.resolveDayType(
        currentDate,
        entriesByDay.get(currentKey) ?? [],
      );

      if (
        dayType === 'WEEKEND' ||
        dayType === 'PUBLIC_HOLIDAY' ||
        dayType === 'COMPANY_HOLIDAY'
      ) {
        nonWorkingDateKeys.add(currentDate.getTime());
      }

      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }

    return nonWorkingDateKeys;
  }

  async isNonWorkingDay(date: Date) {
    const normalizedDate = normalizeAttendanceDate(date);
    const nextDate = new Date(normalizedDate);

    nextDate.setUTCDate(nextDate.getUTCDate() + 1);

    return (
      await this.getNonWorkingDateKeys(normalizedDate, nextDate)
    ).has(normalizedDate.getTime());
  }

  async create(payload: CreateCalendarEntryDto) {
    const date = this.parseCalendarDate(payload.date);

    await this.ensureNoDuplicateEntry(date, payload.type);

    try {
      return this.prisma.calendarEntry.create({
        data: {
          name: payload.name.trim(),
          date,
          description: payload.description?.trim() || null,
          type: payload.type as PrismaCalendarEntryType,
          isActive: true,
        },
        select: this.calendarEntrySelect,
      });
    } catch (error) {
      this.handleKnownPersistenceError(error);
    }
  }

  async update(id: string, payload: UpdateCalendarEntryDto) {
    const existing = await this.ensureEntryExists(id);
    const nextDate = payload.date ? this.parseCalendarDate(payload.date) : existing.date;
    const nextType = payload.type
      ? (payload.type as PrismaCalendarEntryType)
      : existing.type;

    await this.ensureNoDuplicateEntry(nextDate, nextType, id);

    try {
      return this.prisma.calendarEntry.update({
        where: { id },
        data: {
          ...(payload.name !== undefined ? { name: payload.name.trim() } : {}),
          ...(payload.date !== undefined ? { date: nextDate } : {}),
          ...(payload.description !== undefined
            ? { description: payload.description?.trim() || null }
            : {}),
          ...(payload.type !== undefined ? { type: nextType } : {}),
        },
        select: this.calendarEntrySelect,
      });
    } catch (error) {
      this.handleKnownPersistenceError(error);
    }
  }

  async remove(id: string) {
    await this.ensureEntryExists(id);

    return this.prisma.calendarEntry.delete({
      where: { id },
      select: this.calendarEntrySelect,
    });
  }

  private readonly calendarEntrySelect = {
    id: true,
    name: true,
    description: true,
    date: true,
    type: true,
    employeeId: true,
    isActive: true,
    employee: {
      select: {
        employeeIdentifier: true,
        firstName: true,
        lastName: true,
        department: true,
      },
    },
  } satisfies Prisma.CalendarEntrySelect;

  private mapEntry(entry: CalendarEntryWithEmployee): CalendarEntryRecord {
    const employeeName = entry.employee
      ? `${entry.employee.firstName} ${entry.employee.lastName}`
      : null;

    return {
      id: entry.id,
      name: entry.name,
      description: entry.description,
      date: this.normalizeDateKey(entry.date),
      type: entry.type as PrismaCalendarEntryType,
      employeeId: entry.employeeId,
      employeeIdentifier: entry.employee?.employeeIdentifier ?? null,
      employeeName,
      department: entry.employee?.department ?? null,
      isActive: entry.isActive,
    };
  }

  private resolveDayType(date: Date, entries: CalendarEntryRecord[]) {
    if (
      entries.some((entry) => entry.type === 'PUBLIC_HOLIDAY')
    ) {
      return 'PUBLIC_HOLIDAY';
    }

    if (
      entries.some((entry) => entry.type === 'COMPANY_HOLIDAY')
    ) {
      return 'COMPANY_HOLIDAY';
    }

    if (entries.some((entry) => entry.type === 'LEAVE')) {
      return 'LEAVE';
    }

    if (entries.some((entry) => entry.type === 'EXTERNAL_MISSION')) {
      return 'EXTERNAL_MISSION';
    }

    return date.getUTCDay() === 0 || date.getUTCDay() === 6
      ? 'WEEKEND'
      : 'WORKING_DAY';
  }

  private resolveDayLabel(dayType: CalendarDayType, entries: CalendarEntryRecord[]) {
    const firstEntry = entries[0];

    if (firstEntry?.name) {
      return firstEntry.name;
    }

    if (dayType === 'PUBLIC_HOLIDAY') {
      return 'Jour férié public';
    }

    if (dayType === 'COMPANY_HOLIDAY') {
      return 'Jour férié entreprise';
    }

    if (dayType === 'LEAVE') {
      return 'Congé';
    }

    if (dayType === 'EXTERNAL_MISSION') {
      return 'Mission externe';
    }

    if (dayType === 'WEEKEND') {
      return 'Week-end';
    }

    return 'Jour travaillé';
  }

  private formatWeekdayLabel(date: Date) {
    return date.toLocaleDateString('fr-FR', {
      weekday: 'long',
    });
  }

  private formatIsoWeekLabel(date: Date) {
    const day = date.getUTCDay() === 0 ? 7 : date.getUTCDay();
    const monday = new Date(date);
    monday.setUTCDate(date.getUTCDate() - day + 1);

    return monday.toISOString().slice(0, 10);
  }

  private normalizeDateKey(date: Date) {
    return normalizeAttendanceDate(date).toISOString();
  }

  private parseCalendarDate(value: string) {
    const parsed = new Date(value);

    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException('date must be a valid ISO date string.');
    }

    return normalizeAttendanceDate(parsed);
  }

  private resolveMonthWindow(month?: string) {
    const monthKey = month ?? this.formatCurrentMonth();

    if (!/^\d{4}-\d{2}$/.test(monthKey)) {
      throw new BadRequestException('month must be in YYYY-MM format.');
    }

    const [year, monthIndex] = monthKey.split('-').map(Number);
    const { startOfMonth, endOfMonth } = getAttendanceMonthRange(year, monthIndex);

    return {
      monthKey,
      monthLabel: new Date(`${monthKey}-01T00:00:00.000Z`).toLocaleDateString(
        'fr-FR',
        {
          month: 'long',
          year: 'numeric',
        },
      ),
      startOfMonth,
      endOfMonth,
    };
  }

  private formatCurrentMonth() {
    const now = new Date();

    return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(
      2,
      '0',
    )}`;
  }

  private async ensureEntryExists(id: string) {
    const entry = await this.prisma.calendarEntry.findUnique({
      where: { id },
      select: {
        id: true,
        date: true,
        type: true,
      },
    });

    if (!entry) {
      throw new NotFoundException('Calendar entry not found.');
    }

    return entry;
  }

  private async ensureNoDuplicateEntry(
    date: Date,
    type: PrismaCalendarEntryType,
    excludedId?: string,
  ) {
    const duplicate = await this.prisma.calendarEntry.findFirst({
      where: {
        date,
        type,
        ...(excludedId
          ? {
              NOT: {
                id: excludedId,
              },
            }
          : {}),
      },
      select: {
        id: true,
      },
    });

    if (duplicate) {
      throw new ConflictException(
        'A calendar entry already exists for this date and type.',
      );
    }
  }

  private handleKnownPersistenceError(error: unknown): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002') {
        throw new ConflictException(
          'A calendar entry with the same unique constraint already exists.',
        );
      }
    }

    throw error;
  }
}
