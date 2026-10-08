'use client';

import { FormEvent, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  AccessRole,
  CreateEmployeePayload,
  EmployeeRecord,
  AttendanceSite,
  Schedule,
  UpdateEmployeePayload,
} from '@/lib/api';
import { cn } from '@/lib/utils';
import { AdminEmptyState } from '@/components/admin/admin-empty-state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { Table, TableBody, TableCell, TableContainer, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { getClientErrorMessage } from '@/lib/client-error';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/primitives/sheet';
import {
  createEmptyEmployeeFormValues,
  getAccountStatusMeta,
  getPinStatusMeta,
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
  canManage?: boolean;
  employeeCapacity?: { activeEmployees: number; limit: number } | null;
  initialEmployees: EmployeeRecord[];
  schedules: Schedule[];
  sites: AttendanceSite[];
};

type StatusFilter = 'all' | 'active' | 'inactive';
type AssignmentFilter = 'all' | 'assigned' | 'unassigned';

function normalizePinCodeInput(value: string) {
  return value.replace(/\D/g, '').slice(0, 4);
}

function isValidPinCode(value: string) {
  return /^\d{4}$/.test(value);
}

export function AdminEmployeesManager({
  canManage = true,
  employeeCapacity = null,
  initialEmployees,
  schedules,
  sites,
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
  const [assignmentFilter, setAssignmentFilter] =
    useState<AssignmentFilter>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [transferSiteId, setTransferSiteId] = useState('');
  const [transferEffectiveFrom, setTransferEffectiveFrom] = useState('');
  const [transferScheduleId, setTransferScheduleId] = useState('');
  const [transferBusy, setTransferBusy] = useState(false);
  const [scheduleEffectiveFrom, setScheduleEffectiveFrom] = useState('');
  const [scheduleReason, setScheduleReason] = useState('');
  const [scheduleBusy, setScheduleBusy] = useState(false);
  const [formOpen, setFormOpen] = useState(false);

  const activeEmployees = employees.filter(
    (employee) => employee.isActive,
  ).length;
  const inactiveEmployees = employees.length - activeEmployees;
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
      const matchesAssignment =
        assignmentFilter === 'all' ||
        (assignmentFilter === 'assigned'
          ? Boolean(employee.schedule)
          : !employee.schedule);

      return (
        matchesSearch && matchesStatus && matchesAssignment
      );
    });
  }, [
    assignmentFilter,
    employees,
    normalizedSearch,
    statusFilter,
  ]);

  const visibleEmployees = filteredEmployees.length;
  const pageSize = 10;
  const pageCount = Math.max(1, Math.ceil(visibleEmployees / pageSize));
  const activePage = Math.min(currentPage, pageCount);
  const pageEmployees = filteredEmployees.slice((activePage - 1) * pageSize, activePage * pageSize);
  const scheduleCoverage =
    employees.length === 0
      ? 0
      : Math.round((assignedEmployees / employees.length) * 100);
  const isFilterActive =
    normalizedSearch.length > 0 ||
    statusFilter !== 'all' ||
    assignmentFilter !== 'all';
  const selectedSchedule =
    schedules.find((schedule) => schedule.id === formValues.scheduleId) ?? null;
  const editingEmployee =
    employees.find((employee) => employee.id === editingEmployeeId) ?? null;
  const activeSites = sites.filter((site) => site.isActive);
  const availableSchedules = schedules.filter(
    (schedule) => schedule.isActive && schedule.siteId === formValues.siteId,
  );

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
    setAssignmentFilter('all');
    setCurrentPage(1);
  }

  function resetForm() {
    setFormMode('create');
    setEditingEmployeeId(null);
    setFormValues(createEmptyEmployeeFormValues());
    setTransferSiteId('');
    setTransferEffectiveFrom('');
    setTransferScheduleId('');
    setScheduleEffectiveFrom('');
    setScheduleReason('');
    setFormOpen(false);
  }

  function openCreateForm() {
    setFormMode('create');
    setEditingEmployeeId(null);
    setFormValues(createEmptyEmployeeFormValues());
    setFeedback(null);
    setFormOpen(true);
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
            "Impossible de charger l'employé.",
          ),
        });
        return;
      }

      const employee = data as EmployeeRecord;

      setFormMode('edit');
      setEditingEmployeeId(employee.id);
      setFormValues(mapEmployeeToFormValues(employee));
      setTransferSiteId(employee.primarySiteId ?? '');
      setTransferEffectiveFrom(new Date().toISOString().slice(0, 10));
      setTransferScheduleId(employee.schedule?.id ?? '');
      setScheduleEffectiveFrom(new Date().toISOString().slice(0, 10));
      setFormOpen(true);
    } catch {
      setFeedback({ tone: 'error', message: "Impossible de charger l’employé. Vérifiez votre connexion puis réessayez." });
    } finally {
      setRowAction(null);
    }
  }

  async function transferEmployeeSite() {
    if (!editingEmployeeId || !transferSiteId || !transferEffectiveFrom) return;
    setTransferBusy(true);
    setFeedback(null);
    try {
      const response = await fetch(`/api/employees/${editingEmployeeId}/site`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          siteId: transferSiteId,
          effectiveFrom: `${transferEffectiveFrom}T00:00:00.000Z`,
          ...(transferScheduleId ? { scheduleId: transferScheduleId } : {}),
        }),
      });
      const data = (await response.json().catch(() => ({}))) as EmployeeRecord | { error?: string };
      if (!response.ok || !('id' in data)) {
        throw new Error(getClientErrorMessage(data, 'Transfert impossible.'));
      }
      setEmployees((current) => current.map((item) => item.id === data.id ? data : item));
      setFeedback({ tone: 'success', message: 'Transfert de site enregistré.' });
    } catch (error) {
      setFeedback({ tone: 'error', message: error instanceof Error ? error.message : 'Transfert impossible.' });
    } finally {
      setTransferBusy(false);
    }
  }

  async function assignEmployeeSchedule() {
    if (!editingEmployeeId || !scheduleEffectiveFrom) return;
    setScheduleBusy(true);
    setFeedback(null);
    try {
      const response = await fetch(`/api/employees/${editingEmployeeId}/schedule`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scheduleId: formValues.scheduleId || null,
          effectiveFrom: `${scheduleEffectiveFrom}T00:00:00.000Z`,
          ...(scheduleReason.trim() ? { reason: scheduleReason.trim() } : {}),
        }),
      });
      const data = (await response.json().catch(() => ({}))) as EmployeeRecord | { error?: string };
      if (!response.ok || !('id' in data)) throw new Error(getClientErrorMessage(data, 'Affectation du planning impossible.'));
      setEmployees((current) => current.map((item) => item.id === data.id ? data : item));
      setFeedback({ tone: 'success', message: 'Affectation du planning enregistrée.' });
    } catch (error) {
      setFeedback({ tone: 'error', message: error instanceof Error ? error.message : 'Affectation du planning impossible.' });
    } finally {
      setScheduleBusy(false);
    }
  }

  async function toggleStatus(employee: EmployeeRecord) {
    if (
      employee.isActive &&
      !window.confirm(
        `Désactiver le profil de ${employee.firstName} ${employee.lastName} ? Ce profil ne pourra plus effectuer de pointage tant qu’il reste inactif.`,
      )
    ) {
      return;
    }

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
        const message = getClientErrorMessage(
          data,
          'Impossible de mettre à jour le statut du compte.',
        );
        setFeedback({
          tone: 'error',
          message: message.includes('Plan quota reached for activeEmployees')
            ? 'La capacité d’employés actifs de votre abonnement est atteinte. Désactivez un profil ou contactez un administrateur.'
            : message,
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
          ? 'Profil employé réactivé.'
          : 'Profil employé désactivé.',
      });

      if (editingEmployeeId === updatedEmployee.id) {
        setFormValues(mapEmployeeToFormValues(updatedEmployee));
      }
    } catch {
      setFeedback({ tone: 'error', message: 'Impossible de modifier le statut. Vérifiez votre connexion puis réessayez.' });
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
          message: 'Le mot de passe du profil est requis à la création.',
        });
        return;
      }

      if (formMode === 'edit' && !editingEmployeeId) {
        setFeedback({
          tone: 'error',
          message: 'Aucun employé chargé pour la mise à jour.',
        });
        return;
      }

      if (
        formValues.accessRole === 'EMPLOYEE' &&
        (formMode === 'create' ||
          !editingEmployee?.pinConfigured ||
          formValues.pinCode.length > 0) &&
        !isValidPinCode(formValues.pinCode)
      ) {
        setFeedback({
          tone: 'error',
          message: 'Le code PIN doit contenir exactement 4 chiffres.',
        });
        return;
      }

      const pinPayload =
        formValues.accessRole === 'ADMIN'
          ? { pinCode: null }
          : formMode === 'create' || formValues.pinCode.trim()
            ? { pinCode: formValues.pinCode.trim() }
            : {};
      const sharedPayload = {
        ...pinPayload,
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
              siteId: formValues.siteId,
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

      if (formMode === 'create' && !formValues.siteId) {
        setFeedback({ tone: 'error', message: "Sélectionnez le site d'affectation de l'employé." });
        return;
      }

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
        const message = getClientErrorMessage(
          data,
          formMode === 'create'
            ? "Impossible de créer l'employé."
            : "Impossible de mettre à jour l'employé.",
        );
        setFeedback({
          tone: 'error',
          message: message.includes('Plan quota reached for activeEmployees')
            ? 'La capacité d’employés actifs de votre abonnement est atteinte. Désactivez un profil ou contactez un administrateur.'
            : message,
        });
        return;
      }

      const savedEmployee = data as EmployeeRecord;

      setEmployees((current) =>
        mergeEmployeeRecord(current, savedEmployee, formMode),
      );
      if (formMode === 'create') setCurrentPage(1);
      setFeedback({
        tone: 'success',
        message:
          formMode === 'create'
            ? 'Employé créé avec succès.'
            : 'Employé mis à jour avec succès.',
      });
      resetForm();
    } catch {
      setFeedback({ tone: 'error', message: 'Enregistrement impossible. Vérifiez votre connexion puis réessayez.' });
    } finally {
      setIsSubmitting(false);
    }
  }

  const statCards = [
    {
      label: 'Actifs',
      value: activeEmployees,
      meta: `${inactiveEmployees} inactif(s)`,
      icon: 'check' as const,
      tone: 'text-success',
    },
    {
      label: 'Sans planning',
      value: unassignedEmployees,
      meta: `${scheduleCoverage}% couverts`,
      icon: 'calendar' as const,
      tone: 'text-warning',
    },
    {
      label: 'Départements',
      value: departmentsCount,
      meta: 'présents dans le roster',
      icon: 'users' as const,
      tone: 'text-slate-900',
    },
  ];

  return (
    <div className="grid min-w-0 gap-4">
      <Card className="admin-reveal admin-reveal-delay-1 min-w-0 overflow-hidden rounded-xl border-border bg-surface shadow-none">
        <CardHeader className="space-y-5 border-b border-border bg-surface p-4 sm:p-5">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium text-slate-600">Profils de pointage</span>
                <Badge variant="outline">{visibleEmployees} résultat(s)</Badge>
                {employeeCapacity ? <span className="text-sm font-medium text-slate-600">Employés actifs: {employeeCapacity.activeEmployees} / {employeeCapacity.limit}</span> : null}
              </div>
              <CardTitle className="text-base font-semibold text-slate-950">Liste des employés</CardTitle>
            </div>

            {canManage ? (
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                {formMode === 'edit' ? (
                  <Button
                    className="min-h-11"
                    onClick={resetForm}
                    type="button"
                    variant="secondary"
                  >
                    Annuler
                  </Button>
                ) : null}
                <Button
                  className="min-h-10"
                  onClick={openCreateForm}
                  type="button"
                >
                  <Icon className="mr-2 h-4 w-4" name="plus" />Nouvel employé
                </Button>
              </div>
            ) : (
              <Badge variant="outline">Lecture seule</Badge>
            )}
          </div>

          <dl className="grid grid-cols-2 gap-y-3 border-y border-border py-3 sm:grid-cols-4 sm:divide-x sm:divide-border">
            {[
              { label: 'Tous', value: employees.length, meta: 'profils', icon: 'users' as const, tone: 'text-slate-950' },
              ...statCards,
            ].map((metric) => <div className="min-w-0 px-2 first:pl-0 sm:px-4" key={metric.label}>
              <dt className="flex items-center gap-1.5 text-xs font-medium text-slate-600"><Icon className="h-3.5 w-3.5" name={metric.icon} />{metric.label}</dt>
              <dd className={cn('admin-kpi-value mt-1 text-2xl font-semibold leading-none', metric.tone)}>{metric.value}</dd>
              <p className="mt-1 text-xs text-slate-500">{'meta' in metric ? metric.meta : ''}</p>
            </div>)}
          </dl>

          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(240px,1.5fr)_repeat(3,minmax(130px,0.7fr))]">
              <label className="relative block sm:col-span-2 xl:col-span-1">
                <span className={labelClassName}>Recherche</span>
                <Icon className="pointer-events-none absolute left-3 top-[2.35rem] h-4 w-4 text-slate-400" name="search" />
                <input
                  className={cn(inputClassName, 'pl-10')}
                  onChange={(event) => { setSearchQuery(event.target.value); setCurrentPage(1); }}
                  placeholder="Nom, email, identifiant..."
                  type="search"
                  value={searchQuery}
                />
              </label>

              <label className="block">
                <span className={labelClassName}>Statut</span>
                <select
                  className={cn(inputClassName, 'appearance-none')}
                  onChange={(event) => { setStatusFilter(event.target.value as StatusFilter); setCurrentPage(1); }}
                  value={statusFilter}
                >
                  <option value="all">Tous</option>
                  <option value="active">Actifs</option>
                  <option value="inactive">Inactifs</option>
                </select>
              </label>

              <label className="block">
                <span className={labelClassName}>Planning</span>
                <select
                  className={cn(inputClassName, 'appearance-none')}
                  onChange={(event) => { setAssignmentFilter(event.target.value as AssignmentFilter); setCurrentPage(1); }}
                  value={assignmentFilter}
                >
                  <option value="all">Tous</option>
                  <option value="assigned">Affectés</option>
                  <option value="unassigned">Sans planning</option>
                </select>
              </label>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-slate-600">{visibleEmployees} résultat(s) · {scheduleCoverage}% des profils avec planning</p>
              <Button
                className="min-h-9"
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
              ? 'rounded-lg border border-success/20 bg-success-subtle px-3 py-2 text-sm font-medium text-success'
                  : 'rounded-lg border border-danger/20 bg-danger-subtle px-3 py-2 text-sm font-medium text-danger'
              }
              role={feedback.tone === 'error' ? 'alert' : 'status'}
              aria-live={feedback.tone === 'error' ? 'assertive' : 'polite'}
            >
              {feedback.message}
            </div>
          ) : null}
        </CardHeader>

        <CardContent className="space-y-4 p-0">
          {filteredEmployees.length === 0 ? (
            <AdminEmptyState
              badge={employees.length === 0 ? 'Employés' : 'Filtres actifs'}
              action={
                employees.length === 0 && canManage ? (
                  <Button className="mx-auto" onClick={openCreateForm} type="button">
                    Créer un employé
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
                  ? 'La liste se mettra à jour automatiquement.'
                  : 'Les filtres sont appliqués uniquement dans cette vue.'
              }
              title={
                employees.length === 0
                  ? 'Aucun collaborateur'
                  : 'Aucun résultat'
              }
            />
          ) : (
            <>
              <TableContainer aria-label="Liste des employés, défilement horizontal disponible" className="hidden min-w-0 xl:block" role="region" tabIndex={0}>
                <Table className="min-w-[760px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Employé</TableHead>
                      <TableHead>Fonction</TableHead>
                      <TableHead>Site et planning</TableHead>
                      <TableHead>État</TableHead>
                      {canManage ? <TableHead className="text-right">Actions</TableHead> : null}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                {pageEmployees.map((employee) => {
                  const accountStatus = getAccountStatusMeta(employee.isActive);
                  const pinStatus = getPinStatusMeta(employee);
                  const isEditing =
                    rowAction?.employeeId === employee.id &&
                    rowAction.type === 'edit';
                  const isUpdatingStatus =
                    rowAction?.employeeId === employee.id &&
                    rowAction.type === 'status';
                  const isSelected = editingEmployeeId === employee.id;

                  return <TableRow className={isSelected ? 'bg-primary/5' : undefined} key={employee.id}>
                    <TableCell className="min-w-[210px]">
                      <p className="font-semibold text-slate-950">{employee.firstName} {employee.lastName}</p>
                      <p className="mt-0.5 text-xs text-slate-500">{employee.employeeIdentifier}</p>
                      <p className="mt-0.5 max-w-[260px] truncate text-xs text-slate-600">{employee.email}</p>
                    </TableCell>
                    <TableCell>
                      <p className="text-sm font-medium text-slate-900">{employee.role}</p>
                      <p className="mt-0.5 text-xs text-slate-600">{employee.department ?? 'Sans département'}</p>
                    </TableCell>
                    <TableCell>
                      <p className="font-medium text-slate-900">{employee.primarySite?.name ?? 'Site non renseigné'}</p>
                      <p className="mt-0.5 text-xs text-slate-600">{employee.schedule?.name ?? 'Sans planning'}</p>
                      {employee.schedule ? <p className="mt-0.5 text-xs text-slate-500">{employee.schedule.startTime} – {employee.schedule.endTime}</p> : null}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col items-start gap-1.5"><Badge variant={accountStatus.variant}>{accountStatus.label}</Badge><Badge variant={pinStatus.variant}>{pinStatus.label}</Badge></div>
                    </TableCell>
                    {canManage ? <TableCell>
                      <div className="flex justify-end gap-1.5">
                        <Button aria-label={`Modifier ${employee.firstName} ${employee.lastName}`} className="min-h-9 gap-1.5 px-2.5" disabled={Boolean(rowAction)} onClick={() => startEdit(employee.id)} size="sm" type="button" variant="secondary">
                          <Icon className="h-4 w-4" name="edit" />{isEditing ? 'Chargement…' : 'Modifier'}
                        </Button>
                        <Button aria-label={`${employee.isActive ? 'Désactiver' : 'Activer'} ${employee.firstName} ${employee.lastName}`} className="min-h-9 px-2.5" disabled={Boolean(rowAction)} onClick={() => toggleStatus(employee)} size="sm" type="button" variant="ghost">
                          {isUpdatingStatus ? 'Mise à jour…' : employee.isActive ? 'Désactiver' : 'Activer'}
                        </Button>
                      </div>
                    </TableCell> : null}
                  </TableRow>;
                })}
                  </TableBody>
                </Table>
              </TableContainer>
              <div aria-label="Liste des employés" className="space-y-3 px-3 xl:hidden" role="list">
                {pageEmployees.map((employee) => {
                  const accountStatus = getAccountStatusMeta(employee.isActive);
                  const pinStatus = getPinStatusMeta(employee);
                  const isEditing = rowAction?.employeeId === employee.id && rowAction.type === 'edit';
                  const isUpdatingStatus = rowAction?.employeeId === employee.id && rowAction.type === 'status';
                  return (
                    <article className="rounded-xl border border-border bg-white p-4" key={employee.id} role="listitem">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="break-words font-semibold text-slate-950">{employee.firstName} {employee.lastName}</p>
                          <p className="mt-0.5 text-xs text-slate-600">{employee.employeeIdentifier}</p>
                          <p className="mt-0.5 break-all text-xs text-slate-600">{employee.email}</p>
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-1.5">
                          <Badge variant={accountStatus.variant}>{accountStatus.label}</Badge>
                          <Badge variant={pinStatus.variant}>{pinStatus.label}</Badge>
                        </div>
                      </div>
                      <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 border-t border-border pt-3 text-sm">
                        <div><dt className="text-xs text-slate-500">Fonction</dt><dd className="font-medium text-slate-900">{employee.role}</dd></div>
                        <div><dt className="text-xs text-slate-500">Département</dt><dd className="font-medium text-slate-900">{employee.department ?? '—'}</dd></div>
                        <div className="col-span-2"><dt className="text-xs text-slate-500">Site et planning</dt><dd className="font-medium text-slate-900">{employee.primarySite?.name ?? 'Site non renseigné'} · {employee.schedule?.name ?? 'Sans planning'}</dd></div>
                      </dl>
                      {canManage ? <div className="mt-3 flex flex-col gap-2 border-t border-border pt-3 sm:flex-row">
                        <Button aria-label={`Modifier ${employee.firstName} ${employee.lastName}`} className="min-h-10 flex-1" disabled={Boolean(rowAction)} onClick={() => startEdit(employee.id)} size="sm" type="button" variant="secondary">{isEditing ? 'Chargement…' : 'Modifier'}</Button>
                        <Button aria-label={`${employee.isActive ? 'Désactiver' : 'Activer'} ${employee.firstName} ${employee.lastName}`} className="min-h-10 flex-1" disabled={Boolean(rowAction)} onClick={() => toggleStatus(employee)} size="sm" type="button" variant="ghost">{isUpdatingStatus ? 'Mise à jour…' : employee.isActive ? 'Désactiver' : 'Activer'}</Button>
                      </div> : null}
                    </article>
                  );
                })}
              </div>
              {pageCount > 1 ? <nav aria-label="Pagination des employés" className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
                <p className="text-xs text-slate-600">{(activePage - 1) * pageSize + 1}–{Math.min(activePage * pageSize, visibleEmployees)} sur {visibleEmployees}</p>
                <div className="flex items-center gap-2">
                  <Button className="min-h-9 gap-1.5 px-2.5" disabled={activePage === 1} onClick={() => setCurrentPage((page) => Math.max(1, page - 1))} size="sm" type="button" variant="secondary"><Icon className="h-4 w-4" name="arrow-left" />Précédent</Button>
                  <span className="text-xs tabular-nums text-slate-600">{activePage} / {pageCount}</span>
                  <Button className="min-h-9 gap-1.5 px-2.5" disabled={activePage === pageCount} onClick={() => setCurrentPage((page) => Math.min(pageCount, page + 1))} size="sm" type="button" variant="secondary">Suivant<Icon className="h-4 w-4" name="arrow-right" /></Button>
                </div>
              </nav> : null}
            </>
          )}
        </CardContent>
      </Card>

      {canManage ? (
        <Sheet onOpenChange={setFormOpen} open={formOpen}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-2xl" side="right">
          <SheetHeader className="border-b border-border pr-12">
            <SheetTitle>{formMode === 'create' ? 'Nouvel employé' : 'Modifier le profil employé'}</SheetTitle>
            <SheetDescription>Gérez les informations, le site, le planning et les accès du profil de pointage.</SheetDescription>
          </SheetHeader>
        <Card className="mx-4 mb-4 overflow-hidden rounded-xl border-border bg-surface shadow-none">
          <CardHeader className="space-y-3 border-b border-border">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Badge variant={formMode === 'create' ? 'success' : 'warning'}>
                {formMode === 'create' ? 'Création' : 'Édition'}
              </Badge>
              <Badge variant="outline">
                {formMode === 'create' ? 'Nouveau profil' : 'Profil actif'}
              </Badge>
            </div>

            <div className="space-y-1">
              <CardTitle className="text-base font-semibold text-slate-950">
                {formMode === 'create'
                  ? 'Profil employé'
                  : 'Modifier le compte'}
              </CardTitle>
              <p className="text-sm leading-5 text-slate-600">
                Informations du compte regroupées pour une mise à jour rapide.
              </p>
            </div>

            {editingEmployee ? <p className="text-sm font-medium text-slate-700">Modification : {editingEmployee.firstName} {editingEmployee.lastName} · {editingEmployee.employeeIdentifier}</p> : null}
          </CardHeader>

          <CardContent className="pt-4">
            <form className="space-y-3.5" onSubmit={handleSubmit}>
              <section className="space-y-3 border-t border-border py-3 first:border-0 first:pt-0">
                <div className="space-y-1">
                  <p className={labelClassName}>Identité</p>
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
                    required={
                      formValues.accessRole === 'EMPLOYEE' &&
                      (formMode === 'create' || !editingEmployee?.pinConfigured)
                    }
                    value={formValues.pinCode}
                  />
                  <p className="mt-1 text-xs leading-5 text-slate-500">
                    {formMode === 'edit' && editingEmployee?.pinConfigured
                      ? 'Laisser vide pour conserver le PIN actuel. Saisir 4 chiffres pour le remplacer.'
                      : 'Le PIN à 4 chiffres est haché côté serveur et ne sera jamais réaffiché.'}
                  </p>
                </label>

                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block">
                    <span className={labelClassName}>Prénom</span>
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

              {formMode === 'edit' ? (
                <section className="space-y-3 border-t border-border py-3">
                  <div>
                    <p className={labelClassName}>Historique du rattachement</p>
                    <p className="text-base font-semibold text-slate-950">Transférer vers un autre site</p>
                    <p className="mt-1 text-sm text-slate-600">Le serveur valide le site, la date et le planning dans le même périmètre d’organisation.</p>
                  </div>
                  <label className="block text-sm font-semibold text-slate-700">Site cible
                    <select className={cn(inputClassName, 'appearance-none')} onChange={(event) => { setTransferSiteId(event.target.value); setTransferScheduleId(''); }} value={transferSiteId}>
                      <option value="">Sélectionner un site actif</option>
                      {activeSites.map((site) => <option key={site.id} value={site.id}>{site.name}</option>)}
                    </select>
                  </label>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="block text-sm font-semibold text-slate-700">Prend effet le
                      <input className={inputClassName} onChange={(event) => setTransferEffectiveFrom(event.target.value)} type="date" value={transferEffectiveFrom} />
                    </label>
                    <label className="block text-sm font-semibold text-slate-700">Planning cible
                      <select className={cn(inputClassName, 'appearance-none')} onChange={(event) => setTransferScheduleId(event.target.value)} value={transferScheduleId}>
                        <option value="">Aucun planning</option>
                        {schedules.filter((schedule) => schedule.isActive && schedule.siteId === transferSiteId).map((schedule) => <option key={schedule.id} value={schedule.id}>{schedule.name} ({schedule.startTime} - {schedule.endTime})</option>)}
                      </select>
                    </label>
                  </div>
                  <Button disabled={transferBusy || !transferSiteId || !transferEffectiveFrom} onClick={() => void transferEmployeeSite()} type="button" variant="secondary">
                    {transferBusy ? 'Transfert...' : 'Enregistrer le transfert'}
                  </Button>
                </section>
              ) : null}

              <section className="space-y-3 border-t border-border py-3">
                <div className="space-y-1">
                  <p className={labelClassName}>Organisation</p>
                  <p className="text-base font-semibold text-slate-950">
                    Rôle et rattachement
                  </p>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block">
                    <span className={labelClassName}>Rôle métier</span>
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
                      <span className={labelClassName}>Rôle du profil employé</span>
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
                      <option value="EMPLOYEE">Employé</option>
                      <option value="ADMIN">Administrateur</option>
                    </select>
                  </label>
                </div>

                <label className="block">
                  <span className={labelClassName}>Département</span>
                  <input
                    className={inputClassName}
                    onChange={(event) =>
                      updateFormValue('department', event.target.value)
                    }
                    placeholder="Ex: Opérations"
                    value={formValues.department}
                  />
                </label>
              </section>

              <section className="space-y-3 border-t border-border py-3">
                <div className="space-y-1">
                  <p className={labelClassName}>Planning</p>
                  <p className="text-base font-semibold text-slate-950">
                    Affectation et statut
                  </p>
                </div>

                <label className="block">
                  <span className={labelClassName}>Site actuel</span>
                  <select
                    className={cn(inputClassName, 'appearance-none')}
                    disabled={formMode === 'edit'}
                    onChange={(event) => {
                      updateFormValue('siteId', event.target.value);
                      updateFormValue('scheduleId', '');
                    }}
                    required
                    value={formValues.siteId}
                  >
                    <option value="">Sélectionner un site</option>
                    {activeSites.map((site) => (
                      <option key={site.id} value={site.id}>{site.name}</option>
                    ))}
                  </select>
                  {formMode === 'edit' ? (
                    <p className="mt-1 text-sm text-slate-600">Un changement de site doit utiliser le transfert dédié afin de préserver l’historique.</p>
                  ) : null}
                </label>

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
                    {availableSchedules.map((schedule) => (
                      <option key={schedule.id} value={schedule.id}>
                        {schedule.name} ({schedule.startTime} -{' '}
                        {schedule.endTime})
                      </option>
                    ))}
                  </select>
                </label>

                {formMode === 'edit' ? (
                  <div className="grid gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-3 sm:grid-cols-2">
                    <label className="text-sm font-semibold text-slate-700">Affectation effective le
                      <input className={inputClassName} onChange={(event) => setScheduleEffectiveFrom(event.target.value)} type="date" value={scheduleEffectiveFrom} />
                    </label>
                    <label className="text-sm font-semibold text-slate-700">Motif
                      <input className={inputClassName} maxLength={200} onChange={(event) => setScheduleReason(event.target.value)} value={scheduleReason} />
                    </label>
                    <Button className="sm:col-span-2" disabled={scheduleBusy || !scheduleEffectiveFrom} onClick={() => void assignEmployeeSchedule()} type="button" variant="secondary">
                      {scheduleBusy ? 'Enregistrement...' : 'Enregistrer cette affectation'}
                    </Button>
                  </div>
                ) : null}

                <div className="rounded-[20px] border border-slate-200 bg-slate-50/90 p-3">
                  <p className={labelClassName}>Résumé</p>
                  <p className="mt-1 text-sm font-semibold text-slate-950">
                    {selectedSchedule
                      ? `${selectedSchedule.name} ${selectedSchedule.startTime} - ${selectedSchedule.endTime}`
                      : 'Sans planning'}
                  </p>
                </div>

                <label className="flex min-h-11 items-start gap-3 rounded-[20px] border border-slate-200 bg-slate-50/90 px-4 py-3 text-sm text-slate-600">
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
                      Profil employé actif
                    </span>
                    <span className="mt-1 block text-sm text-slate-600">
                      Même statut que l'action rapide de la liste.
                    </span>
                  </span>
                </label>
              </section>

              <section className="space-y-3 border-t border-border py-3">
                <div className="space-y-1">
                  <p className={labelClassName}>Sécurité</p>
                  <p className="text-base font-semibold text-slate-950">
                    Accès au profil de pointage
                  </p>
                </div>

                <label className="block">
                  <span className={labelClassName}>
                    {formMode === 'create'
                      ? 'Mot de passe du profil (facultatif pour le SaaS)'
                      : 'Nouveau mot de passe du profil'}
                  </span>
                  <input
                    className={inputClassName}
                    minLength={8}
                    onChange={(event) =>
                      updateFormValue('password', event.target.value)
                    }
                    placeholder={
                      formMode === 'create'
                      ? 'Utilisé par le profil employé, pas par une invitation SaaS'
                        : 'Laisser vide pour conserver'
                    }
                    type="password"
                    value={formValues.password}
                  />
                </label>
              </section>

              <div className="flex flex-col gap-3 sm:flex-row">
                <Button
                  className="min-h-11 rounded-2xl sm:flex-1"
                  disabled={isSubmitting}
                  type="submit"
                >
                  {isSubmitting
                    ? formMode === 'create'
                      ? 'Création...'
                      : 'Mise à jour...'
                    : formMode === 'create'
                      ? 'Créer le profil employé'
                    : 'Enregistrer le profil'}
                </Button>
                <Button
                  className="min-h-11 rounded-2xl sm:flex-1"
                  disabled={isSubmitting}
                  onClick={resetForm}
                  type="button"
                  variant="secondary"
                >
                  Réinitialiser
                </Button>
              </div>
              <p className="text-sm leading-5 text-slate-600">
                Ce formulaire crée ou modifie uniquement le profil employé de pointage. Il ne crée pas de compte SaaS ni de Membership.
                <Link className="ml-1 font-bold text-primary underline" href="/employees?view=accounts#members">
                  Gérer les comptes et invitations
                </Link>
              </p>
            </form>
          </CardContent>
        </Card>
        </SheetContent>
        </Sheet>
      ) : null}
    </div>
  );
}
