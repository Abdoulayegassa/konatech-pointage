'use client';

import { FormEvent, useMemo, useState } from 'react';
import {
  AccessRole,
  CreateEmployeePayload,
  EmployeeRecord,
  Schedule,
  UpdateEmployeePayload,
} from '@/lib/api';
import { cn } from '@/lib/utils';
import { AdminEmptyState } from '@/components/admin/admin-empty-state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getClientErrorMessage } from '@/lib/client-error';
import {
  createEmptyEmployeeFormValues,
  getAccessRoleMeta,
  getAccountStatusMeta,
  getPinStatusMeta,
  getScheduleAssignmentMeta,
  inputClassName,
  labelClassName,
  mapEmployeeToFormValues,
  mergeEmployeeRecord,
  type EmployeeFormValues,
  type FeedbackState,
  type FormMode,
  type RowActionState,
} from './employee-manager.helpers';

type AdminEmployeesManagerProps = {
  initialEmployees: EmployeeRecord[];
  schedules: Schedule[];
};

type StatusFilter = 'all' | 'active' | 'inactive';
type AccessFilter = 'all' | AccessRole;
type AssignmentFilter = 'all' | 'assigned' | 'unassigned';

function formatScheduleRange(schedule: EmployeeRecord['schedule']) {
  if (!schedule) {
    return 'Sans planning';
  }

  return `${schedule.name} (${schedule.startTime} - ${schedule.endTime})`;
}

function normalizePinCodeInput(value: string) {
  return value.replace(/\D/g, '').slice(0, 4);
}

function isValidPinCode(value: string) {
  return /^\d{4}$/.test(value);
}

export function AdminEmployeesManager({
  initialEmployees,
  schedules,
}: AdminEmployeesManagerProps) {
  const [employees, setEmployees] = useState(initialEmployees);
  const [formMode, setFormMode] = useState<FormMode>('create');
  const [editingEmployeeId, setEditingEmployeeId] = useState<string | null>(
    null,
  );
  const [formValues, setFormValues] = useState<EmployeeFormValues>(
    createEmptyEmployeeFormValues(),
  );
  const [feedback, setFeedback] = useState<FeedbackState>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [rowAction, setRowAction] = useState<RowActionState>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [accessFilter, setAccessFilter] = useState<AccessFilter>('all');
  const [assignmentFilter, setAssignmentFilter] =
    useState<AssignmentFilter>('all');

  const activeEmployees = employees.filter(
    (employee) => employee.isActive,
  ).length;
  const inactiveEmployees = employees.length - activeEmployees;
  const adminAccounts = employees.filter(
    (employee) => employee.accessRole === 'ADMIN',
  ).length;
  const assignedEmployees = employees.filter(
    (employee) => employee.schedule,
  ).length;
  const unassignedEmployees = employees.length - assignedEmployees;
  const departmentsCount = new Set(
    employees
      .map((employee) => employee.department?.trim())
      .filter((department): department is string => Boolean(department)),
  ).size;
  const normalizedSearch = searchQuery.trim().toLowerCase();

  const filteredEmployees = useMemo(() => {
    return employees.filter((employee) => {
      const matchesSearch =
        normalizedSearch.length === 0 ||
        [
          employee.firstName,
          employee.lastName,
          employee.employeeIdentifier,
          employee.email,
          employee.department ?? '',
          employee.role,
          employee.schedule?.name ?? '',
        ]
          .join(' ')
          .toLowerCase()
          .includes(normalizedSearch);
      const matchesStatus =
        statusFilter === 'all' ||
        (statusFilter === 'active' ? employee.isActive : !employee.isActive);
      const matchesAccess =
        accessFilter === 'all' || employee.accessRole === accessFilter;
      const matchesAssignment =
        assignmentFilter === 'all' ||
        (assignmentFilter === 'assigned'
          ? Boolean(employee.schedule)
          : !employee.schedule);

      return (
        matchesSearch && matchesStatus && matchesAccess && matchesAssignment
      );
    });
  }, [
    accessFilter,
    assignmentFilter,
    employees,
    normalizedSearch,
    statusFilter,
  ]);

  const visibleEmployees = filteredEmployees.length;
  const scheduleCoverage =
    employees.length === 0
      ? 0
      : Math.round((assignedEmployees / employees.length) * 100);
  const isFilterActive =
    normalizedSearch.length > 0 ||
    statusFilter !== 'all' ||
    accessFilter !== 'all' ||
    assignmentFilter !== 'all';
  const selectedSchedule =
    schedules.find((schedule) => schedule.id === formValues.scheduleId) ?? null;
  const editingEmployee =
    employees.find((employee) => employee.id === editingEmployeeId) ?? null;

  function updateFormValue<Key extends keyof EmployeeFormValues>(
    key: Key,
    value: EmployeeFormValues[Key],
  ) {
    setFormValues((current) => ({
      ...current,
      [key]: value,
    }));
  }

  function clearFilters() {
    setSearchQuery('');
    setStatusFilter('all');
    setAccessFilter('all');
    setAssignmentFilter('all');
  }

  function resetForm() {
    setFormMode('create');
    setEditingEmployeeId(null);
    setFormValues(createEmptyEmployeeFormValues());
  }

  async function startEdit(employeeId: string) {
    setRowAction({
      employeeId,
      type: 'edit',
    });
    setFeedback(null);

    try {
      const response = await fetch(`/api/employees/${employeeId}`, {
        cache: 'no-store',
      });
      const data = (await response.json().catch(() => ({}))) as
        | EmployeeRecord
        | { error?: string };

      if (!response.ok) {
        setFeedback({
          tone: 'error',
          message: getClientErrorMessage(
            data,
            "Impossible de charger l'employe.",
          ),
        });
        return;
      }

      const employee = data as EmployeeRecord;

      setFormMode('edit');
      setEditingEmployeeId(employee.id);
      setFormValues(mapEmployeeToFormValues(employee));
    } finally {
      setRowAction(null);
    }
  }

  async function toggleStatus(employee: EmployeeRecord) {
    setRowAction({
      employeeId: employee.id,
      type: 'status',
    });
    setFeedback(null);

    try {
      const response = await fetch(`/api/employees/${employee.id}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          isActive: !employee.isActive,
        }),
      });
      const data = (await response.json().catch(() => ({}))) as
        | EmployeeRecord
        | { error?: string };

      if (!response.ok) {
        setFeedback({
          tone: 'error',
          message: getClientErrorMessage(
            data,
            'Impossible de mettre a jour le statut du compte.',
          ),
        });
        return;
      }

      const updatedEmployee = data as EmployeeRecord;

      setEmployees((current) =>
        current.map((item) =>
          item.id === updatedEmployee.id ? updatedEmployee : item,
        ),
      );
      setFeedback({
        tone: 'success',
        message: updatedEmployee.isActive
          ? 'Compte employe reactive.'
          : 'Compte employe desactive.',
      });

      if (editingEmployeeId === updatedEmployee.id) {
        setFormValues(mapEmployeeToFormValues(updatedEmployee));
      }
    } finally {
      setRowAction(null);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setFeedback(null);

    try {
      if (formMode === 'create' && !formValues.password.trim()) {
        setFeedback({
          tone: 'error',
          message: 'Le mot de passe est requis pour creer un compte employe.',
        });
        return;
      }

      if (formMode === 'edit' && !editingEmployeeId) {
        setFeedback({
          tone: 'error',
          message: 'Aucun employe charge pour la mise a jour.',
        });
        return;
      }

      if (
        formValues.accessRole === 'EMPLOYEE' &&
        !isValidPinCode(formValues.pinCode)
      ) {
        setFeedback({
          tone: 'error',
          message: 'Le code PIN doit contenir exactement 4 chiffres.',
        });
        return;
      }

      const sharedPayload = {
        pinCode:
          formValues.accessRole === 'EMPLOYEE'
            ? formValues.pinCode.trim()
            : null,
        firstName: formValues.firstName.trim(),
        lastName: formValues.lastName.trim(),
        email: formValues.email.trim(),
        role: formValues.role.trim(),
        accessRole: formValues.accessRole,
        department: formValues.department.trim() || null,
        isActive: formValues.isActive,
        scheduleId: formValues.scheduleId || null,
      };

      const payload: CreateEmployeePayload | UpdateEmployeePayload =
        formMode === 'create'
          ? {
              ...sharedPayload,
              password: formValues.password,
            }
          : {
              ...sharedPayload,
              ...(formValues.password.trim()
                ? {
                    password: formValues.password,
                  }
                : {}),
            };

      const response = await fetch(
        formMode === 'create'
          ? '/api/employees'
          : `/api/employees/${editingEmployeeId}`,
        {
          method: formMode === 'create' ? 'POST' : 'PATCH',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        },
      );

      const data = (await response.json().catch(() => ({}))) as
        | EmployeeRecord
        | { error?: string };

      if (!response.ok) {
        setFeedback({
          tone: 'error',
          message: getClientErrorMessage(
            data,
            formMode === 'create'
              ? "Impossible de creer l'employe."
              : "Impossible de mettre a jour l'employe.",
          ),
        });
        return;
      }

      const savedEmployee = data as EmployeeRecord;

      setEmployees((current) =>
        mergeEmployeeRecord(current, savedEmployee, formMode),
      );
      setFeedback({
        tone: 'success',
        message:
          formMode === 'create'
            ? 'Employe cree avec succes.'
            : 'Employe mis a jour avec succes.',
      });
      resetForm();
    } finally {
      setIsSubmitting(false);
    }
  }

  const statCards = [
    {
      label: 'Actifs',
      value: activeEmployees,
      meta: `${inactiveEmployees} inactif(s)`,
      className:
        'border-success/15 bg-[linear-gradient(180deg,rgba(25,135,84,0.07),rgba(255,255,255,0.98))]',
    },
    {
      label: 'Sans planning',
      value: unassignedEmployees,
      meta: `${scheduleCoverage}% couverts`,
      className:
        'border-accent/15 bg-[linear-gradient(180deg,rgba(244,110,40,0.09),rgba(255,255,255,0.98))]',
    },
    {
      label: 'Admins',
      value: adminAccounts,
      meta: `${departmentsCount} departement(s)`,
      className:
        'border-primary/15 bg-[linear-gradient(180deg,rgba(16,50,60,0.08),rgba(255,255,255,0.98))]',
    },
  ];

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1.42fr)_minmax(330px,0.58fr)]">
      <Card className="admin-reveal admin-reveal-delay-1 overflow-hidden rounded-[30px] border-slate-200/80 bg-white/95 shadow-[0_22px_52px_rgba(15,45,58,0.08)]">
        <div className="h-1.5 bg-[linear-gradient(90deg,rgba(244,110,40,0.98),rgba(244,110,40,0.42),rgba(16,50,60,0.92))]" />

        <CardHeader className="space-y-5 border-b border-slate-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.94))] pb-5">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-3">
                <Badge className="bg-accent/15 text-accent" variant="warning">
                  Employee registry
                </Badge>
                <Badge variant="outline">
                  {visibleEmployees} resultat(s)
                </Badge>
              </div>
              <div className="space-y-1.5">
                <CardTitle className="text-2xl text-slate-950 sm:text-[2rem]">
                  Registre des collaborateurs
                </CardTitle>
                <p className="max-w-2xl text-sm leading-5 text-slate-600">
                  Recherche, activation et affectation dans une vue plus directe.
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              {formMode === 'edit' ? (
                <Button onClick={resetForm} type="button" variant="secondary">
                  Annuler
                </Button>
              ) : null}
              <Button
                className="rounded-2xl bg-accent text-accent-foreground shadow-[0_14px_32px_rgba(244,110,40,0.26)] hover:bg-accent/95"
                onClick={resetForm}
                type="button"
              >
                Nouveau collaborateur
              </Button>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-[24px] border border-slate-200/80 bg-white/85 p-4 shadow-sm">
              <p className={labelClassName}>Total</p>
              <p className="mt-2 text-3xl font-semibold text-slate-950">
                {employees.length}
              </p>
              <p className="mt-1.5 text-sm text-slate-600">Tous comptes.</p>
            </div>

            {statCards.map((card) => (
              <div
                key={card.label}
                className={cn('rounded-[24px] border p-4 shadow-sm', card.className)}
              >
                <p className={labelClassName}>{card.label}</p>
                <p className="mt-2 text-3xl font-semibold text-slate-950">
                  {card.value}
                </p>
                <p className="mt-1.5 text-sm text-slate-600">{card.meta}</p>
              </div>
            ))}
          </div>

          <div className="rounded-[26px] border border-slate-200/80 bg-white/88 p-4 shadow-sm backdrop-blur sm:p-5">
            <div className="grid gap-3 xl:grid-cols-[minmax(0,1.35fr)_repeat(3,minmax(0,0.72fr))]">
              <label className="block">
                <span className={labelClassName}>Recherche</span>
                <input
                  className={inputClassName}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Nom, email, identifiant..."
                  type="search"
                  value={searchQuery}
                />
              </label>

              <label className="block">
                <span className={labelClassName}>Statut</span>
                <select
                  className={cn(inputClassName, 'appearance-none')}
                  onChange={(event) =>
                    setStatusFilter(event.target.value as StatusFilter)
                  }
                  value={statusFilter}
                >
                  <option value="all">Tous</option>
                  <option value="active">Actifs</option>
                  <option value="inactive">Inactifs</option>
                </select>
              </label>

              <label className="block">
                <span className={labelClassName}>Acces</span>
                <select
                  className={cn(inputClassName, 'appearance-none')}
                  onChange={(event) =>
                    setAccessFilter(event.target.value as AccessFilter)
                  }
                  value={accessFilter}
                >
                  <option value="all">Tous</option>
                  <option value="ADMIN">ADMIN</option>
                  <option value="EMPLOYEE">EMPLOYEE</option>
                </select>
              </label>

              <label className="block">
                <span className={labelClassName}>Planning</span>
                <select
                  className={cn(inputClassName, 'appearance-none')}
                  onChange={(event) =>
                    setAssignmentFilter(event.target.value as AssignmentFilter)
                  }
                  value={assignmentFilter}
                >
                  <option value="all">Tous</option>
                  <option value="assigned">Affectes</option>
                  <option value="unassigned">Sans planning</option>
                </select>
              </label>
            </div>

            <div className="mt-4 flex flex-col gap-3 border-t border-slate-200/80 pt-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline">{visibleEmployees} visibles</Badge>
                <Badge variant="outline">{scheduleCoverage}% couverts</Badge>
              </div>
              <Button
                disabled={!isFilterActive}
                onClick={clearFilters}
                type="button"
                variant="secondary"
              >
                Effacer les filtres
              </Button>
            </div>
          </div>

          {feedback ? (
            <div
              className={
                feedback.tone === 'success'
                  ? 'rounded-[22px] border border-success/20 bg-success/10 px-4 py-3 text-sm font-medium text-success'
                  : 'rounded-[22px] border border-accent/20 bg-accent/10 px-4 py-3 text-sm font-medium text-accent'
              }
            >
              {feedback.message}
            </div>
          ) : null}
        </CardHeader>

        <CardContent className="space-y-5 pt-5">
          <div className="flex flex-col gap-3 rounded-[24px] border border-slate-200/80 bg-[linear-gradient(180deg,rgba(248,250,252,0.92),rgba(255,255,255,0.98))] px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className={labelClassName}>Lecture</p>
              <p className="mt-1.5 text-base font-semibold text-slate-950">
                {visibleEmployees} compte(s) affiches
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline">{assignedEmployees} affectes</Badge>
              <Badge variant="outline">{unassignedEmployees} sans planning</Badge>
            </div>
          </div>

          {filteredEmployees.length === 0 ? (
            <AdminEmptyState
              badge={employees.length === 0 ? 'Employes' : 'Filtres actifs'}
              action={
                employees.length === 0 ? (
                  <Button className="mx-auto" onClick={resetForm} type="button">
                    Creer un employe
                  </Button>
                ) : (
                  <Button
                    className="mx-auto"
                    onClick={clearFilters}
                    type="button"
                    variant="secondary"
                  >
                    Effacer les filtres
                  </Button>
                )
              }
              description={
                employees.length === 0
                  ? 'Ajoutez votre premier collaborateur.'
                  : 'Ajustez la recherche ou les filtres.'
              }
              detail={
                employees.length === 0
                  ? 'La liste se mettra a jour automatiquement.'
                  : 'Les filtres sont appliques uniquement dans cette vue.'
              }
              title={
                employees.length === 0
                  ? 'Aucun collaborateur'
                  : 'Aucun resultat'
              }
            />
          ) : (
            <>
              <div className="hidden overflow-x-auto lg:block">
                <table className="min-w-full border-separate border-spacing-y-3">
                  <thead>
                    <tr>
                      <th className="px-4 text-left text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                        Collaborateur
                      </th>
                      <th className="px-4 text-left text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                        Acces
                      </th>
                      <th className="px-4 text-left text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                        Organisation
                      </th>
                      <th className="px-4 text-left text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                        Planning
                      </th>
                      <th className="px-4 text-right text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredEmployees.map((employee) => {
                      const accountStatus = getAccountStatusMeta(employee.isActive);
                      const accessRole = getAccessRoleMeta(employee.accessRole);
                      const assignmentStatus = getScheduleAssignmentMeta(employee);
                      const pinStatus = getPinStatusMeta(employee);
                      const isEditing =
                        rowAction?.employeeId === employee.id &&
                        rowAction.type === 'edit';
                      const isUpdatingStatus =
                        rowAction?.employeeId === employee.id &&
                        rowAction.type === 'status';
                      const isSelected = editingEmployeeId === employee.id;

                      return (
                        <tr key={employee.id} className="group">
                          <td
                            className={cn(
                              'rounded-l-[22px] border border-r-0 border-slate-200/80 bg-white px-4 py-4 align-top shadow-sm',
                              isSelected && 'border-accent/35 bg-orange-50/45',
                            )}
                          >
                            <div className="space-y-3">
                              <div>
                                <p className="text-base font-semibold text-slate-950">
                                  {employee.firstName} {employee.lastName}
                                </p>
                                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-sm text-slate-600">
                                  <span>{employee.employeeIdentifier}</span>
                                  <span>{employee.email}</span>
                                </div>
                              </div>
                              <div className="flex flex-wrap gap-2">
                                {isSelected ? (
                                  <Badge
                                    className="bg-accent/15 text-accent"
                                    variant="warning"
                                  >
                                    En edition
                                  </Badge>
                                ) : null}
                                <Badge variant={accountStatus.variant}>
                                  {accountStatus.label}
                                </Badge>
                                <Badge variant={pinStatus.variant}>
                                  {pinStatus.label}
                                </Badge>
                              </div>
                            </div>
                          </td>
                          <td className="border border-l-0 border-r-0 border-slate-200/80 bg-white px-4 py-4 align-top shadow-sm">
                            <div className="space-y-2">
                              <Badge variant={accessRole.variant}>
                                {accessRole.label}
                              </Badge>
                              <p className="text-sm font-semibold text-slate-950">
                                {employee.role}
                              </p>
                            </div>
                          </td>
                          <td className="border border-l-0 border-r-0 border-slate-200/80 bg-white px-4 py-4 align-top shadow-sm">
                            <div className="space-y-2">
                              <p className="text-sm font-semibold text-slate-950">
                                {employee.department ?? 'Sans departement'}
                              </p>
                              <Badge variant={assignmentStatus.variant}>
                                {assignmentStatus.label}
                              </Badge>
                            </div>
                          </td>
                          <td className="border border-l-0 border-r-0 border-slate-200/80 bg-white px-4 py-4 align-top shadow-sm">
                            <div className="space-y-2">
                              <p className="text-sm font-semibold text-slate-950">
                                {employee.schedule?.name ?? 'Sans planning'}
                              </p>
                              <p className="text-sm text-slate-600">
                                {employee.schedule
                                  ? `${employee.schedule.startTime} - ${employee.schedule.endTime}`
                                  : 'Affectation requise'}
                              </p>
                            </div>
                          </td>
                          <td
                            className={cn(
                              'rounded-r-[22px] border border-l-0 border-slate-200/80 bg-white px-4 py-4 align-top shadow-sm',
                              isSelected && 'border-accent/35 bg-orange-50/45',
                            )}
                          >
                            <div className="flex justify-end gap-2">
                              <Button
                                className="rounded-xl"
                                disabled={Boolean(rowAction)}
                                onClick={() => startEdit(employee.id)}
                                size="sm"
                                type="button"
                              >
                                {isEditing ? 'Chargement...' : 'Modifier'}
                              </Button>
                              <Button
                                className="rounded-xl"
                                disabled={Boolean(rowAction)}
                                onClick={() => toggleStatus(employee)}
                                size="sm"
                                type="button"
                                variant="secondary"
                              >
                                {isUpdatingStatus
                                  ? 'Mise a jour...'
                                  : employee.isActive
                                    ? 'Desactiver'
                                    : 'Activer'}
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="grid gap-4 lg:hidden">
                {filteredEmployees.map((employee) => {
                  const accountStatus = getAccountStatusMeta(employee.isActive);
                  const accessRole = getAccessRoleMeta(employee.accessRole);
                  const assignmentStatus = getScheduleAssignmentMeta(employee);
                  const pinStatus = getPinStatusMeta(employee);
                  const isEditing =
                    rowAction?.employeeId === employee.id &&
                    rowAction.type === 'edit';
                  const isUpdatingStatus =
                    rowAction?.employeeId === employee.id &&
                    rowAction.type === 'status';
                  const isSelected = editingEmployeeId === employee.id;

                  return (
                    <article
                      key={employee.id}
                      className={cn(
                        'rounded-[24px] border border-slate-200/80 bg-white p-5 shadow-sm',
                        isSelected && 'border-accent/35 bg-orange-50/40',
                      )}
                    >
                      <div className="flex flex-col gap-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <p className="text-lg font-semibold text-slate-950">
                              {employee.firstName} {employee.lastName}
                            </p>
                            <p className="mt-1 text-sm text-slate-600">
                              {employee.email}
                            </p>
                          </div>
                          <Badge variant="outline">
                            {employee.employeeIdentifier}
                          </Badge>
                        </div>

                        <div className="flex flex-wrap gap-2">
                          <Badge variant={accessRole.variant}>
                            {accessRole.label}
                          </Badge>
                          <Badge variant={accountStatus.variant}>
                            {accountStatus.label}
                          </Badge>
                          <Badge variant={pinStatus.variant}>
                            {pinStatus.label}
                          </Badge>
                          <Badge variant={assignmentStatus.variant}>
                            {assignmentStatus.label}
                          </Badge>
                        </div>

                        <div className="grid gap-3 sm:grid-cols-2">
                          <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
                            <p className={labelClassName}>Role</p>
                            <p className="mt-1.5 text-sm font-semibold text-slate-950">
                              {employee.role}
                            </p>
                          </div>
                          <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
                            <p className={labelClassName}>Departement</p>
                            <p className="mt-1.5 text-sm font-semibold text-slate-950">
                              {employee.department ?? 'Non assigne'}
                            </p>
                          </div>
                          <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4 sm:col-span-2">
                            <p className={labelClassName}>Planning</p>
                            <p className="mt-1.5 text-sm font-semibold text-slate-950">
                              {formatScheduleRange(employee.schedule)}
                            </p>
                          </div>
                        </div>

                        <div className="flex flex-col gap-3 sm:flex-row">
                          <Button
                            className="rounded-2xl sm:flex-1"
                            disabled={Boolean(rowAction)}
                            onClick={() => startEdit(employee.id)}
                            type="button"
                          >
                            {isEditing ? 'Chargement...' : 'Modifier'}
                          </Button>
                          <Button
                            className="rounded-2xl sm:flex-1"
                            disabled={Boolean(rowAction)}
                            onClick={() => toggleStatus(employee)}
                            type="button"
                            variant="secondary"
                          >
                            {isUpdatingStatus
                              ? 'Mise a jour...'
                              : employee.isActive
                                ? 'Desactiver'
                                : 'Activer'}
                          </Button>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card className="admin-reveal admin-reveal-delay-2 self-start overflow-hidden rounded-[30px] border-slate-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.94))] shadow-[0_22px_52px_rgba(15,45,58,0.08)] xl:sticky xl:top-6">
        <div className="h-1.5 bg-[linear-gradient(90deg,rgba(16,50,60,0.92),rgba(244,110,40,0.72),rgba(244,110,40,0.95))]" />

        <CardHeader className="space-y-4 border-b border-slate-200/80 pb-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Badge variant={formMode === 'create' ? 'success' : 'warning'}>
              {formMode === 'create' ? 'Creation' : 'Edition'}
            </Badge>
            <Badge variant="outline">
              {formMode === 'create' ? 'Nouveau profil' : 'Profil actif'}
            </Badge>
          </div>

          <div className="space-y-1.5">
            <CardTitle className="text-2xl text-slate-950">
              {formMode === 'create' ? 'Compte employe' : 'Modifier le compte'}
            </CardTitle>
            <p className="text-sm leading-5 text-slate-600">
              Meme logique API, lecture plus simple.
            </p>
          </div>

          <div className="rounded-[24px] border border-slate-200/80 bg-white/88 p-4 shadow-sm">
            <p className={labelClassName}>Selection</p>
            <p className="mt-1.5 text-base font-semibold text-slate-950">
              {editingEmployee
                ? `${editingEmployee.firstName} ${editingEmployee.lastName}`
                : 'Nouveau collaborateur'}
            </p>
            <p className="mt-1 text-sm text-slate-600">
              {editingEmployee
                ? editingEmployee.employeeIdentifier
                : 'Creation rapide'}
            </p>
          </div>
        </CardHeader>

        <CardContent className="pt-5">
          <form className="space-y-4" onSubmit={handleSubmit}>
            <section className="space-y-4 rounded-[24px] border border-slate-200/80 bg-white/88 p-5 shadow-sm">
              <div className="space-y-1">
                <p className={labelClassName}>Identite</p>
                <p className="text-base font-semibold text-slate-950">
                  Profil et connexion
                </p>
              </div>

              <label className="block">
                <span className={labelClassName}>Code PIN</span>
                <input
                  className={inputClassName}
                  disabled={formValues.accessRole !== 'EMPLOYEE'}
                  inputMode="numeric"
                  maxLength={4}
                  onChange={(event) =>
                    updateFormValue(
                      'pinCode',
                      normalizePinCodeInput(event.target.value),
                    )
                  }
                  placeholder="1234"
                  required={formValues.accessRole === 'EMPLOYEE'}
                  value={formValues.pinCode}
                />
              </label>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className={labelClassName}>Prenom</span>
                  <input
                    className={inputClassName}
                    onChange={(event) =>
                      updateFormValue('firstName', event.target.value)
                    }
                    required
                    value={formValues.firstName}
                  />
                </label>
                <label className="block">
                  <span className={labelClassName}>Nom</span>
                  <input
                    className={inputClassName}
                    onChange={(event) =>
                      updateFormValue('lastName', event.target.value)
                    }
                    required
                    value={formValues.lastName}
                  />
                </label>
              </div>

              <label className="block">
                <span className={labelClassName}>Email</span>
                <input
                  className={inputClassName}
                  onChange={(event) =>
                    updateFormValue('email', event.target.value)
                  }
                  required
                  type="email"
                  value={formValues.email}
                />
              </label>
            </section>

            <section className="space-y-4 rounded-[24px] border border-slate-200/80 bg-white/88 p-5 shadow-sm">
              <div className="space-y-1">
                <p className={labelClassName}>Organisation</p>
                <p className="text-base font-semibold text-slate-950">
                  Role et rattachement
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className={labelClassName}>Role metier</span>
                  <input
                    className={inputClassName}
                    onChange={(event) =>
                      updateFormValue('role', event.target.value)
                    }
                    required
                    value={formValues.role}
                  />
                </label>
                <label className="block">
                  <span className={labelClassName}>Role d acces</span>
                  <select
                    className={cn(inputClassName, 'appearance-none')}
                    onChange={(event) =>
                      updateFormValue(
                        'accessRole',
                        event.target.value as AccessRole,
                      )
                    }
                    value={formValues.accessRole}
                  >
                    <option value="EMPLOYEE">EMPLOYEE</option>
                    <option value="ADMIN">ADMIN</option>
                  </select>
                </label>
              </div>

              <label className="block">
                <span className={labelClassName}>Departement</span>
                <input
                  className={inputClassName}
                  onChange={(event) =>
                    updateFormValue('department', event.target.value)
                  }
                  placeholder="Ex: Operations"
                  value={formValues.department}
                />
              </label>
            </section>

            <section className="space-y-4 rounded-[24px] border border-slate-200/80 bg-white/88 p-5 shadow-sm">
              <div className="space-y-1">
                <p className={labelClassName}>Planning</p>
                <p className="text-base font-semibold text-slate-950">
                  Affectation et statut
                </p>
              </div>

              <label className="block">
                <span className={labelClassName}>Planning</span>
                <select
                  className={cn(inputClassName, 'appearance-none')}
                  onChange={(event) =>
                    updateFormValue('scheduleId', event.target.value)
                  }
                  value={formValues.scheduleId}
                >
                  <option value="">Aucun planning</option>
                  {schedules.map((schedule) => (
                    <option key={schedule.id} value={schedule.id}>
                      {schedule.name} ({schedule.startTime} - {schedule.endTime})
                    </option>
                  ))}
                </select>
              </label>

              <div className="rounded-[22px] border border-slate-200 bg-slate-50/90 p-4">
                <p className={labelClassName}>Resume</p>
                <p className="mt-1.5 text-sm font-semibold text-slate-950">
                  {selectedSchedule
                    ? `${selectedSchedule.name} ${selectedSchedule.startTime} - ${selectedSchedule.endTime}`
                    : 'Sans planning'}
                </p>
              </div>

              <label className="flex items-start gap-3 rounded-[22px] border border-slate-200 bg-slate-50/90 px-4 py-4 text-sm text-slate-600">
                <input
                  checked={formValues.isActive}
                  className="mt-1 h-4 w-4 rounded border-border"
                  onChange={(event) =>
                    updateFormValue('isActive', event.target.checked)
                  }
                  type="checkbox"
                />
                <span>
                  <span className="block font-semibold text-slate-950">
                    Compte actif
                  </span>
                  <span className="mt-1 block text-sm text-slate-600">
                    Meme statut que l action rapide de la liste.
                  </span>
                </span>
              </label>
            </section>

            <section className="space-y-4 rounded-[24px] border border-slate-200/80 bg-white/88 p-5 shadow-sm">
              <div className="space-y-1">
                <p className={labelClassName}>Securite</p>
                <p className="text-base font-semibold text-slate-950">
                  Mot de passe
                </p>
              </div>

              <label className="block">
                <span className={labelClassName}>
                  {formMode === 'create'
                    ? 'Mot de passe initial'
                    : 'Nouveau mot de passe'}
                </span>
                <input
                  className={inputClassName}
                  minLength={8}
                  onChange={(event) =>
                    updateFormValue('password', event.target.value)
                  }
                  placeholder={
                    formMode === 'create'
                      ? 'Minimum 8 caracteres'
                      : 'Laisser vide pour conserver'
                  }
                  type="password"
                  value={formValues.password}
                />
              </label>
            </section>

            <div className="flex flex-col gap-3 sm:flex-row">
              <Button
                className="rounded-2xl sm:flex-1"
                disabled={isSubmitting}
                type="submit"
              >
                {isSubmitting
                  ? formMode === 'create'
                    ? 'Creation...'
                    : 'Mise a jour...'
                  : formMode === 'create'
                    ? 'Creer le compte'
                    : 'Enregistrer'}
              </Button>
              <Button
                className="rounded-2xl sm:flex-1"
                disabled={isSubmitting}
                onClick={resetForm}
                type="button"
                variant="secondary"
              >
                Reinitialiser
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
