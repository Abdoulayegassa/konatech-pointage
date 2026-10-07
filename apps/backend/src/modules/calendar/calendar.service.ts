import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import {
  CalendarEntryType as PrismaCalendarEntryType,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  calendarOperationalWhere,
  operationalScopeCreateData,
} from '../../common/prisma/operational-scope';
import {
  getAttendanceMonthRange,
  formatBusinessMonth,
  normalizeAttendanceDate,
  parseAttendanceDateKey,
} from '../../common/utils/attendance-date.util';
import {
  CalendarDayRecord,
  CalendarDayType,
  CalendarEntryRecord,
  CalendarMonthResponse,
  CalendarSummary,
} from './calendar.types';
import { CreateCalendarEntryDto } from './dto/create-calendar-entry.dto';
import { UpdateCalendarEntryDto } from './dto/update-calendar-entry.dto';
import { AuthenticationContext } from '../auth/interfaces/authentication-context.interface';
import { OrganizationTimezoneService } from '../../common/time/organization-timezone.service';

type CalendarEntryWithEmployee = Prisma.CalendarEntryGetPayload<{
  select: {
    id: true;
    name: true;
    description: true;
    date: true;
    type: true;
    employeeId: true;
    siteId: true;
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
  constructor(
    private readonly prisma: PrismaService,
    @Optional()
    private readonly organizationTimezones?: OrganizationTimezoneService,
  ) {}

  async getMonthOverview(
    month?: string,
    authentication?: AuthenticationContext,
  ): Promise<CalendarMonthResponse> {
    const organizationId = this.tenantId(authentication);
    const timezone = await this.resolveTimezone(authentication);
    const { monthLabel, monthKey, startOfMonth, endOfMonth } =
      this.resolveMonthWindow(month, timezone);
    const entries = await this.prisma.calendarEntry.findMany({
      where: {
        ...this.tenantWhere(organizationId),
        siteId: null,
        employeeId: null,
        type: { in: ['PUBLIC_HOLIDAY', 'COMPANY_HOLIDAY'] },
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

  async findMonthEntries(
    month?: string,
    authentication?: AuthenticationContext,
  ) {
    const organizationId = this.tenantId(authentication);
    const timezone = await this.resolveTimezone(authentication);
    const { startOfMonth, endOfMonth } = this.resolveMonthWindow(
      month,
      timezone,
    );

    return this.prisma.calendarEntry.findMany({
      where: {
        ...this.tenantWhere(organizationId),
        siteId: null,
        ...this.holidayWhere(),
        date: {
          gte: startOfMonth,
          lt: endOfMonth,
        },
      },
      orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
      select: this.calendarEntrySelect,
    });
  }

  async getSiteMonthOverview(
    siteId: string,
    month: string | undefined,
    authentication?: AuthenticationContext,
  ): Promise<CalendarMonthResponse & { site: { id: string; name: string; isActive: boolean } }> {
    const organizationId = this.tenantId(authentication);
    const site = await this.resolveSite(siteId, organizationId);
    const timezone = await this.resolveTimezone(authentication);
    const { monthLabel, monthKey, startOfMonth, endOfMonth } =
      this.resolveMonthWindow(month, timezone);
    const entries = await this.prisma.calendarEntry.findMany({
      where: {
        ...this.tenantWhere(organizationId),
        employeeId: null,
        isActive: true,
        type: { in: ['PUBLIC_HOLIDAY', 'COMPANY_HOLIDAY'] },
        date: { gte: startOfMonth, lt: endOfMonth },
        OR: [{ siteId: null }, { siteId }],
      },
      orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
      select: this.calendarEntrySelect,
    });
    const normalizedEntries = entries.map((entry) => ({
      ...this.mapEntry(entry),
      inherited: entry.siteId === null,
    }));
    const entriesByDay = new Map<string, CalendarEntryRecord[]>();
    for (const entry of normalizedEntries) {
      const bucket = entriesByDay.get(entry.date) ?? [];
      bucket.push(entry);
      entriesByDay.set(entry.date, bucket);
    }
    const days: CalendarDayRecord[] = [];
    const summary: CalendarSummary = { workingDays: 0, weekends: 0, publicHolidays: 0, companyHolidays: 0 };
    const cursor = new Date(startOfMonth);
    while (cursor < endOfMonth) {
      const date = normalizeAttendanceDate(cursor);
      const key = date.toISOString();
      const dayEntries = entriesByDay.get(key) ?? [];
      const type = this.resolveDayType(date, dayEntries);
      if (type === 'WORKING_DAY') summary.workingDays += 1;
      else if (type === 'WEEKEND') summary.weekends += 1;
      else if (type === 'PUBLIC_HOLIDAY') summary.publicHolidays += 1;
      else if (type === 'COMPANY_HOLIDAY') summary.companyHolidays += 1;
      days.push({
        date: key,
        dayLabel: this.formatWeekdayLabel(date),
        isoWeekLabel: this.formatIsoWeekLabel(date),
        type,
        label: this.resolveDayLabel(type, dayEntries),
        description: dayEntries[0]?.description ?? null,
        isNonWorkingDay: type !== 'WORKING_DAY',
        entries: dayEntries,
      });
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    return { month: monthKey, monthLabel, site: { id: site.id, name: site.name, isActive: site.isActive }, summary, days, entries: normalizedEntries };
  }

  async createForSite(siteId: string, payload: CreateCalendarEntryDto, authentication?: AuthenticationContext) {
    const organizationId = this.tenantId(authentication);
    this.assertNoClientTenantReferences(payload);
    await this.resolveSite(siteId, organizationId, true);
    const date = this.parseCalendarDate(payload.date, authentication);
    await this.ensureNoDuplicateEntry(date, undefined, organizationId, siteId);
    try {
      return await this.prisma.calendarEntry.create({
        data: {
          name: payload.name.trim(), date,
          description: payload.description?.trim() || null,
          type: payload.type as PrismaCalendarEntryType,
          organizationId: organizationId ?? null,
          siteId,
          ...operationalScopeCreateData(organizationId),
          isActive: true,
        },
        select: this.calendarEntrySelect,
      });
    } catch (error) {
      this.handleKnownPersistenceError(error);
    }
  }

  async updateForSite(siteId: string, id: string, payload: UpdateCalendarEntryDto, authentication?: AuthenticationContext) {
    const organizationId = this.tenantId(authentication);
    this.assertNoClientTenantReferences(payload);
    await this.resolveSite(siteId, organizationId, true);
    const existing = await this.ensureHolidayExists(id, organizationId, siteId);
    const nextDate = payload.date ? this.parseCalendarDate(payload.date, authentication) : existing.date;
    const nextType = payload.type ? payload.type as PrismaCalendarEntryType : existing.type;
    await this.ensureNoDuplicateEntry(nextDate, id, organizationId, siteId);
    try {
      return await this.prisma.calendarEntry.update({
        where: { id },
        data: {
          ...(payload.name !== undefined ? { name: payload.name.trim() } : {}),
          ...(payload.date !== undefined ? { date: nextDate } : {}),
          ...(payload.description !== undefined ? { description: payload.description?.trim() || null } : {}),
          ...(payload.type !== undefined ? { type: nextType } : {}),
        },
        select: this.calendarEntrySelect,
      });
    } catch (error) {
      this.handleKnownPersistenceError(error);
    }
  }

  async removeForSite(siteId: string, id: string, authentication?: AuthenticationContext) {
    const organizationId = this.tenantId(authentication);
    await this.resolveSite(siteId, organizationId, true);
    await this.ensureHolidayExists(id, organizationId, siteId);
    return this.prisma.calendarEntry.delete({ where: { id }, select: this.calendarEntrySelect });
  }

  async getNonWorkingDateKeys(
    start: Date,
    end: Date,
    authentication?: AuthenticationContext,
    siteId?: string,
  ) {
    const organizationId = this.tenantId(authentication);
    if (siteId) await this.resolveSite(siteId, organizationId);
    return this.queryNonWorkingDateKeys(start, end, organizationId, siteId);
  }

  getNonWorkingDateKeysForOrganization(
    start: Date,
    end: Date,
    organizationId: string,
  ) {
    if (!organizationId) {
      throw new BadRequestException(
        'A valid organization context is required.',
      );
    }

    return this.queryNonWorkingDateKeys(start, end, organizationId);
  }

  async getNonWorkingDateKeysForEmployee(
    start: Date,
    end: Date,
    employeeId: string,
    authentication?: AuthenticationContext,
  ) {
    const organizationId = this.tenantId(authentication);
    if (!organizationId) return this.queryNonWorkingDateKeys(start, end);
    return this.queryEmployeeNonWorkingDateKeys(start, end, employeeId, organizationId);
  }

  getNonWorkingDateKeysForEmployeeInOrganization(
    start: Date,
    end: Date,
    employeeId: string,
    organizationId: string,
  ) {
    if (!organizationId || !employeeId) {
      throw new BadRequestException('A valid employee and organization context are required.');
    }
    return this.queryEmployeeNonWorkingDateKeys(start, end, employeeId, organizationId);
  }

  private async queryEmployeeNonWorkingDateKeys(
    start: Date,
    end: Date,
    employeeId: string,
    organizationId: string,
  ) {
    const assignments = await this.prisma.employeeSiteAssignment.findMany({
      where: {
        organizationId, employeeId,
        effectiveFrom: { lt: end },
        OR: [{ effectiveTo: null }, { effectiveTo: { gt: start } }],
      },
      select: { siteId: true, effectiveFrom: true, effectiveTo: true },
      orderBy: { effectiveFrom: 'asc' },
    });
    const siteIds = [...new Set(assignments.map((item) => item.siteId))];
    const entries = await this.prisma.calendarEntry.findMany({
      where: {
        ...this.tenantWhere(organizationId), employeeId: null, isActive: true,
        type: { in: ['PUBLIC_HOLIDAY', 'COMPANY_HOLIDAY'] },
        date: { gte: start, lt: end },
        OR: [{ siteId: null }, { siteId: { in: siteIds } }],
      },
      select: { date: true, siteId: true },
    });
    const globalDates = new Set<number>();
    const localDates = new Map<string, Set<number>>();
    for (const entry of entries) {
      const key = normalizeAttendanceDate(entry.date).getTime();
      if (entry.siteId === null) globalDates.add(key);
      else {
        const dates = localDates.get(entry.siteId) ?? new Set<number>();
        dates.add(key);
        localDates.set(entry.siteId, dates);
      }
    }
    const result = new Set<number>();
    const cursor = new Date(start);
    while (cursor < end) {
      const date = normalizeAttendanceDate(cursor);
      const key = date.getTime();
      const assignment = assignments.find((item) =>
        item.effectiveFrom <= date && (!item.effectiveTo || item.effectiveTo > date),
      );
      if (
        date.getUTCDay() === 0 || date.getUTCDay() === 6 || globalDates.has(key) ||
        Boolean(assignment && localDates.get(assignment.siteId)?.has(key))
      ) result.add(key);
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    return result;
  }

  private async queryNonWorkingDateKeys(
    start: Date,
    end: Date,
    organizationId?: string,
    siteId?: string,
  ) {
    const entries = await this.prisma.calendarEntry.findMany({
      where: {
        ...this.tenantWhere(organizationId),
        ...(siteId ? { OR: [{ siteId: null }, { siteId }] } : { siteId: null }),
        employeeId: null,
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

  async isNonWorkingDay(date: Date, authentication?: AuthenticationContext, siteId?: string) {
    const normalizedDate = normalizeAttendanceDate(date);
    const nextDate = new Date(normalizedDate);

    nextDate.setUTCDate(nextDate.getUTCDate() + 1);

    return (
      await this.getNonWorkingDateKeys(normalizedDate, nextDate, authentication, siteId)
    ).has(normalizedDate.getTime());
  }

  async create(
    payload: CreateCalendarEntryDto,
    authentication?: AuthenticationContext,
  ) {
    const organizationId = this.tenantId(authentication);
    this.assertNoClientTenantReferences(payload);
    const date = this.parseCalendarDate(payload.date, authentication);

    await this.ensureNoDuplicateEntry(date, undefined, organizationId);

    try {
      const entry = await this.prisma.calendarEntry.create({
        data: {
          name: payload.name.trim(),
          date,
          description: payload.description?.trim() || null,
          type: payload.type as PrismaCalendarEntryType,
          organizationId: organizationId ?? null,
          siteId: null,
          ...operationalScopeCreateData(organizationId),
          isActive: true,
        },
        select: this.calendarEntrySelect,
      });
      return entry;
    } catch (error) {
      this.handleKnownPersistenceError(error);
    }
  }

  async update(
    id: string,
    payload: UpdateCalendarEntryDto,
    authentication?: AuthenticationContext,
  ) {
    const organizationId = this.tenantId(authentication);
    this.assertNoClientTenantReferences(payload);
    const existing = await this.ensureHolidayExists(id, organizationId);
    const nextDate = payload.date
      ? this.parseCalendarDate(payload.date, authentication)
      : existing.date;
    const nextType = payload.type
      ? (payload.type as PrismaCalendarEntryType)
      : existing.type;

    await this.ensureNoDuplicateEntry(nextDate, id, organizationId);

    try {
      const entry = await this.prisma.calendarEntry.update({
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
      return entry;
    } catch (error) {
      this.handleKnownPersistenceError(error);
    }
  }

  async remove(id: string, authentication?: AuthenticationContext) {
    const organizationId = this.tenantId(authentication);
    await this.ensureHolidayExists(id, organizationId);

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
    siteId: true,
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
      siteId: entry.siteId,
      scope: entry.siteId ? 'SITE' : 'ORGANIZATION',
      inherited: false,
    };
  }

  private resolveDayType(date: Date, entries: CalendarEntryRecord[]) {
    if (entries.some((entry) => entry.type === 'PUBLIC_HOLIDAY')) {
      return 'PUBLIC_HOLIDAY';
    }

    if (entries.some((entry) => entry.type === 'COMPANY_HOLIDAY')) {
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

  private resolveDayLabel(
    dayType: CalendarDayType,
    entries: CalendarEntryRecord[],
  ) {
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

  private parseCalendarDate(
    value: string,
    authentication?: AuthenticationContext,
  ) {
    if (authentication?.generation === 'saas') {
      const explicitDateKey = parseAttendanceDateKey(value);
      const legacyIsoDateKey = Number.isNaN(Date.parse(value))
        ? null
        : parseAttendanceDateKey(value.slice(0, 10));
      const date = explicitDateKey ?? legacyIsoDateKey;
      if (!date) {
        throw new BadRequestException(
          'date must use YYYY-MM-DD or a valid ISO date-time format.',
        );
      }
      return date;
    }
    const parsed = new Date(value);

    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException('date must be a valid ISO date string.');
    }

    return normalizeAttendanceDate(parsed);
  }

  private resolveMonthWindow(month?: string, timezone = 'UTC') {
    const monthKey = month ?? formatBusinessMonth(new Date(), timezone);

    if (!/^\d{4}-\d{2}$/.test(monthKey)) {
      throw new BadRequestException('month must be in YYYY-MM format.');
    }

    const [year, monthIndex] = monthKey.split('-').map(Number);
    const { startOfMonth, endOfMonth } = getAttendanceMonthRange(
      year,
      monthIndex,
    );

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

  private resolveTimezone(authentication?: AuthenticationContext) {
    return (
      this.organizationTimezones ?? new OrganizationTimezoneService(this.prisma)
    ).resolve(authentication);
  }

  private async ensureHolidayExists(id: string, organizationId?: string, siteId?: string) {
    const entry = await this.prisma.calendarEntry.findFirst({
      where: {
        id,
        ...this.tenantWhere(organizationId),
        siteId: siteId ?? null,
        ...this.holidayWhere(),
      },
      select: {
        id: true,
        date: true,
        type: true,
      },
    });

    if (!entry) {
      throw new NotFoundException('Holiday not found.');
    }

    return entry;
  }

  private async ensureNoDuplicateEntry(
    date: Date,
    excludedId?: string,
    organizationId?: string,
    siteId?: string,
  ) {
    const duplicate = await this.prisma.calendarEntry.findFirst({
      where: {
        ...this.tenantWhere(organizationId),
        siteId: siteId ?? null,
        date,
        type: {
          in: [
            PrismaCalendarEntryType.PUBLIC_HOLIDAY,
            PrismaCalendarEntryType.COMPANY_HOLIDAY,
          ],
        },
        employeeId: null,
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
        'A holiday already exists for this organization and date.',
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

  private tenantWhere(organizationId?: string): Prisma.CalendarEntryWhereInput {
    return calendarOperationalWhere(organizationId);
  }

  private async resolveSite(siteId: string, organizationId?: string, requireActive = false) {
    if (!organizationId) throw new BadRequestException('A valid organization context is required.');
    const site = await this.prisma.attendanceSite.findFirst({
      where: { id: siteId, organizationId, ...(requireActive ? { isActive: true } : {}) },
      select: { id: true, name: true, isActive: true },
    });
    if (!site) throw new NotFoundException('Attendance site not found.');
    return site;
  }

  private holidayWhere(): Prisma.CalendarEntryWhereInput {
    return {
      employeeId: null,
      type: {
        in: [
          PrismaCalendarEntryType.PUBLIC_HOLIDAY,
          PrismaCalendarEntryType.COMPANY_HOLIDAY,
        ],
      },
    };
  }

  private assertNoClientTenantReferences(payload: object) {
    const unsafePayload = payload as Record<string, unknown>;

    if (
      Object.hasOwn(unsafePayload, 'organizationId') ||
      Object.hasOwn(unsafePayload, 'siteId') ||
      Object.hasOwn(unsafePayload, 'employeeId') ||
      Object.hasOwn(unsafePayload, 'scheduleId')
    ) {
      throw new BadRequestException(
        'Calendar tenant and relationship identifiers are server-controlled.',
      );
    }
  }
}
