import { Prisma } from '@prisma/client';

export const WEEKDAY_NAMES = [
  'SUNDAY',
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
  'SATURDAY',
] as const;

export const STANDARD_WORK_WEEK = [
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
] as const;

export const FULL_WORK_WEEK = [
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
  'SATURDAY',
  'SUNDAY',
] as const;

export type WorkDay = (typeof WEEKDAY_NAMES)[number];

export type LocalDateParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

export function isValidTimeZone(timeZone: string) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone }).format();
    return true;
  } catch {
    return false;
  }
}

export function getLocalDateParts(
  instant: Date,
  timeZone: string,
): LocalDateParts {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(instant);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value);

  return {
    year: value('year'),
    month: value('month'),
    day: value('day'),
    hour: value('hour'),
    minute: value('minute'),
    second: value('second'),
  };
}

/** Canonical database key for the calendar day containing an instant. */
export function getBusinessDate(instant: Date, timeZone: string) {
  const { year, month, day } = getLocalDateParts(instant, timeZone);
  return createAttendanceDate(year, month - 1, day);
}

export function formatBusinessMonth(instant: Date, timeZone: string) {
  const { year, month } = getLocalDateParts(instant, timeZone);
  return `${year}-${String(month).padStart(2, '0')}`;
}

/** Converts an organization-local wall time on a canonical date to UTC. */
export function localScheduleTimeToUtc(
  businessDate: Date,
  time: string,
  timeZone: string,
) {
  const [hour, minute] = time.split(':').map(Number);
  const desired = Date.UTC(
    businessDate.getUTCFullYear(),
    businessDate.getUTCMonth(),
    businessDate.getUTCDate(),
    hour,
    minute,
  );
  let candidate = new Date(desired);

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const actual = getLocalDateParts(candidate, timeZone);
    const actualAsUtc = Date.UTC(
      actual.year,
      actual.month - 1,
      actual.day,
      actual.hour,
      actual.minute,
    );
    const delta = desired - actualAsUtc;
    if (delta === 0) return candidate;
    candidate = new Date(candidate.getTime() + delta);
  }

  return candidate;
}

export function normalizeAttendanceDate(date: Date) {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}

export function getWeekdayName(date: Date): WorkDay {
  return WEEKDAY_NAMES[date.getUTCDay()] as WorkDay;
}

export function isScheduledOnDate(
  workDays: Prisma.JsonValue | readonly WorkDay[],
  date: Date,
) {
  if (!Array.isArray(workDays)) {
    return false;
  }

  const weekday = getWeekdayName(date);

  return workDays.some(
    (day) => typeof day === 'string' && day.toUpperCase() === weekday,
  );
}

export function setTimeOnDate(date: Date, time: string) {
  const [hours, minutes] = time.split(':').map(Number);
  const result = normalizeAttendanceDate(date);

  result.setUTCHours(hours, minutes, 0, 0);

  return result;
}

export function createAttendanceDate(
  year: number,
  monthIndex: number,
  day: number,
) {
  return new Date(Date.UTC(year, monthIndex, day));
}

export function parseAttendanceDateKey(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = createAttendanceDate(year, month - 1, day);
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return date;
}

export function addAttendanceDays(date: Date, days: number) {
  const result = new Date(date);

  result.setUTCDate(result.getUTCDate() + days);

  return result;
}

export function addAttendanceMonths(date: Date, months: number) {
  const result = new Date(date);

  result.setUTCMonth(result.getUTCMonth() + months);

  return result;
}

export function getAttendanceMonthRangeFromDate(referenceDate: Date) {
  const start = createAttendanceDate(
    referenceDate.getUTCFullYear(),
    referenceDate.getUTCMonth(),
    1,
  );

  return {
    start,
    end: addAttendanceMonths(start, 1),
  };
}

export function getAttendanceMonthRange(year: number, month: number) {
  const start = createAttendanceDate(year, month - 1, 1);

  return {
    startOfMonth: start,
    endOfMonth: createAttendanceDate(year, month, 1),
  };
}

export function formatAttendanceMonth(date: Date) {
  return `${date.getUTCFullYear()}-${`${date.getUTCMonth() + 1}`.padStart(2, '0')}`;
}

export function findPreviousScheduledDate(
  referenceDate: Date,
  workDays: readonly WorkDay[],
) {
  const cursor = normalizeAttendanceDate(referenceDate);

  do {
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  } while (!workDays.includes(getWeekdayName(cursor)));

  return normalizeAttendanceDate(cursor);
}
