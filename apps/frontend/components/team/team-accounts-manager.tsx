'use client';

import { FormEvent, useMemo, useState } from 'react';
import { AdminEmptyState } from '@/components/admin/admin-empty-state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getClientErrorMessage } from '@/lib/client-error';
import Link from 'next/link';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/primitives/dialog';
import type {
  MembershipRole,
  MembershipStatus,
  OrganizationInvitation,
  OrganizationMember,
} from '@/lib/api';

const roleLabels: Record<MembershipRole, string> = {
  ADMIN: 'Administrateur',
  EMPLOYEE: 'Employé',
};

const statusLabels: Record<MembershipStatus, string> = {
  ACTIVE: 'Actif',
  SUSPENDED: 'Suspendu',
  REVOKED: 'Révoqué',
};

type Feedback = { tone: 'success' | 'error'; message: string } | null;

function getInvitationStatus(invitation: OrganizationInvitation) {
  if (invitation.acceptedAt)
    return { label: 'Acceptée', tone: 'success' as const };
  if (invitation.revokedAt)
    return { label: 'Révoquée', tone: 'danger' as const };
  if (new Date(invitation.expiresAt) <= new Date()) {
    return { label: 'Expirée', tone: 'outline' as const };
  }
  return { label: 'En attente', tone: 'warning' as const };
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value));
}

export function TeamAccountsManager({
  view,
  administratorLimit,
  currentMembershipId,
  initialInvitations,
  initialMembers,
}: {
  view: 'members' | 'invitations';
  administratorLimit: number | null;
  currentMembershipId: string;
  initialInvitations: OrganizationInvitation[];
  initialMembers: OrganizationMember[];
}) {
  const [members, setMembers] = useState(initialMembers);
  const [invitations, setInvitations] = useState(initialInvitations);
  const [email, setEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<MembershipRole>('EMPLOYEE');
  const [acceptanceUrl, setAcceptanceUrl] = useState('');
  const [copyMessage, setCopyMessage] = useState('');
  const [search, setSearch] = useState('');
  const [memberRoleFilter, setMemberRoleFilter] = useState<'all' | MembershipRole>('all');
  const [memberStatusFilter, setMemberStatusFilter] = useState<'all' | MembershipStatus>('all');
  const [invitationSearch, setInvitationSearch] = useState('');
  const [invitationStatus, setInvitationStatus] = useState('all');
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);

  const filteredMembers = useMemo(() => {
    const query = search.trim().toLowerCase();
    return members.filter(
      (member) =>
        !query ||
        member.user.normalizedEmail.toLowerCase().includes(query) ||
        roleLabels[member.role].toLowerCase().includes(query),
    ).filter((member) => (memberRoleFilter === 'all' || member.role === memberRoleFilter) && (memberStatusFilter === 'all' || member.status === memberStatusFilter));
  }, [members, memberRoleFilter, memberStatusFilter, search]);
  const filteredInvitations = invitations.filter((invitation) => {
    const state = getInvitationStatus(invitation).label;
    return invitation.email.toLowerCase().includes(invitationSearch.trim().toLowerCase()) && (invitationStatus === 'all' || state === invitationStatus);
  });

  const pendingCount = invitations.filter(
    (invitation) => getInvitationStatus(invitation).label === 'En attente',
  ).length;
  const activeCount = members.filter(
    (member) => member.status === 'ACTIVE',
  ).length;
  const activeAdministratorCount = members.filter(
    (member) => member.status === 'ACTIVE' && member.role === 'ADMIN',
  ).length;
  const pendingAdministratorCount = invitations.filter(
    (invitation) =>
      invitation.role === 'ADMIN' &&
      getInvitationStatus(invitation).label === 'En attente',
  ).length;
  const reservedAdministratorCount =
    activeAdministratorCount + pendingAdministratorCount;

  async function createInvitation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy('invite');
    setFeedback(null);
    try {
      const response = await fetch('/api/team/invitations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), role: inviteRole }),
      });
      const payload = (await response.json().catch(() => ({}))) as
        | { invitation: OrganizationInvitation; invitationToken?: string }
        | { error?: string };
      if (!response.ok || !('invitation' in payload)) {
        const errorMessage = getClientErrorMessage(
          payload,
          "Impossible de créer l'invitation.",
        );
        throw new Error(
          errorMessage.includes('Plan quota reached for activeAdministrators')
            ? 'La limite d’administrateurs de votre organisation est atteinte. Les comptes actifs et les invitations ADMIN en attente utilisent une place. Révoquez une invitation en attente ou contactez la plateforme pour ajuster le plan.'
            : errorMessage,
        );
      }
      setInvitations((current) => [payload.invitation, ...current]);
      setAcceptanceUrl(
        payload.invitationToken
          ? `${window.location.origin}/invitations/accept?token=${encodeURIComponent(payload.invitationToken)}`
          : '',
      );
      setCopyMessage('');
      setEmail('');
      setFeedback({
        tone: 'success',
        message: `Invitation ${roleLabels[payload.invitation.role]} créée pour ${payload.invitation.email}.`,
      });
    } catch (error) {
      setFeedback({
        tone: 'error',
        message:
          error instanceof Error ? error.message : 'Invitation impossible.',
      });
    } finally {
      setBusy(null);
    }
  }

  async function copyInvitationLink() {
    if (!acceptanceUrl) return;
    try {
      await navigator.clipboard.writeText(acceptanceUrl);
      setCopyMessage('Lien copié. Transmettez-le uniquement à la personne invitée.');
    } catch {
      setCopyMessage('Copie impossible sur cet appareil. Sélectionnez le lien ci-dessus pour le copier.');
    }
  }

  async function updateMember(
    member: OrganizationMember,
    kind: 'role' | 'status',
    value: MembershipRole | MembershipStatus,
  ) {
    const description =
      kind === 'role'
        ? `Attribuer le rôle ${roleLabels[value as MembershipRole]} à ${member.user.normalizedEmail} ?`
        : `${value === 'ACTIVE' ? 'Réactiver' : 'Suspendre'} l'accès de ${member.user.normalizedEmail} ?`;
    if (!window.confirm(description)) return;
    setBusy(member.id);
    setFeedback(null);
    try {
      const response = await fetch(`/api/team/members/${member.id}/${kind}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [kind]: value }),
      });
      const payload = (await response.json().catch(() => ({}))) as
        | OrganizationMember
        | { error?: string };
      if (!response.ok || !('id' in payload)) {
        throw new Error(
          getClientErrorMessage(payload, 'Modification du membre impossible.'),
        );
      }
      setMembers((current) =>
        current.map((item) => (item.id === payload.id ? payload : item)),
      );
      setFeedback({ tone: 'success', message: 'Accès mis à jour.' });
    } catch (error) {
      setFeedback({
        tone: 'error',
        message:
          error instanceof Error ? error.message : 'Modification impossible.',
      });
    } finally {
      setBusy(null);
    }
  }

  async function revokeInvitation(invitation: OrganizationInvitation) {
    if (
      !window.confirm(`Révoquer l'invitation envoyée à ${invitation.email} ?`)
    ) {
      return;
    }
    setBusy(invitation.id);
    setFeedback(null);
    try {
      const response = await fetch(
        `/api/team/invitations/${invitation.id}/revoke`,
        { method: 'PATCH' },
      );
      const payload = (await response.json().catch(() => ({}))) as
        | OrganizationInvitation
        | { error?: string };
      if (!response.ok || !('id' in payload)) {
        throw new Error(
          getClientErrorMessage(
            payload,
            "Révocation de l'invitation impossible.",
          ),
        );
      }
      setInvitations((current) =>
        current.map((item) => (item.id === payload.id ? payload : item)),
      );
      setFeedback({ tone: 'success', message: 'Invitation révoquée.' });
    } catch (error) {
      setFeedback({
        tone: 'error',
        message:
          error instanceof Error ? error.message : 'Révocation impossible.',
      });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="grid min-w-0 gap-4">
      {view === 'members' ? (
      <Card
        className="scroll-mt-4 overflow-hidden rounded-[28px] bg-white/95 shadow-sm"
        id="members"
      >
        <CardHeader className="space-y-4 border-b">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <Badge variant="outline">Identités et autorisations</Badge>
              <CardTitle className="mt-2 text-xl">
                Comptes membres
              </CardTitle>
              <p className="mt-1 text-sm text-slate-600">
                Les comptes d’accès à l’organisation ont un rôle et un statut
                propres. Ils ne remplacent pas les profils employés.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge variant="success">{activeCount} actif(s)</Badge>
              <Badge variant="warning">{pendingCount} invitation(s)</Badge>
              <Link className="inline-flex min-h-9 items-center rounded-md bg-primary px-3 text-sm font-medium text-white" href="/organization/invitations">Gérer les invitations</Link>
            </div>
          </div>
          <div className="grid gap-2 sm:grid-cols-[minmax(220px,1fr)_180px_180px]">
            <input aria-label="Rechercher un membre" className="min-h-10 rounded-lg border bg-white px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary" onChange={(event) => setSearch(event.target.value)} placeholder="Rechercher par email" type="search" value={search} />
            <select aria-label="Filtrer par rôle" className="min-h-10 rounded-lg border bg-white px-3 text-sm" onChange={(event) => setMemberRoleFilter(event.target.value as 'all' | MembershipRole)} value={memberRoleFilter}><option value="all">Tous les rôles</option><option value="ADMIN">Administrateur</option><option value="EMPLOYEE">Employé</option></select>
            <select aria-label="Filtrer par statut" className="min-h-10 rounded-lg border bg-white px-3 text-sm" onChange={(event) => setMemberStatusFilter(event.target.value as 'all' | MembershipStatus)} value={memberStatusFilter}><option value="all">Tous les statuts</option><option value="ACTIVE">Actif</option><option value="SUSPENDED">Suspendu</option><option value="REVOKED">Révoqué</option></select>
          </div>
          {feedback ? (
            <p
              aria-live={feedback.tone === 'error' ? 'assertive' : 'polite'}
              className={`rounded-xl p-3 text-sm font-semibold ${feedback.tone === 'success' ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-800'}`}
            >
              {feedback.message}
            </p>
          ) : null}
        </CardHeader>
      <CardContent className="p-0">
          {filteredMembers.length ? (
            <>
            <div className="space-y-3 p-4 xl:hidden" aria-label="Liste des membres">
              {filteredMembers.map((member) => {
                const isCurrent = member.id === currentMembershipId;
                return <article className="space-y-3 rounded-xl border border-slate-200 p-4" key={member.id}>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0"><p className="break-all font-semibold text-slate-900">{member.user.normalizedEmail}</p>{isCurrent ? <p className="text-xs text-slate-500">Vous</p> : null}</div>
                    <Badge variant={member.status === 'ACTIVE' ? 'success' : member.status === 'SUSPENDED' ? 'warning' : 'danger'}>{statusLabels[member.status]}</Badge>
                  </div>
                  <p className="text-xs text-slate-500">Créé le {formatDate(member.createdAt)}</p>
                  <label className="block space-y-1 text-xs font-medium text-slate-600">Rôle
                    <select aria-label={`Rôle de ${member.user.normalizedEmail}`} className="min-h-10 w-full rounded-xl border bg-white px-3 text-sm text-slate-900 disabled:bg-slate-100" disabled={busy === member.id || member.status === 'REVOKED'} onChange={(event) => void updateMember(member, 'role', event.target.value as MembershipRole)} value={member.role}>
                      <option value="ADMIN">Administrateur</option><option value="EMPLOYEE">Employé</option>
                    </select>
                  </label>
                  {member.status === 'ACTIVE' ? <Button className="w-full" disabled={busy === member.id} onClick={() => void updateMember(member, 'status', 'SUSPENDED')} size="sm" variant="secondary">Suspendre</Button> : member.status === 'SUSPENDED' ? <Button className="w-full" disabled={busy === member.id} onClick={() => void updateMember(member, 'status', 'ACTIVE')} size="sm">Réactiver</Button> : null}
                </article>;
              })}
            </div>
            <div className="hidden overflow-x-auto xl:block" role="region" aria-label="Membres, défilement horizontal disponible" tabIndex={0}><table className="w-full min-w-[760px] text-left text-sm">
              <thead className="border-b bg-slate-50 text-xs text-slate-600"><tr><th className="px-4 py-3 font-semibold">Compte</th><th className="px-4 py-3 font-semibold">Rôle</th><th className="px-4 py-3 font-semibold">Statut</th><th className="px-4 py-3 font-semibold">Créé le</th><th className="px-4 py-3 text-right font-semibold">Actions</th></tr></thead>
              <tbody className="divide-y divide-slate-200">{filteredMembers.map((member) => {
              const isOwnerProtected = false;
              const isCurrent = member.id === currentMembershipId;
              return (
                <tr className={member.status === 'ACTIVE' ? 'bg-white' : 'bg-slate-50'} key={member.id}>
                  <td className="px-4 py-3 font-medium text-slate-900">{member.user.normalizedEmail}{isCurrent ? <span className="ml-2 text-xs text-slate-500">Vous</span> : null}</td>
                  <td className="px-4 py-3">
                      <select
                        aria-label={`Rôle de ${member.user.normalizedEmail}`}
                        className="rounded-xl border bg-white px-3 py-2 text-sm disabled:bg-slate-100"
                        disabled={
                          busy === member.id ||
                          isOwnerProtected ||
                          member.status === 'REVOKED'
                        }
                        onChange={(event) =>
                          void updateMember(
                            member,
                            'role',
                            event.target.value as MembershipRole,
                          )
                        }
                        value={member.role}
                      >
                        <option value="ADMIN">Administrateur</option>
                        <option value="EMPLOYEE">Employé</option>
                      </select>
                  </td>
                  <td className="px-4 py-3"><Badge variant={member.status === 'ACTIVE' ? 'success' : member.status === 'SUSPENDED' ? 'warning' : 'danger'}>{statusLabels[member.status]}</Badge></td>
                  <td className="px-4 py-3 text-slate-600">{formatDate(member.createdAt)}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      {member.status === 'ACTIVE' ? (
                        <Button
                          disabled={busy === member.id || isOwnerProtected}
                          onClick={() =>
                            void updateMember(member, 'status', 'SUSPENDED')
                          }
                          size="sm"
                          variant="secondary"
                        >
                          Suspendre
                        </Button>
                      ) : member.status === 'SUSPENDED' ? (
                        <Button
                          disabled={busy === member.id || isOwnerProtected}
                          onClick={() =>
                            void updateMember(member, 'status', 'ACTIVE')
                          }
                          size="sm"
                        >
                          Réactiver
                        </Button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              );
            })}</tbody>
            </table></div>
            </>
          ) : (
            <AdminEmptyState
              badge="Membres"
              description="Aucun compte ne correspond à cette recherche."
              title="Aucun membre trouvé"
            />
          )}
        </CardContent>
      </Card>
      ) : null}

      {view === 'invitations' ? (
      <div className="scroll-mt-4 space-y-4" id="invitations">
        <Card className="rounded-xl border-slate-200 bg-white shadow-none">
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
            <div><CardTitle className="text-base">Invitations de l’organisation</CardTitle><p className="mt-1 text-sm text-slate-600">Les invitations activent un compte à leur acceptation, sans créer de profil employé.</p><p className="mt-2 text-xs font-medium text-slate-600"><span className="font-semibold text-slate-900">{pendingCount}</span> en attente · {invitations.length} au total</p></div>
            <Button onClick={() => { setAcceptanceUrl(''); setCopyMessage(''); setFeedback(null); setInviteOpen(true); }} type="button">Nouvelle invitation</Button>
          </CardHeader>
        </Card>
        <Dialog onOpenChange={(open) => { setInviteOpen(open); if (!open) { setAcceptanceUrl(''); setCopyMessage(''); } }} open={inviteOpen}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader><DialogTitle>Nouvelle invitation</DialogTitle><DialogDescription>Le lien d’acceptation sera affiché après création pour transmission manuelle.</DialogDescription></DialogHeader>
            <p aria-live="polite" className={`rounded-lg p-3 text-sm ${administratorLimit === null ? 'bg-slate-50 text-slate-600' : administratorLimit > 0 && reservedAdministratorCount >= administratorLimit ? 'bg-amber-50 text-amber-900' : 'bg-blue-50 text-blue-900'}`}>
              {administratorLimit === null ? 'Quota administrateur indisponible. Le serveur vérifie toujours la limite avant toute invitation.' : `Administrateurs : ${reservedAdministratorCount} / ${administratorLimit} places utilisées. Ce total inclut les comptes actifs et les invitations ADMIN en attente.`}
            </p>
            <form className="space-y-3" onSubmit={createInvitation}>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-500">
                Email
                <input
                  className="mt-1.5 w-full rounded-2xl border px-4 py-3 text-sm font-normal normal-case tracking-normal"
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="prenom@entreprise.com"
                  required
                  type="email"
                  value={email}
                />
              </label>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-500">
                Rôle à attribuer
                <select
                  className="mt-1.5 w-full rounded-2xl border bg-white px-4 py-3 text-sm font-normal normal-case tracking-normal"
                  onChange={(event) =>
                    setInviteRole(event.target.value as MembershipRole)
                  }
                  value={inviteRole}
                >
                  <option value="EMPLOYEE">Employé</option>
                  <option value="ADMIN">Administrateur</option>
                </select>
              </label>
              <Button
                className="w-full"
                disabled={busy === 'invite'}
                type="submit"
              >
                {busy === 'invite' ? 'Création…' : 'Créer l’invitation'}
              </Button>
              {acceptanceUrl ? (
                <div className="space-y-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-950">
                  <p className="font-semibold">Lien secret à transmettre uniquement à la personne invitée</p>
                  <input aria-label="Lien d’acceptation secret" className="min-h-10 w-full select-all rounded-lg border border-amber-300 bg-white px-2 font-mono text-[11px]" onFocus={(event) => event.currentTarget.select()} readOnly value={acceptanceUrl} />
                  <Button className="min-h-10 w-full" onClick={() => void copyInvitationLink()} type="button" variant="secondary">Copier le lien secret</Button>
                  {copyMessage ? <p aria-live="polite">{copyMessage}</p> : null}
                </div>
              ) : null}
              <p className="text-xs leading-5 text-slate-500">
                Le lien est affiché après création pour pouvoir être transmis au
                destinataire.
              </p>
            </form>
          </DialogContent>
        </Dialog>

        <Card className="overflow-hidden rounded-xl border-slate-200 bg-white shadow-none">
          <CardHeader>
            <CardTitle className="text-xl">Suivi des invitations</CardTitle>
          </CardHeader>
          <CardHeader className="grid gap-2 border-b sm:grid-cols-[minmax(220px,1fr)_180px]"><input aria-label="Rechercher une invitation" className="min-h-10 rounded-lg border bg-white px-3 text-sm" onChange={(event) => setInvitationSearch(event.target.value)} placeholder="Rechercher par email" type="search" value={invitationSearch} /><select aria-label="Filtrer les invitations par statut" className="min-h-10 rounded-lg border bg-white px-3 text-sm" onChange={(event) => setInvitationStatus(event.target.value)} value={invitationStatus}><option value="all">Tous les statuts</option><option value="En attente">En attente</option><option value="Acceptée">Acceptée</option><option value="Expirée">Expirée</option><option value="Révoquée">Révoquée</option></select></CardHeader>
          <CardContent className="p-0">
            {filteredInvitations.length ? (
              <>
              <div className="space-y-3 p-4 xl:hidden" aria-label="Liste des invitations">
                {filteredInvitations.map((invitation) => {
                  const state = getInvitationStatus(invitation);
                  return <article className="space-y-3 rounded-xl border border-slate-200 p-4" key={invitation.id}>
                    <div className="flex flex-wrap items-start justify-between gap-2"><p className="min-w-0 break-all font-semibold text-slate-900">{invitation.email}</p><Badge variant={state.tone}>{state.label}</Badge></div>
                    <p className="text-sm text-slate-600">{roleLabels[invitation.role]}</p>
                    <dl className="grid grid-cols-2 gap-2 text-xs"><div><dt className="text-slate-500">Créée</dt><dd>{formatDate(invitation.createdAt)}</dd></div><div><dt className="text-slate-500">Expire</dt><dd>{formatDate(invitation.expiresAt)}</dd></div></dl>
                    {state.label === 'En attente' ? <Button className="w-full border-red-200 text-red-700" disabled={busy === invitation.id} onClick={() => void revokeInvitation(invitation)} size="sm" variant="secondary">Révoquer</Button> : null}
                  </article>;
                })}
              </div>
              <div className="hidden overflow-x-auto xl:block" role="region" aria-label="Invitations, défilement horizontal disponible" tabIndex={0}><table className="w-full min-w-[700px] text-left text-sm">
                <thead className="border-b bg-slate-50 text-xs text-slate-600"><tr><th className="px-4 py-3 font-semibold">Compte invité</th><th className="px-4 py-3 font-semibold">Rôle</th><th className="px-4 py-3 font-semibold">Créée</th><th className="px-4 py-3 font-semibold">Expire</th><th className="px-4 py-3 font-semibold">Statut</th><th className="px-4 py-3 text-right font-semibold">Actions</th></tr></thead><tbody className="divide-y divide-slate-200">{filteredInvitations.map((invitation) => {
                const state = getInvitationStatus(invitation);
                return (
                  <tr key={invitation.id}>
                    <td className="px-4 py-3 font-medium text-slate-900">{invitation.email}</td>
                    <td className="px-4 py-3">{roleLabels[invitation.role]}</td>
                    <td className="px-4 py-3 text-slate-600">{formatDate(invitation.createdAt)}</td>
                    <td className="px-4 py-3 text-slate-600">{formatDate(invitation.expiresAt)}</td>
                    <td className="px-4 py-3"><Badge variant={state.tone}>{state.label}</Badge></td>
                    <td className="px-4 py-3 text-right">
                    {state.label === 'En attente' ? (
                      <Button
                        className="border-red-200 text-red-700"
                        disabled={busy === invitation.id}
                        onClick={() => void revokeInvitation(invitation)}
                        size="sm"
                        variant="secondary"
                      >
                        Révoquer
                      </Button>
                    ) : null}
                    </td>
                  </tr>
                );
              })}</tbody></table></div>
              </>
            ) : (
              <p className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">
                Aucune invitation envoyée.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
      ) : null}
    </div>
  );
}
