import { type ScheduleRecord, type WorkDay } from '@/lib/api';

export type FormMode = 'create' | 'edit';

export type FeedbackState = {
  tone: 'success' | 'error';
  message: string;
} | null;

export type RowActionState = {
  scheduleId: string;
  type: 'edit' | 'status';
} | null;

export type ScheduleFormValues = {
  name: string;
  startTime: string;
  endTime: string;
  latenessMarginMinutes: string;
  isActive: boolean;
  workDays: WorkDay[];
};

export const inputClassName =
  'mt-1.5 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none shadow-[inset_0_1px_0_rgba(255,255,255,0.75)] transition duration-200 placeholder:text-slate-400 focus:border-accent/40 focus:ring-4 focus:ring-accent/10';

export const labelClassName =
  'text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500';

export const helperTextClassName = 'mt-1 text-sm leading-6 text-slate-500';

export const WORK_DAY_OPTIONS: Array<{
  value: WorkDay;
  label: string;
  shortLabel: string;
}> = [
  { value: 'MONDAY', label: 'Lundi', shortLabel: 'Lun' },
  { value: 'TUESDAY', label: 'Mardi', shortLabel: 'Mar' },
  { value: 'WEDNESDAY', label: 'Mercredi', shortLabel: 'Mer' },
  { value: 'THURSDAY', label: 'Jeudi', shortLabel: 'Jeu' },
  { value: 'FRIDAY', label: 'Vendredi', shortLabel: 'Ven' },
  { value: 'SATURDAY', label: 'Samedi', shortLabel: 'Sam' },
  { value: 'SUNDAY', label: 'Dimanche', shortLabel: 'Dim' },
];

const DEFAULT_WORK_DAYS: WorkDay[] = [
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
];

const WORK_DAY_ORDER = new Map(
  WORK_DAY_OPTIONS.map((day, index) => [day.value, index]),
);

export function sortWorkDays(workDays: WorkDay[]) {
  return [...workDays].sort(
    (left, right) =>
      (WORK_DAY_ORDER.get(left) ?? Number.MAX_SAFE_INTEGER) -
      (WORK_DAY_ORDER.get(right) ?? Number.MAX_SAFE_INTEGER),
  );
}

export function createEmptyScheduleFormValues(): ScheduleFormValues {
  return {
    name: '',
    startTime: '08:00',
    endTime: '17:00',
    latenessMarginMinutes: '0',
    isActive: true,
    workDays: sortWorkDays(DEFAULT_WORK_DAYS),
  };
}

export function mapScheduleToFormValues(
  schedule: ScheduleRecord,
): ScheduleFormValues {
  return {
    name: schedule.name,
    startTime: schedule.startTime,
    endTime: schedule.endTime,
    latenessMarginMinutes: String(schedule.latenessMarginMinutes),
    isActive: schedule.isActive,
    workDays: sortWorkDays(schedule.workDays),
  };
}

export function mergeScheduleRecord(
  schedules: ScheduleRecord[],
  nextSchedule: ScheduleRecord,
  mode: FormMode,
) {
  if (mode === 'create') {
    return [nextSchedule, ...schedules];
  }

  return schedules.map((schedule) =>
    schedule.id === nextSchedule.id ? nextSchedule : schedule,
  );
}

export function getScheduleStatusMeta(isActive: boolean) {
  return isActive
    ? { label: 'Actif', variant: 'success' as const }
    : { label: 'Inactif', variant: 'outline' as const };
}

export function getScheduleUsageMeta(schedule: ScheduleRecord) {
  return schedule.employees.length > 0
    ? { label: 'En service', variant: 'warning' as const }
    : { label: 'Libre', variant: 'outline' as const };
}

export function toMinutes(time: string) {
  const [hours, minutes] = time.split(':').map(Number);

  return hours * 60 + minutes;
}

export function getEmployeePreview(schedule: ScheduleRecord) {
  if (schedule.employees.length === 0) {
    return 'Aucun employe assigne';
  }

  const preview = schedule.employees
    .slice(0, 2)
    .map((employee) => `${employee.firstName} ${employee.lastName}`)
    .join(', ');

  if (schedule.employees.length <= 2) {
    return preview;
  }

  return `${preview} +${schedule.employees.length - 2}`;
}
