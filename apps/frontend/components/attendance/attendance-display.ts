import {
  type AttendanceRecord,
  type AttendanceVerificationLevel,
  type AttendanceVerificationMethod,
  type Schedule,
} from '@/lib/api';

export type AttendanceStatus = AttendanceRecord['status'];
export type AttendancePoint = 'check-in' | 'check-out';

export type AttendanceExitSource = {
  clockOutAt: string | null;
  clockInAt?: string | null;
  outsideScheduleWork?: boolean;
  scheduledExitTime: string | null;
  earlyExit?: boolean;
  earlyExitMinutes?: number;
  overtimeHours: number;
  overtimeMinutes?: number;
  lateExit?: boolean;
};

export type AttendanceVerificationSource = {
  checkInDistanceMeters: number | null;
  checkInVerificationMethod: AttendanceVerificationMethod;
  checkInVerificationLevel: AttendanceVerificationLevel;
  checkInVerificationReason: string | null;
  checkInVerificationPhoto: string | null;
  checkOutDistanceMeters: number | null;
  checkOutVerificationMethod: AttendanceVerificationMethod;
  checkOutVerificationLevel: AttendanceVerificationLevel;
  checkOutVerificationReason: string | null;
  checkOutVerificationPhoto: string | null;
};

const reasonLabels: Record<string, string> = {
  WITHIN_ALLOWED_RADIUS: 'Zone autorisee',
  NEAR_SITE_WARNING: 'GPS proche du site (historique)',
  OUTSIDE_ALLOWED_RADIUS: 'Pointage bloque hors zone',
  LOCATION_UNAVAILABLE: 'Geolocalisation obligatoire',
  PASSIVE_LOCATION_RECORDED: 'Position enregistree',
};

export function formatAttendanceTime(value: string | null) {
  if (!value) {
    return '--:--';
  }

  return new Date(value).toLocaleTimeString('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatAttendanceHistoryDate(value: string) {
  return new Date(value).toLocaleDateString('fr-FR', {
    weekday: 'short',
    day: '2-digit',
    month: 'long',
  });
}

export function formatAttendanceShortDate(value: string) {
  return new Date(value).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'short',
  });
}

export function getEarlyExitMinutes(attendance: AttendanceExitSource) {
  if (typeof attendance.earlyExitMinutes === 'number') {
    return Math.max(0, attendance.earlyExitMinutes);
  }

  if (!attendance.scheduledExitTime || !attendance.clockOutAt) {
    return 0;
  }

  const scheduledExitTime = new Date(attendance.scheduledExitTime).getTime();
  const clockOutAt = new Date(attendance.clockOutAt).getTime();

  if (Number.isNaN(scheduledExitTime) || Number.isNaN(clockOutAt)) {
    return 0;
  }

  return Math.max(0, Math.round((scheduledExitTime - clockOutAt) / 60000));
}

export function getOvertimeMinutes(attendance: AttendanceExitSource) {
  if (typeof attendance.overtimeMinutes === 'number') {
    return Math.max(0, attendance.overtimeMinutes);
  }

  if (!attendance.scheduledExitTime || !attendance.clockOutAt) {
    return 0;
  }

  const scheduledExitTime = new Date(attendance.scheduledExitTime).getTime();
  const clockOutAt = new Date(attendance.clockOutAt).getTime();

  if (Number.isNaN(scheduledExitTime) || Number.isNaN(clockOutAt)) {
    return 0;
  }

  return Math.max(0, Math.round((clockOutAt - scheduledExitTime) / 60000));
}

export function formatOvertimeHours(value: number) {
  if (value <= 0) {
    return '';
  }

  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

export function getAttendanceWorkedHours(
  attendance: {
    clockInAt: string | null;
    clockOutAt: string | null;
  } | null,
) {
  if (!attendance?.clockInAt || !attendance.clockOutAt) {
    return 0;
  }

  const clockInAt = new Date(attendance.clockInAt).getTime();
  const clockOutAt = new Date(attendance.clockOutAt).getTime();

  if (
    Number.isNaN(clockInAt) ||
    Number.isNaN(clockOutAt) ||
    clockOutAt <= clockInAt
  ) {
    return 0;
  }

  return (clockOutAt - clockInAt) / 3_600_000;
}

export function getMonthlyWorkedHours(history: AttendanceRecord[]) {
  return history.reduce(
    (total, attendance) => total + getAttendanceWorkedHours(attendance),
    0,
  );
}

export function formatHoursValue(value: number) {
  const roundedValue = Math.round(value * 100) / 100;

  return roundedValue.toLocaleString('fr-FR', {
    maximumFractionDigits: 2,
    minimumFractionDigits: Number.isInteger(roundedValue) ? 0 : 2,
  });
}

export function getAttendanceExitMessage(
  attendance: AttendanceExitSource | null,
) {
  if (!attendance?.clockOutAt) {
    return null;
  }

  const earlyExitMinutes = getEarlyExitMinutes(attendance);
  const overtimeMinutes = getOvertimeMinutes(attendance);

  if (attendance.outsideScheduleWork && overtimeMinutes > 0) {
    const overtimeLabel =
      attendance.overtimeHours > 0
        ? `${formatHoursValue(attendance.overtimeHours)}h`
        : `${overtimeMinutes} min`;

    return `Travail hors planning : ${overtimeLabel} (${overtimeMinutes} min).`;
  }

  if (earlyExitMinutes > 0) {
    return `Depart anticipe de ${earlyExitMinutes} min.`;
  }

  if (overtimeMinutes > 0) {
    const overtimeLabel =
      attendance.overtimeHours > 0
        ? `${formatHoursValue(attendance.overtimeHours)}h`
        : `${overtimeMinutes} min`;
    const overtimeMinutesDetail =
      attendance.overtimeHours > 0 ? ` (${overtimeMinutes} min)` : '';

    return `Heures supplementaires : ${overtimeLabel}${overtimeMinutesDetail}.`;
  }

  if (attendance.scheduledExitTime) {
    const scheduledExitTime = new Date(attendance.scheduledExitTime).getTime();
    const clockOutAt = new Date(attendance.clockOutAt).getTime();

    if (
      !Number.isNaN(scheduledExitTime) &&
      !Number.isNaN(clockOutAt) &&
      scheduledExitTime === clockOutAt
    ) {
      return 'Sortie normale.';
    }
  }

  return 'Sortie enregistree.';
}

export function getMonthlyAbsenceCount(
  schedule: Schedule | null | undefined,
  history: AttendanceRecord[],
  month: string,
  referenceDate = new Date(),
) {
  if (!schedule?.isActive || !Array.isArray(schedule.workDays)) {
    return 0;
  }

  const [year, monthIndex] = month.split('-').map(Number);

  if (!year || !monthIndex) {
    return 0;
  }

  const start = new Date(Date.UTC(year, monthIndex - 1, 1));
  const end = new Date(Date.UTC(year, monthIndex, 1));
  const todayLimit = new Date(referenceDate);
  todayLimit.setUTCHours(23, 59, 59, 999);
  const limit = todayLimit < end ? todayLimit : end;
  const workedDateKeys = new Set(
    history
      .filter((attendance) => attendance.clockInAt)
      .map((attendance) =>
        new Date(attendance.date).toISOString().slice(0, 10),
      ),
  );
  const scheduledWorkDays = new Set(schedule.workDays);
  const weekdayNames = [
    'SUNDAY',
    'MONDAY',
    'TUESDAY',
    'WEDNESDAY',
    'THURSDAY',
    'FRIDAY',
    'SATURDAY',
  ] as const;
  const cursor = new Date(start);
  let absenceCount = 0;

  while (cursor <= limit && cursor < end) {
    const weekday = weekdayNames[cursor.getUTCDay()];
    const dateKey = cursor.toISOString().slice(0, 10);

    if (scheduledWorkDays.has(weekday) && !workedDateKeys.has(dateKey)) {
      absenceCount += 1;
    }

    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return absenceCount;
}

export function getAttendanceStatusMeta(status: AttendanceStatus | null) {
  switch (status) {
    case 'LATE':
      return {
        label: 'Retard',
        variant: 'warning' as const,
        description: 'Entree apres l heure de debut du planning.',
      };
    case 'INCOMPLETE':
      return {
        label: 'Incomplet',
        variant: 'outline' as const,
        description: 'Entree enregistree, sortie encore attendue.',
      };
    case 'ABSENT':
      return {
        label: 'Absent',
        variant: 'outline' as const,
        description: 'Aucune presence validee sur la journee.',
      };
    case 'PRESENT':
      return {
        label: 'Present',
        variant: 'success' as const,
        description: 'Journee complete enregistree.',
      };
    default:
      return {
        label: 'Aucune action',
        variant: 'outline' as const,
        description: 'Aucune presence enregistree pour le moment.',
      };
  }
}

export function getAttendanceVerificationMeta(
  item: AttendanceVerificationSource,
  point: AttendancePoint,
) {
  const isCheckOut = point === 'check-out';
  const method = isCheckOut
    ? item.checkOutVerificationMethod
    : item.checkInVerificationMethod;
  const reasonValue = isCheckOut
    ? item.checkOutVerificationReason
    : item.checkInVerificationReason;
  const photoValue = isCheckOut
    ? item.checkOutVerificationPhoto
    : item.checkInVerificationPhoto;
  const distanceValue = isCheckOut
    ? item.checkOutDistanceMeters
    : item.checkInDistanceMeters;
  const level = isCheckOut
    ? item.checkOutVerificationLevel
    : item.checkInVerificationLevel;
  const prefix = isCheckOut ? 'Sortie' : 'Entree';
  const reason = reasonValue
    ? (reasonLabels[reasonValue] ?? reasonValue)
    : method === 'GPS'
      ? 'GPS valide'
      : 'Validation enregistree';
  const distance =
    distanceValue !== null ? `${distanceValue} m` : 'Distance non disponible';
  const isBlocked =
    reasonValue === 'OUTSIDE_ALLOWED_RADIUS' ||
    reasonValue === 'LOCATION_UNAVAILABLE';
  const isLegacyPhoto = Boolean(photoValue);
  const isLegacyGps =
    level === 'WARNING' ||
    level === 'STRICT' ||
    reasonValue === 'NEAR_SITE_WARNING';

  if (isBlocked) {
    return {
      label: `${prefix} bloque`,
      description: `${prefix}: ${reason}.`,
      severity: 'STRICT' as const,
      badgeClass: 'border-red-200 bg-red-50 text-red-700',
    };
  }

  if (isLegacyPhoto) {
    return {
      label: `${prefix} photo historique`,
      description: `${prefix}: ancienne verification photo - ${reason} - ${distance}`,
      severity: level,
      badgeClass:
        level === 'STRICT'
          ? 'border-red-200 bg-red-50 text-red-700'
          : 'border-slate-200 bg-slate-50 text-slate-700',
    };
  }

  if (method === 'GPS' && !isLegacyGps) {
    return {
      label: `${prefix} GPS valide`,
      description: `${prefix}: validation GPS - ${reason} - ${distance}`,
      severity: level,
      badgeClass: 'border-success/20 bg-success/10 text-success',
    };
  }

  if (isLegacyGps) {
    return {
      label: `${prefix} GPS historique`,
      description: `${prefix}: ancien controle GPS - ${reason} - ${distance}`,
      severity: level,
      badgeClass:
        level === 'STRICT'
          ? 'border-red-200 bg-red-50 text-red-700'
          : 'border-accent/20 bg-accent/10 text-accent',
    };
  }

  return {
    label: `${prefix} validation`,
    description: `${prefix}: validation enregistree - ${reason} - ${distance}`,
    severity: level,
    badgeClass: 'border-slate-200 bg-slate-50 text-slate-700',
  };
}

export function getAttendanceVerificationItemClass(
  items: Array<ReturnType<typeof getAttendanceVerificationMeta> | null>,
) {
  if (items.some((item) => item?.severity === 'STRICT')) {
    return 'border-red-200 bg-red-50/70';
  }

  if (items.some((item) => item?.severity === 'WARNING')) {
    return 'border-accent/25 bg-accent/5';
  }

  return '';
}
