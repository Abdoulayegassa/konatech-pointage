'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { FieldLabel, Select, Textarea } from '@/components/ui/form-controls';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/primitives/dialog';

type Status = 'PENDING_REVIEW' | 'APPROVED' | 'RESOLVED' | 'REJECTED' | 'EXPIRED';
type Row = {
  id: string; employeeId: string; siteId: string | null; reasonCode: string; status: Status;
  employee: { firstName: string; lastName: string; employeeIdentifier: string };
  site: { name: string } | null; createdAt: string; decidedAt: string | null;
  resultingAttendanceId: string | null;
  syncRequest: { clientRequestId: string; action: 'CHECK_IN' | 'CHECK_OUT'; capturedAt: string };
};
type PageData = { items: Row[]; total: number; page: number; pageSize: number; totalPages: number };
type Detail = Row & {
  reason: string; comments: string | null; evidenceSnapshot: Record<string, unknown> | null;
  selfieMimeType: string | null; selfieByteSize: number | null; selfieDeletedAt: string | null;
  hasSelfie: boolean; decidedByUserId: string | null; decisionReason: string | null;
  decisions: { id: string; decision: string; reason: string; decidedAt: string }[];
};
const labels: Record<Status, string> = {
  PENDING_REVIEW: 'À vérifier', APPROVED: 'Approbation en cours', RESOLVED: 'Pris en compte',
  REJECTED: 'Rejeté', EXPIRED: 'Expiré',
};
const statusVariant: Record<Status, 'warning' | 'success' | 'danger' | 'neutral'> = {
  PENDING_REVIEW: 'warning', APPROVED: 'warning', RESOLVED: 'success', REJECTED: 'danger', EXPIRED: 'neutral',
};
function dateTime(value?: string | null, timeZone?: string) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short', ...(timeZone ? { timeZone } : {}) }).format(new Date(value));
}
function errorText(response: Response) {
  return response.status === 403 ? 'Votre accès administrateur ne permet plus cette opération.' : 'Une erreur est survenue. Réessayez.';
}

export function ReconciliationWorkspace({ sites, timeZone }: { sites: { id: string; name: string }[]; timeZone?: string }) {
  const [status, setStatus] = useState('PENDING_REVIEW');
  const [siteId, setSiteId] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<PageData | null>(null);
  const [selectedId, setSelectedId] = useState('');
  const [detail, setDetail] = useState<Detail | null>(null);
  const [reason, setReason] = useState('');
  const [decisionToConfirm, setDecisionToConfirm] = useState<'approve' | 'reject' | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const loadList = useCallback(async (nextPage = page) => {
    setLoading(true); setError('');
    const params = new URLSearchParams({ status, page: String(nextPage), pageSize: '25' });
    if (siteId) params.set('siteId', siteId);
    try {
      const response = await fetch(`/api/attendance/offline-reconciliation?${params}`, { cache: 'no-store' });
      if (!response.ok) throw new Error(errorText(response));
      setData(await response.json() as PageData);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Impossible de charger les pointages à vérifier.'); }
    finally { setLoading(false); }
  }, [page, siteId, status]);

  const loadDetail = useCallback(async (id: string, quiet = false) => {
    if (!quiet) setError('');
    try {
      const response = await fetch(`/api/attendance/offline-reconciliation/${encodeURIComponent(id)}`, { cache: 'no-store' });
      if (!response.ok) throw new Error(response.status === 404 ? 'Ce dossier n’est plus disponible dans votre organisation.' : errorText(response));
      setDetail(await response.json() as Detail);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Impossible de charger le dossier.'); }
  }, []);

  useEffect(() => { void loadList(page); }, [loadList, page]);
  useEffect(() => { if (selectedId) void loadDetail(selectedId); else setDetail(null); }, [loadDetail, selectedId]);
  function changeFilter(setter: (value: string) => void, value: string) { setter(value); setPage(1); }

  async function decide(decision: 'approve' | 'reject') {
    if (!detail || reason.trim().length < 5 || busy || detail.status !== 'PENDING_REVIEW') return;
    setBusy(true); setError(''); setMessage('');
    try {
      const response = await fetch(`/api/attendance/offline-reconciliation/${encodeURIComponent(detail.id)}/${decision}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason: reason.trim() }),
      });
      if (response.status === 409) {
        await loadDetail(detail.id, true);
        await loadList(page);
        setMessage('Ce dossier a été traité entre-temps. Son état actuel a été rechargé.');
        setDecisionToConfirm(null);
      } else if (!response.ok) {
        setError(response.status === 400 ? 'Le motif doit contenir entre 5 et 1 000 caractères.' : errorText(response));
        if (response.status >= 500) await loadDetail(detail.id, true);
      } else {
        setReason('');
        setMessage(decision === 'approve' ? 'Pointage pris en compte.' : 'Pointage rejeté.');
        await loadDetail(detail.id, true);
        await loadList(page);
        setDecisionToConfirm(null);
      }
    } catch { setError('Décision non confirmée. Rechargez le dossier pour vérifier son état avant toute nouvelle action.'); await loadDetail(detail.id, true); }
    finally { setBusy(false); }
  }

  return <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.8fr)]">
    <div className="min-w-0 space-y-3">
      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4">
        <div className="min-w-40 flex-1"><FieldLabel htmlFor="reconciliation-status">État</FieldLabel><Select id="reconciliation-status" value={status} onChange={(e) => changeFilter(setStatus, e.target.value)}>
          <option value="PENDING_REVIEW">À vérifier</option><option value="RESOLVED">Pris en compte</option><option value="REJECTED">Rejeté</option><option value="EXPIRED">Expiré</option><option value="APPROVED">Approbation en cours</option>
        </Select></div>
        <div className="min-w-40 flex-1"><FieldLabel htmlFor="reconciliation-site">Site</FieldLabel><Select id="reconciliation-site" value={siteId} onChange={(e) => changeFilter(setSiteId, e.target.value)}><option value="">Tous les sites</option>{sites.map((site) => <option key={site.id} value={site.id}>{site.name}</option>)}</Select></div>
        <Button type="button" variant="secondary" onClick={() => void loadList(page)} loading={loading}>Actualiser</Button>
      </div>
      {error ? <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p> : null}
      {message ? <p role="status" className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">{message}</p> : null}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        {loading && !data ? <p className="p-6 text-sm text-slate-600">Chargement des dossiers…</p> : null}
        {!loading && data?.items.length === 0 ? <div className="p-8 text-center"><h2 className="font-semibold text-slate-900">Aucun pointage dans cette liste</h2><p className="mt-1 text-sm text-slate-600">Les dossiers correspondants apparaîtront ici.</p></div> : null}
        {data && data.items.length > 0 ? <div className="divide-y divide-slate-100">
          {data.items.map((item) => <button type="button" key={item.id} onClick={() => { setSelectedId(item.id); setMessage(''); setReason(''); }} aria-current={selectedId === item.id ? 'true' : undefined} className={`grid w-full gap-2 px-4 py-3 text-left hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary sm:grid-cols-[1fr_auto] ${selectedId === item.id ? 'bg-orange-50/60' : ''}`}>
            <span className="min-w-0"><span className="block truncate font-semibold text-slate-900">{item.employee.firstName} {item.employee.lastName}</span><span className="mt-0.5 block text-xs text-slate-600">{item.site?.name ?? 'Site indisponible'} · {item.syncRequest.action === 'CHECK_IN' ? 'Entrée' : 'Sortie'} · {dateTime(item.syncRequest.capturedAt, timeZone)}</span></span>
            <span className="flex items-center gap-2"><Badge variant={statusVariant[item.status]}>{labels[item.status]}</Badge><span className="text-xs text-slate-500">{dateTime(item.createdAt, timeZone)}</span></span>
          </button>)}
        </div> : null}
      </div>
      {data && data.totalPages > 0 ? <div className="flex items-center justify-between gap-3 text-sm text-slate-600"><Button type="button" size="sm" variant="secondary" disabled={page <= 1 || loading} onClick={() => setPage((p) => Math.max(1, p - 1))}>Précédent</Button><span>Page {data.page} / {data.totalPages} · {data.total} dossiers</span><Button type="button" size="sm" variant="secondary" disabled={page >= data.totalPages || loading} onClick={() => setPage((p) => p + 1)}>Suivant</Button></div> : null}
    </div>
    <div className="min-w-0 rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
      {!detail ? <div className="flex min-h-40 items-center justify-center text-center text-sm text-slate-500">Sélectionnez un dossier pour examiner les informations et les preuves.</div> : <div className="space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-2"><div><h2 className="text-lg font-semibold text-slate-950">{detail.employee.firstName} {detail.employee.lastName}</h2><p className="text-sm text-slate-600">Matricule {detail.employee.employeeIdentifier}</p></div><Badge variant={statusVariant[detail.status]}>{labels[detail.status]}</Badge></div>
        <dl className="grid grid-cols-[minmax(7rem,auto)_1fr] gap-x-3 gap-y-2 border-y border-slate-100 py-4 text-sm"><dt className="text-slate-500">Action</dt><dd>{detail.syncRequest.action === 'CHECK_IN' ? 'Entrée' : 'Sortie'}</dd><dt className="text-slate-500">Heure enregistrée</dt><dd className="tabular-nums">{dateTime(detail.syncRequest.capturedAt, timeZone)}</dd><dt className="text-slate-500">Site</dt><dd>{detail.site?.name ?? 'Site indisponible'}</dd><dt className="text-slate-500">Signalement</dt><dd>{detail.reason}</dd>{detail.comments ? <><dt className="text-slate-500">Commentaire employé</dt><dd className="break-words">{detail.comments}</dd></> : null}</dl>
        <section aria-labelledby="review-gps-title"><h3 id="review-gps-title" className="text-sm font-semibold">Preuve GPS</h3>{(() => { const e = detail.evidenceSnapshot ?? {}; const lat = e.latitude; const lng = e.longitude; return typeof lat === 'number' && typeof lng === 'number' ? <p className="mt-1 text-sm text-slate-700">{lat.toFixed(6)}, {lng.toFixed(6)}{typeof e.accuracyMeters === 'number' ? ` · précision ${Math.round(e.accuracyMeters)} m` : ''}{typeof e.evidenceCapturedAt === 'string' ? ` · ${dateTime(e.evidenceCapturedAt, timeZone)}` : ''}</p> : <p className="mt-1 text-sm text-slate-500">Aucune position GPS enregistrée pour cet événement.</p>; })()}</section>
        <section aria-labelledby="review-selfie-title"><h3 id="review-selfie-title" className="text-sm font-semibold">Preuve selfie</h3>{detail.hasSelfie && !detail.selfieDeletedAt ? <img src={`/api/attendance/offline-reconciliation/${encodeURIComponent(detail.id)}/selfie`} alt="Selfie transmis avec le pointage" className="mt-2 max-h-72 w-full rounded-lg border border-slate-200 object-contain" /> : <p className="mt-1 text-sm text-slate-500">{detail.selfieDeletedAt ? 'La preuve selfie n’est plus disponible.' : 'Aucun selfie disponible.'}</p>}</section>
        {detail.decisions.length ? <section className="space-y-2 border-t border-slate-100 pt-4"><h3 className="text-sm font-semibold">Décision enregistrée</h3>{detail.decisions.map((decision) => <div key={decision.id} className="text-sm"><p className="font-medium">{decision.decision === 'APPROVE' ? 'Pris en compte' : 'Rejeté'} · {dateTime(decision.decidedAt, timeZone)}</p><p className="mt-1 text-slate-600">Motif : {decision.reason}</p></div>)}{detail.resultingAttendanceId ? <p className="text-xs text-slate-500">Résultat durable : pointage enregistré.</p> : detail.status === 'REJECTED' ? <p className="text-xs text-slate-500">Résultat durable : pointage rejeté, aucune présence créée.</p> : null}</section> : null}
        {detail.status === 'PENDING_REVIEW' ? <section className="space-y-3 border-t border-slate-100 pt-4"><div><FieldLabel htmlFor="decision-reason">Motif de décision <span className="text-danger">(obligatoire)</span></FieldLabel><Textarea id="decision-reason" value={reason} onChange={(e) => setReason(e.target.value)} minLength={5} maxLength={1000} required aria-describedby="decision-reason-hint" placeholder="Expliquez votre décision…" /><p id="decision-reason-hint" className="mt-1 text-xs text-slate-500">5 à 1 000 caractères. Ce motif est conservé dans l’historique du dossier.</p></div><div className="flex flex-col gap-2 sm:flex-row"><Button type="button" disabled={reason.trim().length < 5 || busy} loading={busy} onClick={() => setDecisionToConfirm('approve')} className="flex-1">Prendre en compte</Button><Button type="button" variant="destructive" disabled={reason.trim().length < 5 || busy} onClick={() => setDecisionToConfirm('reject')} className="flex-1">Rejeter</Button></div></section> : null}
        {detail.status === 'EXPIRED' ? <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-600">Ce pointage a expiré et ne peut pas être approuvé depuis cette revue.</p> : null}
      </div>}
    </div>
    <Dialog
      onOpenChange={(open) => {
        if (!open && !busy) setDecisionToConfirm(null);
      }}
      open={decisionToConfirm !== null}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{decisionToConfirm === 'approve' ? 'Confirmer la prise en compte ?' : 'Confirmer le rejet ?'}</DialogTitle>
          <DialogDescription>
            {decisionToConfirm === 'approve'
              ? 'Le serveur revérifiera les règles et les preuves avant d’enregistrer ce pointage. Un conflit ou une expiration peut empêcher sa prise en compte.'
              : 'Ce dossier sera rejeté. Cette décision ne pourra pas être annulée.'}
          </DialogDescription>
        </DialogHeader>
        <p className="break-words rounded-lg bg-slate-50 p-3 text-sm text-slate-700"><span className="font-semibold">Motif :</span> {reason.trim()}</p>
        <DialogFooter>
          <Button disabled={busy} onClick={() => setDecisionToConfirm(null)} type="button" variant="secondary">Retour</Button>
          <Button
            disabled={busy || !decisionToConfirm || reason.trim().length < 5}
            loading={busy}
            onClick={() => {
              if (decisionToConfirm) void decide(decisionToConfirm);
            }}
            type="button"
            variant={decisionToConfirm === 'reject' ? 'destructive' : 'default'}
          >
            {decisionToConfirm === 'approve' ? 'Confirmer la prise en compte' : 'Confirmer le rejet'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </section>;
}
