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
