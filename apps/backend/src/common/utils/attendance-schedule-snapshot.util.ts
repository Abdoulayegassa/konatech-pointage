import { Prisma } from '@prisma/client';
import {
  isScheduledOnDate,
  setTimeOnDate,
} from './attendance-date.util';

type ScheduleWorkDaysValue = Prisma.JsonValue | readonly string[];

export type AttendanceScheduleLike = {
  id: string;
  name: string;
  startTime: string;
  endTime: string;
  latenessMarginMinutes: number;
  isActive: boolean;
  workDays: ScheduleWorkDaysValue;
};

export type AttendanceScheduleSnapshotLike = {
  scheduleIdSnapshot?: string | null;
  scheduleNameSnapshot?: string | null;
  scheduleStartTimeSnapshot?: string | null;
  scheduleEndTimeSnapshot?: string | null;
  scheduleWorkDaysSnapshot?: ScheduleWorkDaysValue | null;
  scheduleLatenessMarginSnapshot?: number | null;
  scheduleCapturedAt?: Date | null;
};

export type ResolvedAttendanceSchedule = {
  source: 'snapshot' | 'current' | 'none';
  id: string | null;
  name: string | null;
  startTime: string | null;
  endTime: string | null;
  latenessMarginMinutes: number | null;
  workDays: ScheduleWorkDaysValue | null;
  capturedAt: Date | null;
};

export function buildAttendanceScheduleSnapshot(
  schedule: AttendanceScheduleLike | null,
  capturedAt: Date,
) {
  if (!schedule?.isActive) {
    return {
      scheduleIdSnapshot: null,
      scheduleNameSnapshot: null,
      scheduleStartTimeSnapshot: null,
      scheduleEndTimeSnapshot: null,
      scheduleWorkDaysSnapshot: Prisma.JsonNull,
      scheduleLatenessMarginSnapshot: null,
      scheduleCapturedAt: null,
    };
  }

  return {
    scheduleIdSnapshot: schedule.id,
    scheduleNameSnapshot: schedule.name,
    scheduleStartTimeSnapshot: schedule.startTime,
    scheduleEndTimeSnapshot: schedule.endTime,
    scheduleWorkDaysSnapshot: schedule.workDays as Prisma.InputJsonValue,
    scheduleLatenessMarginSnapshot: schedule.latenessMarginMinutes,
    scheduleCapturedAt: capturedAt,
  };
}

export function hasAttendanceScheduleSnapshot(
  attendance: AttendanceScheduleSnapshotLike,
) {
  return [
    attendance.scheduleIdSnapshot,
    attendance.scheduleNameSnapshot,
    attendance.scheduleStartTimeSnapshot,
    attendance.scheduleEndTimeSnapshot,
    attendance.scheduleWorkDaysSnapshot,
    attendance.scheduleLatenessMarginSnapshot,
  ].some((value) => value !== null && value !== undefined);
}

export function resolveAttendanceSchedule(
  attendance: AttendanceScheduleSnapshotLike,
  fallbackSchedule: AttendanceScheduleLike | null,
): ResolvedAttendanceSchedule {
  if (hasAttendanceScheduleSnapshot(attendance)) {
    return {
      source: 'snapshot',
      id: attendance.scheduleIdSnapshot ?? null,
      name: attendance.scheduleNameSnapshot ?? null,
      startTime: attendance.scheduleStartTimeSnapshot ?? null,
      endTime: attendance.scheduleEndTimeSnapshot ?? null,
      latenessMarginMinutes:
        attendance.scheduleLatenessMarginSnapshot ?? null,
      workDays: attendance.scheduleWorkDaysSnapshot ?? null,
      capturedAt: attendance.scheduleCapturedAt ?? null,
    };
  }

  if (fallbackSchedule?.isActive) {
    return {
      source: 'current',
      id: fallbackSchedule.id,
      name: fallbackSchedule.name,
      startTime: fallbackSchedule.startTime,
      endTime: fallbackSchedule.endTime,
      latenessMarginMinutes: fallbackSchedule.latenessMarginMinutes,
      workDays: fallbackSchedule.workDays,
      capturedAt: null,
    };
  }

  return {
    source: 'none',
    id: null,
    name: null,
    startTime: null,
    endTime: null,
    latenessMarginMinutes: null,
    workDays: null,
    capturedAt: null,
  };
}

export function isScheduledOnResolvedAttendanceDate(
  schedule: ResolvedAttendanceSchedule,
  date: Date,
) {
  if (!schedule.workDays) {
    return false;
  }

  return isScheduledOnDate(
    schedule.workDays as Parameters<typeof isScheduledOnDate>[0],
    date,
  );
}

export function getResolvedAttendanceScheduledExitTime(
  schedule: ResolvedAttendanceSchedule,
  date: Date,
) {
  if (!schedule.endTime || !isScheduledOnResolvedAttendanceDate(schedule, date)) {
    return null;
  }

  return setTimeOnDate(date, schedule.endTime);
}
