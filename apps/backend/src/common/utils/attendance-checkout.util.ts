export type AttendanceCheckOutOutcome = {
  scheduledExitTime: Date | null;
  earlyExit: boolean;
  earlyExitMinutes: number;
  overtimeMinutes: number;
  overtimeHours: number;
  lateExit: boolean;
};

export function getAttendanceCheckOutOutcome(
  scheduledExitTime: Date | null,
  clockOutAt: Date | null,
): AttendanceCheckOutOutcome {
  if (!scheduledExitTime || !clockOutAt) {
    return {
      scheduledExitTime,
      earlyExit: false,
      earlyExitMinutes: 0,
      overtimeMinutes: 0,
      overtimeHours: 0,
      lateExit: false,
    };
  }

  const deltaMilliseconds = clockOutAt.getTime() - scheduledExitTime.getTime();

  if (deltaMilliseconds < 0) {
    return {
      scheduledExitTime,
      earlyExit: true,
      earlyExitMinutes: Math.round(Math.abs(deltaMilliseconds) / 60000),
      overtimeMinutes: 0,
      overtimeHours: 0,
      lateExit: false,
    };
  }

  if (deltaMilliseconds === 0) {
    return {
      scheduledExitTime,
      earlyExit: false,
      earlyExitMinutes: 0,
      overtimeMinutes: 0,
      overtimeHours: 0,
      lateExit: false,
    };
  }

  const overtimeMinutes = Math.round(deltaMilliseconds / 60000);

  return {
    scheduledExitTime,
    earlyExit: false,
    earlyExitMinutes: 0,
    overtimeMinutes,
    overtimeHours: roundHours(deltaMilliseconds / 3_600_000),
    lateExit: true,
  };
}

export function getOutsideScheduleAttendanceOutcome(
  clockInAt: Date | null,
  clockOutAt: Date | null,
): AttendanceCheckOutOutcome {
  if (!clockInAt || !clockOutAt) {
    return {
      scheduledExitTime: null,
      earlyExit: false,
      earlyExitMinutes: 0,
      overtimeMinutes: 0,
      overtimeHours: 0,
      lateExit: false,
    };
  }

  const workedMilliseconds = Math.max(
    0,
    clockOutAt.getTime() - clockInAt.getTime(),
  );
  const overtimeMinutes = Math.round(workedMilliseconds / 60000);

  return {
    scheduledExitTime: null,
    earlyExit: false,
    earlyExitMinutes: 0,
    overtimeMinutes,
    overtimeHours: roundHours(workedMilliseconds / 3_600_000),
    lateExit: false,
  };
}

function roundHours(value: number) {
  return Math.round(value * 100) / 100;
}
