import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AdminNav } from '@/components/admin/admin-nav';
import { LogoutForm } from '@/components/auth/logout-form';
import { MetricCard } from '@/components/dashboard/metric-card';
import { PageShell } from '@/components/layout/page-shell';
import { SanctionsMonthSelector } from '@/components/sanctions/sanctions-month-selector';
import { SanctionRulesPanel } from '@/components/sanctions/sanction-rules-panel';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  getMonthlySanctionsData,
  getSanctionRulesData,
  type SanctionResult,
  type SanctionRuleConfig,
  type SanctionRuleType,
  type SanctionStatus,
} from '@/lib/api';
import { getSessionToken, requireCurrentUser } from '@/lib/auth';
import { cn } from '@/lib/utils';

export const dynamic = 'force-dynamic';

type SanctionsPageProps = {
  searchParams?: Promise<{
    month?: string;
    tab?: string;
  }>;
};

type SanctionsTab = 'monthly' | 'rules';

type DashboardData =
  | {
      ok: true;
      rules: SanctionRuleConfig[];
      sanctions: SanctionResult[];
    }
  | {
      ok: false;
      rules: [];
      sanctions: [];
    };

const futureRuleLabels: Partial<Record<SanctionRuleType, string>> = {
  EARLY_DEPARTURE: 'Départ anticipé',
  UNJUSTIFIED_ABSENCE: 'Absence non justifiée',
  JUSTIFIED_ABSENCE: 'Absence justifiée',
  LEAVE: 'Congé',
  EXTERNAL_MISSION: 'Mission externe',
};

function normalizeTab(value?: string): SanctionsTab {
  return value === 'rules' ? 'rules' : 'monthly';
}

function getCurrentMonth() {
  const now = new Date();

  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(
    2,
    '0',
  )}`;
}

function normalizeMonth(value?: string) {
  return value && /^\d{4}-\d{2}$/.test(value) ? value : getCurrentMonth();
}

function formatMonthLabel(month: string) {
  return new Date(`${month}-01T00:00:00.000Z`).toLocaleDateString('fr-FR', {
    month: 'long',
    year: 'numeric',
  });
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

function formatMoney(value: number) {
  return `${new Intl.NumberFormat('fr-FR').format(value)} FCFA`;
}

function formatSanctionReason(reason: string) {
  const normalizedReason = reason.trim();

  if (
    normalizedReason ===
    'No active sanction rule applies to this attendance record.'
  ) {
    return 'Aucune règle disciplinaire applicable à ce pointage.';
  }

  if (
    normalizedReason ===
    'Major lateness: lateness of 15 minutes or more has no tolerance.'
  ) {
    return 'Retard majeur (15 min ou plus) : sanction appliquée sans tolérance.';
  }

  if (normalizedReason === 'First minor lateness in the month is tolerated.') {
    return 'Premier retard mineur du mois : tolérance accordée.';
  }

  if (
    normalizedReason ===
    'Minor lateness: first occurrence in the month is tolerated; subsequent occurrences are sanctioned.'
  ) {
    return 'Tolérance mensuelle déjà utilisée.';
  }

  if (normalizedReason === 'Prepared for future configuration; inactive in V1.') {
    return 'Règle prévue pour une configuration ultérieure.';
  }

  return reason;
}

function getRuleTypeLabel(ruleType: SanctionRuleType | null) {
  if (ruleType === 'MINOR_LATENESS') {
    return 'Retard mineur';
  }

  if (ruleType === 'MAJOR_LATENESS') {
    return 'Retard majeur';
  }

  return 'Aucune sanction';
}

function getDecisionLabel(status: SanctionStatus) {
  if (status === 'TOLERATED') {
    return 'Tolérance accordée';
  }

  if (status === 'APPLIED') {
    return 'Sanction appliquée';
  }

  return 'Aucune sanction';
}

function getStatusLabel(status: SanctionStatus) {
  if (status === 'TOLERATED') {
    return 'Tolérance accordée';
  }

  if (status === 'APPLIED') {
    return 'Sanction appliquée';
  }

  return 'Non applicable';
}

function getStatusTone(status: SanctionStatus) {
  if (status === 'APPLIED') {
    return 'border-red-500/15 bg-red-50 text-red-700';
  }

  if (status === 'TOLERATED') {
    return 'border-accent/15 bg-accent/10 text-accent';
  }

  return 'border-success/15 bg-success/10 text-success';
}

function getEmployeeDisplay(sanction: SanctionResult) {
  const name = sanction.employeeName?.trim();
  const identifier = sanction.employeeIdentifier?.trim();
  const department = sanction.department?.trim();

  if (!name && !identifier && !department) {
    return {
      name: 'Employé introuvable',
      identifier: sanction.employeeId,
      department: null,
    };
  }

  return {
    name: name || 'Employé introuvable',
    identifier: identifier || sanction.employeeId,
    department: department || 'Sans département',
  };
}

function buildSummary(sanctions: SanctionResult[]) {
  const appliedCount = sanctions.filter(
    (sanction) => sanction.status === 'APPLIED',
  ).length;
  const toleratedCount = sanctions.filter(
    (sanction) => sanction.status === 'TOLERATED',
  ).length;
  const minorLatenessCount = sanctions.filter(
    (sanction) => sanction.ruleType === 'MINOR_LATENESS',
  ).length;
  const majorLatenessCount = sanctions.filter(
    (sanction) => sanction.ruleType === 'MAJOR_LATENESS',
  ).length;
  const totalAmount = sanctions.reduce(
    (total, sanction) =>
      sanction.status === 'APPLIED' ? total + sanction.amount : total,
    0,
  );
  const concernedEmployees = new Set(
    sanctions
      .filter((sanction) => sanction.status !== 'NOT_APPLICABLE')
      .map((sanction) => sanction.employeeId),
  ).size;
  const recommendation =
    appliedCount > 0
      ? 'Sanctions financières à prendre en compte dans le suivi RH.'
      : toleratedCount > 0
        ? 'Tolérances appliquées selon les règles RH.'
        : 'Aucune sanction financière appliquée ce mois-ci.';

  return {
    appliedCount,
    concernedEmployees,
    majorLatenessCount,
    minorLatenessCount,
    recommendation,
    toleratedCount,
    totalAmount,
  };
}

function SanctionsErrorState({ message }: { message?: string }) {
  return (
    <Card className="rounded-[28px] border-red-200 bg-red-50/80 shadow-[0_18px_44px_rgba(127,29,29,0.08)]">
      <CardContent className="p-5">
        <Badge variant="danger">Erreur</Badge>
        <p className="mt-3 text-sm font-bold text-red-700">
          {message ?? 'Impossible de charger les sanctions RH.'}
        </p>
      </CardContent>
    </Card>
  );
}

function SanctionsTabs({
  activeTab,
  month,
}: {
  activeTab: SanctionsTab;
  month: string;
}) {
  const tabs = [
    {
      href: `/sanctions?tab=monthly&month=${encodeURIComponent(month)}`,
      id: 'monthly',
      label: 'Vue mensuelle',
    },
    {
      href: `/sanctions?tab=rules&month=${encodeURIComponent(month)}`,
      id: 'rules',
      label: 'Règles de sanctions',
    },
  ] as const;

  return (
    <nav className="admin-reveal admin-reveal-delay-1 flex flex-wrap gap-2 rounded-[24px] border border-white/70 bg-white/95 p-2 shadow-[0_14px_34px_rgba(15,45,58,0.06)]">
      {tabs.map((tab) => (
        <Link
          className={cn(
            'rounded-2xl px-4 py-2.5 text-sm font-black transition',
            activeTab === tab.id
              ? 'bg-primary text-white shadow-[0_10px_24px_rgba(16,50,60,0.16)]'
              : 'text-slate-600 hover:bg-slate-50 hover:text-slate-950',
          )}
          href={tab.href}
          key={tab.id}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}

function RulesCard({ rules }: { rules: SanctionRuleConfig[] }) {
  const inactiveRules = rules.filter((rule) => !rule.active);

  return (
    <Card className="rounded-[28px] border-slate-200/80 bg-white/95 shadow-[0_18px_44px_rgba(15,45,58,0.07)]">
      <CardHeader className="border-b border-slate-200/70 pb-4">
        <Badge variant="outline">Règles</Badge>
        <CardTitle className="mt-2 text-xl text-slate-950">
          Règles disciplinaires
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 p-4">
        <div className="grid gap-3 lg:grid-cols-2">
          <div className="rounded-[22px] border border-accent/15 bg-accent/10 p-4">
            <Badge className="bg-accent/15 text-accent" variant="warning">
              Active
            </Badge>
            <h3 className="mt-3 text-base font-black text-slate-950">
              Retard mineur
            </h3>
            <ul className="mt-3 space-y-2 text-sm font-semibold leading-6 text-slate-700">
              <li>1er retard mineur du mois : tolérance</li>
              <li>À partir du 2e : 2 000 FCFA</li>
            </ul>
          </div>

          <div className="rounded-[22px] border border-red-500/15 bg-red-50 p-4">
            <Badge className="bg-red-100 text-red-700" variant="danger">
              Active
            </Badge>
            <h3 className="mt-3 text-base font-black text-slate-950">
              Retard majeur
            </h3>
            <ul className="mt-3 space-y-2 text-sm font-semibold leading-6 text-slate-700">
              <li>Retard ≥ 15 min : 5 000 FCFA</li>
            </ul>
          </div>
        </div>

        <div className="rounded-[22px] border border-slate-200 bg-slate-50/80 p-4">
          <Badge variant="outline">Prévu plus tard</Badge>
          <div className="mt-3 flex flex-wrap gap-2">
            {inactiveRules.map((rule) => (
              <span
                className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm font-bold text-slate-600 shadow-sm"
                key={rule.type}
              >
                {futureRuleLabels[rule.type] ?? rule.type}
              </span>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

async function loadDashboardData(
  token: string,
  month: string,
  tab: SanctionsTab,
): Promise<DashboardData> {
  try {
    if (tab === 'rules') {
      const rules = await getSanctionRulesData(token);

      return {
        ok: true,
        rules,
        sanctions: [],
      };
    }

    const [sanctions, rules] = await Promise.all([
      getMonthlySanctionsData(token, month),
      getSanctionRulesData(token),
    ]);

    return {
      ok: true,
      rules,
      sanctions,
    };
  } catch {
    return {
      ok: false,
      rules: [],
      sanctions: [],
    };
  }
}

export default async function SanctionsPage({
  searchParams,
}: SanctionsPageProps) {
  const user = await requireCurrentUser();

  if (user.accessRole !== 'ADMIN') {
    redirect('/my-attendance');
  }

  const token = await getSessionToken();

  if (!token) {
    redirect('/login');
  }

  const params = await searchParams;
  const month = normalizeMonth(params?.month);
  const activeTab = normalizeTab(params?.tab);
  const data = await loadDashboardData(token, month, activeTab);
  const summary = buildSummary(data.sanctions);

  return (
    <PageShell contentClassName="gap-4 lg:gap-5">
      <header className="admin-reveal rounded-[30px] border border-white/70 bg-white/95 p-4 shadow-[0_18px_46px_rgba(15,45,58,0.08)] sm:p-5 lg:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <AdminNav current="sanctions" />
            <LogoutForm />
          </div>

          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_260px] lg:items-end">
            <div className="space-y-2">
              <Badge className="bg-accent/10 text-accent" variant="warning">
                {activeTab === 'monthly'
                  ? formatMonthLabel(month)
                  : 'Lecture seule'}
              </Badge>
              <h1 className="text-2xl font-black leading-tight text-slate-950 sm:text-3xl">
                {activeTab === 'monthly'
                  ? 'Sanctions RH'
                  : 'Règles de sanctions'}
              </h1>
              <p className="max-w-2xl text-sm font-semibold leading-6 text-slate-600">
                {activeTab === 'monthly'
                  ? 'Suivez les tolérances, sanctions appliquées et montants disciplinaires.'
                  : 'Configurez les règles disciplinaires appliquées aux employés.'}
              </p>
            </div>
            {activeTab === 'monthly' ? (
              <SanctionsMonthSelector month={month} />
            ) : null}
          </div>
        </div>
      </header>

      <SanctionsTabs activeTab={activeTab} month={month} />

      {data.ok ? (
        activeTab === 'monthly' ? (
          <>
          <section className="admin-reveal admin-reveal-delay-1 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <MetricCard
              hint="Décisions disciplinaires appliquées."
              label="Sanctions appliquées"
              periodLabel={formatMonthLabel(month)}
              tone="danger"
              value={summary.appliedCount}
            />
            <MetricCard
              hint="Premiers retards mineurs tolérés."
              label="Tolérances accordées"
              periodLabel={formatMonthLabel(month)}
              tone="warning"
              value={summary.toleratedCount}
            />
            <MetricCard
              hint="Montant disciplinaire cumulé."
              label="Montant total"
              periodLabel={formatMonthLabel(month)}
              tone="success"
              value={formatMoney(summary.totalAmount)}
            />
            <MetricCard
              hint="Cas de retard inférieur à 15 min."
              label="Retards mineurs"
              periodLabel={formatMonthLabel(month)}
              tone="warning"
              value={summary.minorLatenessCount}
            />
            <MetricCard
              hint="Cas de retard de 15 min ou plus."
              label="Retards majeurs"
              periodLabel={formatMonthLabel(month)}
              tone="danger"
              value={summary.majorLatenessCount}
            />
          </section>

          <section className="admin-reveal admin-reveal-delay-2 grid gap-4 xl:grid-cols-[0.92fr_1.08fr]">
            <Card className="rounded-[28px] border-slate-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.94))] shadow-[0_18px_44px_rgba(15,45,58,0.07)]">
              <CardHeader className="border-b border-slate-200/70 pb-4">
                <Badge variant="outline">Synthèse disciplinaire</Badge>
                <CardTitle className="mt-2 text-xl text-slate-950">
                  Lecture RH du mois
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 p-4">
                <div className="rounded-[22px] border border-slate-200 bg-white/90 p-4 shadow-sm">
                  <p className="text-base font-black text-slate-950">
                    {summary.recommendation}
                  </p>
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="rounded-[20px] border border-slate-200 bg-slate-50/80 p-3">
                    <p className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-500">
                      Mois
                    </p>
                    <p className="mt-2 text-sm font-black text-slate-950">
                      {formatMonthLabel(month)}
                    </p>
                  </div>
                  <div className="rounded-[20px] border border-success/15 bg-success/10 p-3">
                    <p className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-500">
                      Montant total
                    </p>
                    <p className="mt-2 text-sm font-black text-success">
                      {formatMoney(summary.totalAmount)}
                    </p>
                  </div>
                  <div className="rounded-[20px] border border-slate-200 bg-slate-50/80 p-3">
                    <p className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-500">
                      Employés concernés
                    </p>
                    <p className="mt-2 text-sm font-black text-slate-950">
                      {summary.concernedEmployees}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <RulesCard rules={data.rules} />
          </section>

          <section className="admin-reveal admin-reveal-delay-3">
            <Card className="overflow-hidden rounded-[28px] border-slate-200/80 bg-white/95 shadow-[0_18px_44px_rgba(15,45,58,0.07)]">
              <CardHeader className="border-b border-slate-200/70 pb-4">
                <Badge variant="outline">Tableau des sanctions</Badge>
                <CardTitle className="mt-2 text-xl text-slate-950">
                  Résultats du mois
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {data.sanctions.length === 0 ? (
                  <div className="p-4">
                    <p className="rounded-[22px] border border-dashed border-slate-300 bg-slate-50/80 px-5 py-10 text-center text-sm font-bold text-slate-600">
                      Aucune sanction enregistrée pour ce mois.
                    </p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-[980px] border-separate border-spacing-0 text-left">
                      <thead>
                        <tr>
                          {[
                            'Date',
                            'Employé',
                            'Type',
                            'Décision',
                            'Motif',
                            'Montant',
                            'Statut',
                          ].map((header) => (
                            <th
                              className="sticky top-0 bg-slate-50/95 px-3 py-3 text-[11px] font-black uppercase tracking-[0.14em] text-slate-500"
                              key={header}
                            >
                              {header}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {data.sanctions.map((sanction, index) => {
                          const employee = getEmployeeDisplay(sanction);

                          return (
                            <tr
                              className={
                                index % 2 === 0 ? 'bg-white' : 'bg-slate-50/55'
                              }
                              key={sanction.attendanceId}
                            >
                              <td className="px-3 py-3 text-sm font-bold text-slate-700">
                                {formatDate(sanction.date)}
                              </td>
                              <td className="px-3 py-3">
                                <p className="text-sm font-black text-slate-950">
                                  {employee.name}
                                </p>
                                <p className="mt-0.5 text-xs font-bold text-slate-500">
                                  {employee.identifier}
                                </p>
                                {employee.department ? (
                                  <p className="mt-0.5 text-xs font-semibold text-slate-500">
                                    {employee.department}
                                  </p>
                                ) : null}
                              </td>
                              <td className="px-3 py-3 text-sm font-bold text-slate-700">
                                {getRuleTypeLabel(sanction.ruleType)}
                              </td>
                              <td className="px-3 py-3 text-sm font-bold text-slate-700">
                                {getDecisionLabel(sanction.status)}
                              </td>
                              <td className="max-w-[280px] px-3 py-3 text-sm font-semibold leading-5 text-slate-600">
                                {formatSanctionReason(sanction.reason)}
                              </td>
                              <td className="px-3 py-3 text-sm font-black text-slate-950">
                                {formatMoney(sanction.amount)}
                              </td>
                              <td className="px-3 py-3">
                                <span
                                  className={cn(
                                    'inline-flex rounded-full border px-2.5 py-1 text-xs font-black',
                                    getStatusTone(sanction.status),
                                  )}
                                >
                                  {getStatusLabel(sanction.status)}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </section>
          </>
        ) : (
          <SanctionRulesPanel rules={data.rules} />
        )
      ) : (
        <SanctionsErrorState
          message={
            activeTab === 'rules'
              ? 'Impossible de charger les règles de sanctions.'
              : undefined
          }
        />
      )}
    </PageShell>
  );
}
