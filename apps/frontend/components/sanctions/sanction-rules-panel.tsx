'use client';

import { useRouter } from 'next/navigation';
import { FormEvent, ReactNode, useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ApiRequestError, createSanctionRule } from '@/lib/api';
import type {
  CreateSanctionRulePayload,
  CreatableSanctionRuleType,
  SanctionRuleConfig,
  SanctionRuleType,
  UpdateSanctionRulePayload,
} from '@/lib/api';

type SanctionRulesPanelProps = {
  canEdit?: boolean;
  rules: SanctionRuleConfig[];
};

type RuleFormValues = {
  type: CreatableSanctionRuleType;
  code: string;
  name: string;
  description: string;
  active: boolean;
  latenessMinMinutes: string;
  latenessMaxMinutes: string;
  monthlyTolerance: string;
  amountFcfa: string;
  priority: string;
  appliedReason: string;
  toleratedReason: string;
};

type RuleFormMode = 'create' | 'edit';

const ruleTypeLabels: Record<SanctionRuleType, string> = {
  MINOR_LATENESS: 'Retard mineur',
  MAJOR_LATENESS: 'Retard majeur',
  EARLY_DEPARTURE: 'Départ anticipé',
  UNJUSTIFIED_ABSENCE: 'Absence non justifiée',
  JUSTIFIED_ABSENCE: 'Absence justifiée',
  LEAVE: 'Congé',
  EXTERNAL_MISSION: 'Mission externe',
};

function formatMoney(value: number) {
  return `${new Intl.NumberFormat('fr-FR').format(value)} FCFA`;
}

function formatTolerance(value: number) {
  return value > 0 ? `${value} fois / mois` : 'Aucune';
}

function formatConditionOperator(operator: string) {
  if (operator === 'gt') {
    return '>';
  }

  if (operator === 'gte') {
    return '>=';
  }

  if (operator === 'lte') {
    return '<=';
  }

  return '<';
}

function getRuleDescription(rule: SanctionRuleConfig) {
  if (rule.description) {
    return rule.description;
  }

  if (rule.toleratedReason) {
    return rule.toleratedReason;
  }

  return rule.reason;
}

function getConditionValue(rule: SanctionRuleConfig, operators: string[]) {
  return (
    rule.conditions.find((condition) => operators.includes(condition.operator))
      ?.value ?? null
  );
}

function getMinMinutes(rule: SanctionRuleConfig) {
  return rule.latenessMinMinutes ?? getConditionValue(rule, ['gt', 'gte']);
}

function getMaxMinutes(rule: SanctionRuleConfig) {
  return rule.latenessMaxMinutes ?? getConditionValue(rule, ['lt', 'lte']);
}

function buildInitialValues(rule: SanctionRuleConfig): RuleFormValues {
  return {
    type: rule.type === 'MAJOR_LATENESS' ? 'MAJOR_LATENESS' : 'MINOR_LATENESS',
    code: rule.code ?? '',
    name: rule.name ?? ruleTypeLabels[rule.type] ?? rule.type,
    description: rule.description ?? '',
    active: rule.active,
    latenessMinMinutes: String(getMinMinutes(rule) ?? ''),
    latenessMaxMinutes: String(getMaxMinutes(rule) ?? ''),
    monthlyTolerance: String(rule.monthlyTolerance),
    amountFcfa: String(rule.amount),
    priority: String(rule.priority ?? 100),
    appliedReason: rule.reason,
    toleratedReason: rule.toleratedReason ?? '',
  };
}

function buildCreateInitialValues(): RuleFormValues {
  return {
    type: 'MINOR_LATENESS',
    code: '',
    name: '',
    description: '',
    active: true,
    latenessMinMinutes: '0',
    latenessMaxMinutes: '15',
    monthlyTolerance: '1',
    amountFcfa: '2000',
    priority: '10',
    appliedReason: '',
    toleratedReason: '',
  };
}

function parseOptionalInteger(value: string) {
  return value.trim() === '' ? null : Number(value);
}

function parseRequiredInteger(value: string) {
  return Number(value);
}

function getRuleRange(rule: SanctionRuleConfig) {
  return {
    min: getMinMinutes(rule),
    minInclusive: rule.latenessMinInclusive ?? true,
    max: getMaxMinutes(rule),
    maxInclusive: rule.latenessMaxInclusive ?? false,
  };
}

function lowerIsBeforeOrEqualUpper(
  lower: number | null,
  lowerInclusive: boolean,
  upper: number | null,
  upperInclusive: boolean,
) {
  if (lower === null || upper === null) {
    return true;
  }

  if (lower < upper) {
    return true;
  }

  if (lower > upper) {
    return false;
  }

  return lowerInclusive && upperInclusive;
}

function rangesOverlap(
  left: ReturnType<typeof getRuleRange>,
  right: ReturnType<typeof getRuleRange>,
) {
  return (
    lowerIsBeforeOrEqualUpper(
      left.min,
      left.minInclusive,
      right.max,
      right.maxInclusive,
    ) &&
    lowerIsBeforeOrEqualUpper(
      right.min,
      right.minInclusive,
      left.max,
      left.maxInclusive,
    )
  );
}

function validateRuleForm(
  values: RuleFormValues,
  editingRule: SanctionRuleConfig | null,
  rules: SanctionRuleConfig[],
) {
  const code = values.code.trim();
  const name = values.name.trim();
  const min = parseOptionalInteger(values.latenessMinMinutes);
  const max = parseOptionalInteger(values.latenessMaxMinutes);
  const tolerance = parseRequiredInteger(values.monthlyTolerance);
  const amount = parseRequiredInteger(values.amountFcfa);
  const priority = parseRequiredInteger(values.priority);

  if (!name) {
    return 'Le nom est obligatoire.';
  }

  if (!editingRule) {
    if (!code) {
      return 'Le code est obligatoire.';
    }

    if (!/^[A-Z][A-Z0-9_]*$/.test(code)) {
      return 'Le code doit commencer par une majuscule et ne contenir que des lettres majuscules, chiffres ou underscores.';
    }

    if (!values.appliedReason.trim()) {
      return 'Le motif de sanction est obligatoire.';
    }
  }

  for (const [label, value] of [
    ['Seuil minimum', min],
    ['Seuil maximum', max],
    ['Tolérance mensuelle', tolerance],
    ['Montant', amount],
    ['Priorité', priority],
  ] as const) {
    if (value !== null && (!Number.isInteger(value) || value < 0)) {
      return `${label} doit être un nombre entier positif.`;
    }
  }

  if (min !== null && max !== null && min >= max) {
    return 'Le seuil minimum doit être inférieur au seuil maximum.';
  }

  if (values.active) {
    const nextRange = {
      min,
      minInclusive: editingRule?.latenessMinInclusive ?? true,
      max,
      maxInclusive: editingRule?.latenessMaxInclusive ?? false,
    };
    const hasOverlap = rules.some((rule) => {
      if ((editingRule && rule.id === editingRule.id) || !rule.active) {
        return false;
      }

      return rangesOverlap(nextRange, getRuleRange(rule));
    });

    if (hasOverlap) {
      return 'Les plages de sanctions se chevauchent.';
    }
  }

  return null;
}

function SanctionRuleEmptyState({
  canCreate,
  onCreate,
}: {
  canCreate: boolean;
  onCreate: () => void;
}) {
  return (
    <Card className="rounded-[28px] border-dashed border-slate-300 bg-white/95 shadow-[0_18px_44px_rgba(15,45,58,0.06)]">
      <CardContent className="flex flex-col items-center px-5 py-12 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-2xl">
          !
        </div>
        <h2 className="mt-4 text-lg font-black text-slate-950">
          Aucune règle configurée
        </h2>
        <p className="mt-2 max-w-md text-sm font-semibold leading-6 text-slate-600">
          Aucune règle disciplinaire n&apos;est actuellement disponible.
        </p>
        {canCreate ? (
          <Button className="mt-5" onClick={onCreate} type="button">
            + Ajouter une règle
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}

function FieldLabel({
  children,
  htmlFor,
}: {
  children: ReactNode;
  htmlFor: string;
}) {
  return (
    <label
      className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-500"
      htmlFor={htmlFor}
    >
      {children}
    </label>
  );
}

function SanctionRuleCard({
  canEdit,
  onEdit,
  rule,
}: {
  canEdit: boolean;
  onEdit: (rule: SanctionRuleConfig) => void;
  rule: SanctionRuleConfig;
}) {
  return (
    <Card className="flex h-full flex-col rounded-[28px] border-slate-200/80 bg-white/95 shadow-[0_18px_44px_rgba(15,45,58,0.07)]">
      <CardHeader className="border-b border-slate-200/70 pb-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="text-xl text-slate-950">
              {rule.name ?? ruleTypeLabels[rule.type] ?? rule.type}
            </CardTitle>
            <Badge
              className={
                rule.active
                  ? 'mt-3 border-success/15 bg-success/10 text-success'
                  : 'mt-3 border-slate-200 bg-slate-100 text-slate-600'
              }
              variant={rule.active ? 'success' : 'outline'}
            >
              {rule.active ? 'Active' : 'Inactive'}
            </Badge>
          </div>
          <Badge variant="outline">Bientôt disponible</Badge>
        </div>
      </CardHeader>

      <CardContent className="flex flex-1 flex-col gap-4 p-4">
        <dl className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-[20px] border border-slate-200 bg-slate-50/80 p-3">
            <dt className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-500">
              Type
            </dt>
            <dd className="mt-2 text-sm font-black text-slate-950">
              {ruleTypeLabels[rule.type] ?? rule.type}
            </dd>
          </div>

          <div className="rounded-[20px] border border-slate-200 bg-slate-50/80 p-3">
            <dt className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-500">
              Priorité
            </dt>
            <dd className="mt-2 text-sm font-black text-slate-950">
              {rule.priority ?? '-'}
            </dd>
          </div>

          <div className="rounded-[20px] border border-slate-200 bg-slate-50/80 p-3">
            <dt className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-500">
              Tolérance
            </dt>
            <dd className="mt-2 text-sm font-black text-slate-950">
              {formatTolerance(rule.monthlyTolerance)}
            </dd>
          </div>

          <div className="rounded-[20px] border border-slate-200 bg-slate-50/80 p-3">
            <dt className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-500">
              Montant
            </dt>
            <dd className="mt-2 text-sm font-black text-slate-950">
              {formatMoney(rule.amount)}
            </dd>
          </div>
        </dl>

        <div className="rounded-[20px] border border-slate-200 bg-slate-50/80 p-3">
          <p className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-500">
            Seuil
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {rule.conditions.length > 0 ? (
              rule.conditions.map((condition) => (
                <span
                  className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm font-black text-slate-700 shadow-sm"
                  key={`${condition.field}-${condition.operator}-${condition.value}`}
                >
                  {formatConditionOperator(condition.operator)}{' '}
                  {condition.value} min
                </span>
              ))
            ) : (
              <span className="text-sm font-bold text-slate-600">-</span>
            )}
          </div>
        </div>

        <div className="rounded-[20px] border border-slate-200 bg-white p-3">
          <p className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-500">
            Description
          </p>
          <p className="mt-2 text-sm font-semibold leading-6 text-slate-700">
            {getRuleDescription(rule)}
          </p>
        </div>

        {canEdit ? (
          <div className="mt-auto flex flex-wrap gap-2 border-t border-slate-200 pt-4">
            <Button
              disabled={!rule.id}
              onClick={() => onEdit(rule)}
              size="sm"
              type="button"
              variant="secondary"
            >
              Modifier
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function SanctionRuleEditModal({
  error,
  formValues,
  isSaving,
  mode,
  onCancel,
  onChange,
  onSubmit,
}: {
  error: string | null;
  formValues: RuleFormValues;
  isSaving: boolean;
  mode: RuleFormMode;
  onCancel: () => void;
  onChange: (values: RuleFormValues) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-4 py-6 backdrop-blur-sm">
      <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-[28px] border border-white/70 bg-white p-5 shadow-[0_24px_70px_rgba(15,45,58,0.24)]">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 pb-4">
          <div>
            <Badge variant="warning">
              {mode === 'create' ? 'Création' : 'Édition'}
            </Badge>
            <h3 className="mt-3 text-2xl font-black text-slate-950">
              {mode === 'create' ? 'Ajouter une règle' : 'Modifier la règle'}
            </h3>
          </div>
          <Button
            disabled={isSaving}
            onClick={onCancel}
            type="button"
            variant="ghost"
          >
            Annuler
          </Button>
        </div>

        <form className="mt-5 space-y-4" onSubmit={onSubmit}>
          <div className="grid gap-4 sm:grid-cols-2">
            {mode === 'create' ? (
              <>
                <div className="space-y-2">
                  <FieldLabel htmlFor="sanction-rule-type">Type</FieldLabel>
                  <select
                    className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-950 shadow-sm outline-none transition focus:border-accent focus:ring-4 focus:ring-accent/10"
                    id="sanction-rule-type"
                    onChange={(event) =>
                      onChange({
                        ...formValues,
                        type: event.currentTarget
                          .value as CreatableSanctionRuleType,
                      })
                    }
                    value={formValues.type}
                  >
                    <option value="MINOR_LATENESS">Retard mineur</option>
                    <option value="MAJOR_LATENESS">Retard majeur</option>
                  </select>
                </div>

                <div className="space-y-2">
                  <FieldLabel htmlFor="sanction-rule-code">Code</FieldLabel>
                  <input
                    className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-bold uppercase text-slate-950 shadow-sm outline-none transition focus:border-accent focus:ring-4 focus:ring-accent/10"
                    id="sanction-rule-code"
                    onChange={(event) =>
                      onChange({
                        ...formValues,
                        code: event.currentTarget.value.toUpperCase(),
                      })
                    }
                    value={formValues.code}
                  />
                </div>
              </>
            ) : null}

            <div className="space-y-2 sm:col-span-2">
              <FieldLabel htmlFor="sanction-rule-name">Nom</FieldLabel>
              <input
                className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-950 shadow-sm outline-none transition focus:border-accent focus:ring-4 focus:ring-accent/10"
                id="sanction-rule-name"
                onChange={(event) =>
                  onChange({ ...formValues, name: event.currentTarget.value })
                }
                value={formValues.name}
              />
            </div>

            <div className="space-y-2 sm:col-span-2">
              <FieldLabel htmlFor="sanction-rule-description">
                Description
              </FieldLabel>
              <textarea
                className="min-h-24 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-950 shadow-sm outline-none transition focus:border-accent focus:ring-4 focus:ring-accent/10"
                id="sanction-rule-description"
                onChange={(event) =>
                  onChange({
                    ...formValues,
                    description: event.currentTarget.value,
                  })
                }
                value={formValues.description}
              />
            </div>

            {mode === 'create' ? (
              <>
                <div className="space-y-2 sm:col-span-2">
                  <FieldLabel htmlFor="sanction-rule-applied-reason">
                    Motif de sanction
                  </FieldLabel>
                  <textarea
                    className="min-h-24 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-950 shadow-sm outline-none transition focus:border-accent focus:ring-4 focus:ring-accent/10"
                    id="sanction-rule-applied-reason"
                    onChange={(event) =>
                      onChange({
                        ...formValues,
                        appliedReason: event.currentTarget.value,
                      })
                    }
                    value={formValues.appliedReason}
                  />
                </div>

                <div className="space-y-2 sm:col-span-2">
                  <FieldLabel htmlFor="sanction-rule-tolerated-reason">
                    Motif de tolérance (optionnel)
                  </FieldLabel>
                  <textarea
                    className="min-h-24 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-950 shadow-sm outline-none transition focus:border-accent focus:ring-4 focus:ring-accent/10"
                    id="sanction-rule-tolerated-reason"
                    onChange={(event) =>
                      onChange({
                        ...formValues,
                        toleratedReason: event.currentTarget.value,
                      })
                    }
                    value={formValues.toleratedReason}
                  />
                </div>
              </>
            ) : null}

            <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3 text-sm font-black text-slate-700">
              <input
                checked={formValues.active}
                className="h-4 w-4 accent-[rgb(244,110,40)]"
                onChange={(event) =>
                  onChange({
                    ...formValues,
                    active: event.currentTarget.checked,
                  })
                }
                type="checkbox"
              />
              Active
            </label>

            <div className="space-y-2">
              <FieldLabel htmlFor="sanction-rule-min">Seuil minimum</FieldLabel>
              <input
                className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-950 shadow-sm outline-none transition focus:border-accent focus:ring-4 focus:ring-accent/10"
                id="sanction-rule-min"
                min="0"
                onChange={(event) =>
                  onChange({
                    ...formValues,
                    latenessMinMinutes: event.currentTarget.value,
                  })
                }
                type="number"
                value={formValues.latenessMinMinutes}
              />
            </div>

            <div className="space-y-2">
              <FieldLabel htmlFor="sanction-rule-max">Seuil maximum</FieldLabel>
              <input
                className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-950 shadow-sm outline-none transition focus:border-accent focus:ring-4 focus:ring-accent/10"
                id="sanction-rule-max"
                min="0"
                onChange={(event) =>
                  onChange({
                    ...formValues,
                    latenessMaxMinutes: event.currentTarget.value,
                  })
                }
                type="number"
                value={formValues.latenessMaxMinutes}
              />
            </div>

            <div className="space-y-2">
              <FieldLabel htmlFor="sanction-rule-tolerance">
                Tolérance mensuelle
              </FieldLabel>
              <input
                className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-950 shadow-sm outline-none transition focus:border-accent focus:ring-4 focus:ring-accent/10"
                id="sanction-rule-tolerance"
                min="0"
                onChange={(event) =>
                  onChange({
                    ...formValues,
                    monthlyTolerance: event.currentTarget.value,
                  })
                }
                required
                type="number"
                value={formValues.monthlyTolerance}
              />
            </div>

            <div className="space-y-2">
              <FieldLabel htmlFor="sanction-rule-amount">
                Montant (FCFA)
              </FieldLabel>
              <input
                className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-950 shadow-sm outline-none transition focus:border-accent focus:ring-4 focus:ring-accent/10"
                id="sanction-rule-amount"
                min="0"
                onChange={(event) =>
                  onChange({
                    ...formValues,
                    amountFcfa: event.currentTarget.value,
                  })
                }
                required
                type="number"
                value={formValues.amountFcfa}
              />
            </div>

            <div className="space-y-2">
              <FieldLabel htmlFor="sanction-rule-priority">Priorité</FieldLabel>
              <input
                className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-950 shadow-sm outline-none transition focus:border-accent focus:ring-4 focus:ring-accent/10"
                id="sanction-rule-priority"
                min="0"
                onChange={(event) =>
                  onChange({
                    ...formValues,
                    priority: event.currentTarget.value,
                  })
                }
                required
                type="number"
                value={formValues.priority}
              />
            </div>
          </div>

          {error ? (
            <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
              {error}
            </p>
          ) : null}

          <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200 pt-4">
            <Button
              disabled={isSaving}
              onClick={onCancel}
              type="button"
              variant="secondary"
            >
              Annuler
            </Button>
            <Button disabled={isSaving} type="submit">
              {mode === 'create' ? 'Créer la règle' : 'Enregistrer'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function SanctionRulesPanel({
  canEdit = false,
  rules,
}: SanctionRulesPanelProps) {
  const router = useRouter();
  const [ruleList, setRuleList] = useState(rules);
  const [editingRule, setEditingRule] = useState<SanctionRuleConfig | null>(
    null,
  );
  const [formMode, setFormMode] = useState<RuleFormMode | null>(null);
  const [formValues, setFormValues] = useState<RuleFormValues | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const displayedRules = useMemo(() => ruleList, [ruleList]);

  function openEditModal(rule: SanctionRuleConfig) {
    setFormMode('edit');
    setEditingRule(rule);
    setFormValues(buildInitialValues(rule));
    setFormError(null);
    setToastMessage(null);
  }

  function openCreateModal() {
    setFormMode('create');
    setEditingRule(null);
    setFormValues(buildCreateInitialValues());
    setFormError(null);
    setToastMessage(null);
  }

  function closeEditModal() {
    if (isSaving) {
      return;
    }

    setEditingRule(null);
    setFormMode(null);
    setFormValues(null);
    setFormError(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!formValues || (formMode === 'edit' && !editingRule?.id)) {
      return;
    }

    const validationError = validateRuleForm(formValues, editingRule, ruleList);

    if (validationError) {
      setFormError(validationError);
      return;
    }

    const editingRuleId = editingRule?.id;

    const commonPayload = {
      active: formValues.active,
      name: formValues.name.trim(),
      description: formValues.description.trim() || null,
      latenessMinMinutes: parseOptionalInteger(formValues.latenessMinMinutes),
      latenessMaxMinutes: parseOptionalInteger(formValues.latenessMaxMinutes),
      monthlyTolerance: parseRequiredInteger(formValues.monthlyTolerance),
      amountFcfa: parseRequiredInteger(formValues.amountFcfa),
      priority: parseRequiredInteger(formValues.priority),
    };

    setIsSaving(true);
    setFormError(null);

    try {
      if (formMode === 'create') {
        const payload: CreateSanctionRulePayload = {
          ...commonPayload,
          type: formValues.type,
          code: formValues.code.trim(),
          appliedReason: formValues.appliedReason.trim(),
          toleratedReason: formValues.toleratedReason.trim() || null,
        };
        const createdRule = await createSanctionRule(payload);

        setRuleList((currentRules) => [...currentRules, createdRule]);
        setEditingRule(null);
        setFormMode(null);
        setFormValues(null);
        setToastMessage('Règle créée avec succès.');
        router.refresh();
        return;
      }

      if (!editingRuleId) {
        return;
      }

      const payload: UpdateSanctionRulePayload = commonPayload;
      const response = await fetch(
        `/api/sanctions/rules/${encodeURIComponent(editingRuleId)}`,
        {
          body: JSON.stringify(payload),
          headers: {
            'Content-Type': 'application/json',
          },
          method: 'PATCH',
        },
      );
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        setFormError(
          typeof data.error === 'string'
            ? data.error
            : 'Impossible de mettre à jour la règle.',
        );
        return;
      }

      const updatedRule = data as SanctionRuleConfig;

      setRuleList((currentRules) =>
        currentRules.map((rule) =>
          rule.id === updatedRule.id ? updatedRule : rule,
        ),
      );
      setEditingRule(null);
      setFormMode(null);
      setFormValues(null);
      setToastMessage('Règle mise à jour avec succès.');
      router.refresh();
    } catch (error) {
      if (error instanceof ApiRequestError) {
        setFormError(error.message);
      } else {
        setFormError(
          formMode === 'create'
            ? 'Création impossible. Vérifiez votre connexion puis réessayez.'
            : 'Mise à jour impossible. Vérifiez votre connexion puis réessayez.',
        );
      }
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <section className="admin-reveal admin-reveal-delay-1 space-y-4">
      <div className="rounded-[28px] border border-white/70 bg-white/95 p-5 shadow-[0_18px_44px_rgba(15,45,58,0.07)]">
        <h2 className="text-2xl font-black leading-tight text-slate-950">
          Règles de sanctions
        </h2>
        <p className="mt-2 max-w-2xl text-sm font-semibold leading-6 text-slate-600">
          {canEdit
            ? 'Configurez les règles disciplinaires appliquées aux employés.'
            : 'Consultez les règles disciplinaires appliquées aux employés.'}
        </p>
      </div>

      {toastMessage ? (
        <div className="rounded-[20px] border border-success/15 bg-success/10 px-4 py-3 text-sm font-black text-success">
          {toastMessage}
        </div>
      ) : null}

      {displayedRules.length === 0 ? (
        <SanctionRuleEmptyState
          canCreate={canEdit}
          onCreate={openCreateModal}
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {displayedRules.map((rule) => (
            <SanctionRuleCard
              canEdit={canEdit}
              key={rule.id ?? `${rule.type}-${rule.priority ?? rule.reason}`}
              onEdit={openEditModal}
              rule={rule}
            />
          ))}
        </div>
      )}

      {canEdit && formMode && formValues ? (
        <SanctionRuleEditModal
          error={formError}
          formValues={formValues}
          isSaving={isSaving}
          mode={formMode}
          onCancel={closeEditModal}
          onChange={setFormValues}
          onSubmit={handleSubmit}
        />
      ) : null}
    </section>
  );
}
