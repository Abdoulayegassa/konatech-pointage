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
  siteId: string;
  isActive: boolean;
};

export const inputClassName =
  'admin-control mt-1.5 block min-h-10 w-full rounded-control border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none transition-colors placeholder:text-slate-400 focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-focus-ring/20 disabled:cursor-not-allowed disabled:bg-surface-subtle';

export const labelClassName =
  'text-xs font-medium text-slate-600';

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
    siteId: '',
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
    siteId: employee.primarySiteId ?? '',
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
    ? { label: 'Administrateur', variant: 'warning' as const }
    : { label: 'Employé', variant: 'outline' as const };
}

export function getScheduleAssignmentMeta(employee: EmployeeRecord) {
  return employee.schedule
    ? { label: 'Affecté', variant: 'success' as const }
    : { label: 'Non assigné', variant: 'outline' as const };
}

export function getPinStatusMeta(employee: EmployeeRecord) {
  return employee.pinConfigured
    ? { label: 'PIN défini', variant: 'success' as const }
    : { label: 'PIN manquant', variant: 'warning' as const };
}
