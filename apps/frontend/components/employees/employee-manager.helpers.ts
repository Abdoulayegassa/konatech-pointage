import { type AccessRole, type EmployeeRecord } from '@/lib/api';

export type FormMode = 'create' | 'edit';

export type FeedbackState = {
  tone: 'success' | 'error';
  message: string;
} | null;

export type RowActionState = {
  employeeId: string;
  type: 'edit' | 'status';
} | null;

export type EmployeeFormValues = {
  pinCode: string;
  firstName: string;
  lastName: string;
  email: string;
  role: string;
  accessRole: AccessRole;
  password: string;
  department: string;
  scheduleId: string;
  isActive: boolean;
};

export const inputClassName =
  'mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3.5 text-sm text-slate-900 outline-none shadow-[inset_0_1px_0_rgba(255,255,255,0.75)] transition duration-200 placeholder:text-slate-400 focus:border-accent/40 focus:ring-4 focus:ring-accent/10';

export const labelClassName =
  'text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500';

export const helperTextClassName = 'mt-1 text-sm leading-6 text-slate-500';

export function createEmptyEmployeeFormValues(): EmployeeFormValues {
  return {
    pinCode: '',
    firstName: '',
    lastName: '',
    email: '',
    role: '',
    accessRole: 'EMPLOYEE',
    password: '',
    department: '',
    scheduleId: '',
    isActive: true,
  };
}

export function mapEmployeeToFormValues(
  employee: EmployeeRecord,
): EmployeeFormValues {
  return {
    pinCode: '',
    firstName: employee.firstName,
    lastName: employee.lastName,
    email: employee.email,
    role: employee.role,
    accessRole: employee.accessRole,
    password: '',
    department: employee.department ?? '',
    scheduleId: employee.schedule?.id ?? '',
    isActive: employee.isActive,
  };
}

export function mergeEmployeeRecord(
  employees: EmployeeRecord[],
  nextEmployee: EmployeeRecord,
  mode: FormMode,
) {
  if (mode === 'create') {
    return [nextEmployee, ...employees];
  }

  return employees.map((employee) =>
    employee.id === nextEmployee.id ? nextEmployee : employee,
  );
}

export function getAccountStatusMeta(isActive: boolean) {
  return isActive
    ? { label: 'Actif', variant: 'success' as const }
    : { label: 'Inactif', variant: 'outline' as const };
}

export function getAccessRoleMeta(accessRole: AccessRole) {
  return accessRole === 'ADMIN'
    ? { label: 'ADMIN', variant: 'warning' as const }
    : { label: 'EMPLOYEE', variant: 'outline' as const };
}

export function getScheduleAssignmentMeta(employee: EmployeeRecord) {
  return employee.schedule
    ? { label: 'Affecte', variant: 'success' as const }
    : { label: 'Non assigne', variant: 'outline' as const };
}

export function getPinStatusMeta(employee: EmployeeRecord) {
  return employee.pinConfigured
    ? { label: 'PIN defini', variant: 'success' as const }
    : { label: 'PIN manquant', variant: 'warning' as const };
}
