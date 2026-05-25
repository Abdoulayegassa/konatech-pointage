'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import {
  type AttendanceRecord,
  type AttendanceSecurityPolicy,
} from '@/lib/api';
import { cn } from '@/lib/utils';
import { AttendanceEntrySessionButton } from './attendance-entry-session-button';
import { getAttendanceExitMessage } from './attendance-display';
import {
  getDistanceMeters,
  getCurrentLocation,
  type AttendanceSecurityPayload,
} from './attendance-browser-security';
import {
  getAttendanceFlowMeta,
  getFriendlyAttendanceError,
  type AttendanceAction,
  type AttendanceFlowState,
  type FlowTone,
} from './attendance-action-flow';

type EmployeeAttendanceActionsProps = {
  canCheckIn: boolean;
  canCheckOut: boolean;
  securityPolicy?: AttendanceSecurityPolicy | null;
  sessionMode?: 'account' | 'attendance-entry';
};

type FeedbackState = {
  tone: 'success' | 'error';
  message: string;
} | null;

const NON_SECURE_ATTENDANCE_POLICY: AttendanceSecurityPolicy = {
  enabled: false,
  locationConfigured: false,
  trustedRadiusMeters: null,
  warningRadiusMeters: null,
  allowedRadiusMeters: null,
  companyLatitude: null,
  companyLongitude: null,
};

const flowToneStyles: Record<
  FlowTone,
  {
    container: string;
    dot: string;
    label: string;
    title: string;
  }
> = {
  neutral: {
    container:
      'border-slate-200/80 bg-[linear-gradient(180deg,rgba(248,250,252,0.95),rgba(255,255,255,0.98))] text-slate-700',
    dot: 'bg-slate-400',
    label: 'border-slate-200 bg-white text-slate-600',
    title: 'text-slate-950',
  },
  primary: {
    container:
      'border-primary/15 bg-[linear-gradient(180deg,rgba(16,50,60,0.08),rgba(255,255,255,0.98))] text-primary',
    dot: 'bg-primary',
    label: 'border-primary/15 bg-white text-primary',
    title: 'text-slate-950',
  },
  success: {
    container:
      'border-success/15 bg-[linear-gradient(180deg,rgba(25,135,84,0.08),rgba(255,255,255,0.98))] text-success',
    dot: 'bg-success',
    label: 'border-success/15 bg-white text-success',
    title: 'text-slate-950',
  },
  warning: {
    container:
      'border-accent/15 bg-[linear-gradient(180deg,rgba(244,110,40,0.08),rgba(255,255,255,0.98))] text-accent',
    dot: 'bg-accent',
    label: 'border-accent/15 bg-white text-accent',
    title: 'text-slate-950',
  },
  danger: {
    container:
      'border-red-200 bg-[linear-gradient(180deg,rgba(254,242,242,0.96),rgba(255,255,255,0.98))] text-red-700',
    dot: 'bg-red-600',
    label: 'border-red-200 bg-white text-red-700',
    title: 'text-slate-950',
  },
};

export function EmployeeAttendanceActions({
  canCheckIn,
  canCheckOut,
  securityPolicy,
  sessionMode = 'account',
}: EmployeeAttendanceActionsProps) {
  const router = useRouter();
  const resolvedSecurityPolicy = securityPolicy ?? NON_SECURE_ATTENDANCE_POLICY;
  const [activeAction, setActiveAction] = useState<AttendanceAction | null>(
    null,
  );
  const [flowState, setFlowState] = useState<AttendanceFlowState>('idle');
  const [feedback, setFeedback] = useState<FeedbackState>(null);
  const [lastAction, setLastAction] = useState<AttendanceAction | null>(null);

  async function buildAttendancePayload() {
    if (!resolvedSecurityPolicy.enabled) {
      return {};
    }

    setFlowState('checking-location');

    try {
      const location = await getCurrentLocation();
      const allowedRadiusMeters = resolvedSecurityPolicy.allowedRadiusMeters;
      const maxAccuracyMeters = resolvedSecurityPolicy.maxAccuracyMeters;
      const companyLatitude = resolvedSecurityPolicy.companyLatitude;
      const companyLongitude = resolvedSecurityPolicy.companyLongitude;

      if (
        typeof maxAccuracyMeters === 'number' &&
        location.accuracyMeters > maxAccuracyMeters
      ) {
        setFlowState('blocked');
        setFeedback({
          tone: 'error',
          message:
            'La precision GPS est insuffisante pour pointer. Rapprochez-vous et reessayez.',
        });
        return null;
      }

      if (
        typeof companyLatitude === 'number' &&
        typeof companyLongitude === 'number' &&
        typeof allowedRadiusMeters === 'number'
      ) {
        const distanceMeters = getDistanceMeters(location, {
          latitude: companyLatitude,
          longitude: companyLongitude,
        });

        if (distanceMeters > allowedRadiusMeters) {
          setFlowState('blocked');
          setFeedback({
            tone: 'error',
            message: 'Vous devez etre dans la zone autorisee pour pointer.',
          });
          return null;
        }
      }

      const nextSecurity: AttendanceSecurityPayload = {
        latitude: location.latitude,
        longitude: location.longitude,
        accuracyMeters: location.accuracyMeters,
      };

      return {
        security: nextSecurity,
      };
    } catch {
      setFlowState('blocked');
      setFeedback({
        tone: 'error',
        message: 'La geolocalisation est obligatoire pour pointer.',
      });

      return null;
    }
  }

  async function submit(action: AttendanceAction, path: string) {
    setActiveAction(action);
    setLastAction(action);
    setFeedback(null);

    try {
      const body = await buildAttendancePayload();

      if (!body) {
        return;
      }

      setFlowState('saving');

      const response = await fetch(path, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
      } & Partial<AttendanceRecord>;

      if (!response.ok) {
        const friendlyMessage = getFriendlyAttendanceError(data.error);
        const isBlockingSecurityError =
          friendlyMessage ===
            'Vous devez etre dans la zone autorisee pour pointer.' ||
          friendlyMessage ===
            'La geolocalisation est obligatoire pour pointer.';

        setFlowState(isBlockingSecurityError ? 'blocked' : 'error');
        setFeedback({
          tone: 'error',
          message: friendlyMessage,
        });
        return;
      }

      setFlowState('success');
      const exitMessage =
        action === 'check-out'
          ? getAttendanceExitMessage(data as AttendanceRecord)
          : null;

      setFeedback({
        tone: 'success',
        message:
          exitMessage ??
          (action === 'check-in'
            ? 'Entree enregistree avec succes.'
            : 'Sortie enregistree avec succes.'),
      });
      router.refresh();
    } catch {
      setFlowState('error');
      setFeedback({
        tone: 'error',
        message: 'Connexion indisponible. Reessayez dans quelques instants.',
      });
    } finally {
      setActiveAction(null);
    }
  }

  const isBusy = activeAction !== null;
  const verificationAction = activeAction ?? lastAction;
  const flowMeta = getAttendanceFlowMeta(flowState, verificationAction);
  const flowStyles = flowToneStyles[flowMeta.tone];
  const primaryAction =
    canCheckIn && !canCheckOut
      ? 'check-in'
      : canCheckOut && !canCheckIn
        ? 'check-out'
        : null;
  const showCompletionActions =
    sessionMode === 'attendance-entry' && feedback?.tone === 'success';

  function handleFinish() {
    setFeedback(null);
    setFlowState('idle');
    setLastAction(null);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      {flowState !== 'idle' || feedback ? (
        <div
          aria-live="polite"
          className={cn(
            'rounded-[24px] border px-4 py-4 shadow-sm sm:px-5',
            flowStyles.container,
          )}
        >
          <div className="flex gap-3">
            <span
              className={cn(
                'mt-1 h-2.5 w-2.5 shrink-0 rounded-full',
                flowStyles.dot,
                flowState === 'checking-location' ? 'animate-pulse' : '',
              )}
            />
            <div className="min-w-0 flex-1 space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={cn(
                    'inline-flex rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em]',
                    flowStyles.label,
                  )}
                >
                  {flowMeta.label}
                </span>
                <p className={cn('text-sm font-semibold', flowStyles.title)}>
                  {flowMeta.title}
                </p>
              </div>
              <p className="text-sm leading-5 text-slate-600">
                {flowMeta.description}
              </p>
            </div>
          </div>
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <Button
          className={cn(
            'group min-h-[108px] w-full flex-col items-center justify-center gap-3 rounded-[28px] px-5 py-5 text-center text-base shadow-[0_18px_36px_rgba(16,50,60,0.12)] sm:min-h-[112px]',
            primaryAction === 'check-in'
              ? 'bg-[linear-gradient(135deg,rgba(25,135,84,0.98),rgba(34,197,94,0.88))] text-white hover:bg-[linear-gradient(135deg,rgba(25,135,84,0.98),rgba(34,197,94,0.88))]'
              : 'border-slate-200 bg-slate-100 text-slate-400 shadow-none hover:bg-slate-100',
          )}
          disabled={!canCheckIn || isBusy}
          onClick={() => submit('check-in', '/api/attendance/me/check-in')}
          size="lg"
          type="button"
          variant={primaryAction === 'check-in' ? 'default' : 'secondary'}
        >
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/18 text-2xl">
            ↑
          </span>
          <span className="text-lg font-extrabold">
            {activeAction === 'check-in' ? 'Vérification...' : 'Entrée'}
          </span>
        </Button>
        <Button
          className={cn(
            'group min-h-[108px] w-full flex-col items-center justify-center gap-3 rounded-[28px] px-5 py-5 text-center text-base shadow-[0_18px_36px_rgba(15,45,58,0.12)] sm:min-h-[112px]',
            primaryAction === 'check-out'
              ? 'bg-[linear-gradient(135deg,rgba(244,110,40,0.98),rgba(255,141,74,0.92))] text-white hover:bg-[linear-gradient(135deg,rgba(244,110,40,0.98),rgba(255,141,74,0.92))]'
              : 'border-slate-200 bg-slate-100 text-slate-400 shadow-none hover:bg-slate-100',
          )}
          disabled={!canCheckOut || isBusy}
          onClick={() => submit('check-out', '/api/attendance/me/check-out')}
          size="lg"
          type="button"
          variant={primaryAction === 'check-out' ? 'default' : 'secondary'}
        >
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/18 text-2xl">
            ↓
          </span>
          <span className="text-lg font-extrabold">
            {activeAction === 'check-out' ? 'Vérification...' : 'Sortie'}
          </span>
        </Button>
      </div>

      {feedback ? (
        <div
          aria-live="polite"
          className={
            feedback.tone === 'success'
              ? 'rounded-[22px] border border-success/15 bg-[linear-gradient(180deg,rgba(240,253,244,0.9),rgba(255,255,255,0.98))] px-4 py-3 text-sm font-medium text-success'
              : 'rounded-[22px] border border-accent/15 bg-[linear-gradient(180deg,rgba(255,248,244,0.92),rgba(255,255,255,0.98))] px-4 py-3 text-sm font-medium text-accent'
          }
        >
          {feedback.message}
        </div>
      ) : null}

      {showCompletionActions ? (
        <div className="rounded-[22px] border border-primary/15 bg-[linear-gradient(180deg,rgba(16,50,60,0.06),rgba(255,255,255,0.98))] p-4">
          <div className="space-y-3">
            <div className="space-y-1">
              <p className="text-sm font-semibold text-slate-950">
                Pointage terminé.
              </p>
              <p className="text-sm leading-5 text-slate-600">
                Terminer ou changer d'employé.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <Button onClick={handleFinish} type="button" variant="secondary">
                Terminer
              </Button>
              <AttendanceEntrySessionButton
                label="Se déconnecter"
                variant="default"
              />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
