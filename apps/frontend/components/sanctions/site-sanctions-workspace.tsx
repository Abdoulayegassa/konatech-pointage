import type { SanctionResult } from '@/lib/api';

function formatDate(value: string) {
  return new Date(value).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function formatAmount(value: number) {
  return `${new Intl.NumberFormat('fr-FR').format(value)} FCFA`;
}

function statusLabel(status: SanctionResult['status']) {
  if (status === 'APPLIED') return 'Sanction appliquée';
  if (status === 'TOLERATED') return 'Tolérance accordée';
  return 'Non applicable';
}

function ruleLabel(ruleType: SanctionResult['ruleType']) {
  if (ruleType === 'MINOR_LATENESS') return 'Retard mineur';
  if (ruleType === 'MAJOR_LATENESS') return 'Retard majeur';
  return 'Aucune sanction';
}

export function SiteSanctionsWorkspace({
  siteName,
  month,
  sanctions,
  error,
}: {
  siteName: string;
  month: string;
  sanctions: SanctionResult[] | null;
  error: string | null;
}) {
  return (
    <main className="space-y-5">
      <header className="space-y-2">
        <p className="text-xs font-black uppercase tracking-wider text-slate-500">
          Résultats du site
        </p>
        <h2 className="text-2xl font-black">Sanctions — {siteName}</h2>
        <p className="max-w-3xl text-sm text-slate-600">
          Les règles sont définies au niveau de l’organisation. Cette page affiche uniquement les résultats liés aux pointages de ce site; le seuil mensuel tient compte des occurrences de l’employé dans toute l’organisation.
        </p>
      </header>

      <form action="" className="flex flex-wrap items-end gap-3" method="get">
        <label className="flex flex-col gap-1 text-sm font-semibold text-slate-700">
          Mois
          <input
            className="h-10 rounded-xl border border-slate-300 bg-white px-3"
            max="2099-12"
            min="2000-01"
            name="month"
            required
            type="month"
            defaultValue={month}
          />
        </label>
        <button
          className="h-10 rounded-xl bg-primary px-4 text-sm font-bold text-white"
          type="submit"
        >
          Afficher
        </button>
      </form>

      {error ? (
        <p className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700" role="alert">
          {error}
        </p>
      ) : sanctions?.length ? (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
          <table className="w-full min-w-[780px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                {['Date', 'Employé', 'Type', 'Décision', 'Motif', 'Montant'].map((label) => (
                  <th className="px-3 py-3" key={label}>{label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sanctions.map((sanction) => (
                <tr className="border-t border-slate-100" key={sanction.attendanceId}>
                  <td className="px-3 py-3 font-semibold">{formatDate(sanction.date)}</td>
                  <td className="px-3 py-3">
                    <p className="font-bold">{sanction.employeeName ?? 'Employé'}</p>
                    <p className="text-xs text-slate-500">{sanction.employeeIdentifier ?? sanction.employeeId}</p>
                  </td>
                  <td className="px-3 py-3">{ruleLabel(sanction.ruleType)}</td>
                  <td className="px-3 py-3">{statusLabel(sanction.status)}</td>
                  <td className="max-w-sm px-3 py-3 text-slate-600">{sanction.reason}</td>
                  <td className="px-3 py-3 font-bold">{formatAmount(sanction.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm font-semibold text-slate-600">
          Aucune présence avec résultat de sanction pour ce site et ce mois.
        </p>
      )}
    </main>
  );
}
