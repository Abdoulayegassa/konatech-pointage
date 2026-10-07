'use client';

import Image from 'next/image';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import {
  type AttendanceRecord,
  type AttendanceSecurityPolicy,
  type AttendanceSite,
} from '@/lib/api';
import { cn } from '@/lib/utils';
import { AttendanceLiveClock } from './attendance-live-clock';
import {
  getCurrentLocation,
  getDistanceMeters,
  type AttendanceSecurityPayload,
} from './attendance-browser-security';
import { AttendanceEntrySessionButton } from './attendance-entry-session-button';
import { AttendanceSelfieCapture } from './attendance-selfie-capture';
import { OfflineAttendanceStatus } from './offline-attendance-status';
import {
  enqueueOfflineAttendanceWithEvidence,
  readOfflineAttendanceQueue,
  synchronizeOfflineAttendanceQueue,
  OFFLINE_ATTENDANCE_QUEUE_EVENT,
  readOfflineAttendanceContext,
  readActiveOfflineAttendanceBootstrap,
  deriveOfflineAttendanceActions,
  getOfflineAttendanceContextBinding,
  isOfflineContextValidForCapture,
  offlineContextMatchesOwner,
  storeOfflineAttendanceBootstrap,
  storeOfflineAttendanceContext,
} from '@/lib/offline-attendance-queue';

type AttendanceAction = 'check-in' | 'check-out';
type TerminalStep =
  | 'action'
  | 'selfie'
  | 'comment'
  | 'validation'
  | 'submitting'
  | 'success'
  | 'error';

type LocationStatus = 'pending' | 'recorded' | 'denied' | 'timeout' | 'unavailable';

type EmployeeAttendanceActionsProps = {
  attendanceEntryRedirectTo?: string;
  canCheckIn: boolean;
  canCheckOut: boolean;
  employeeName?: string;
  securityPolicy?: AttendanceSecurityPolicy | null;
  sessionMode?: 'account' | 'attendance-entry';
  attendanceSites?: AttendanceSite[];
  offlineSessionBinding?: string | null;
  offlineQueueOwner?: { organizationId?: string; employeeId: string };
  offlineBootstrapSeed?: OfflineBootstrapSeed;
  requiresSiteSelection?: boolean;
  timeZone?: string;
};

type FeedbackState = {
  tone: 'success' | 'error';
  message: string;
} | null;

type OfflineBootstrapSeed = {
  employeeId: string;
  organizationId?: string;
  employeeName: string;
  sessionBinding: string;
  canCheckIn: boolean;
  canCheckOut: boolean;
  timeZone?: string;
  snapshotAt: string;
};

function persistOfflineContextToken(
  token: string,
  seed: OfflineBootstrapSeed | undefined,
  siteId: string | null,
  policy: AttendanceSecurityPolicy | null | undefined,
) {
  const binding = getOfflineAttendanceContextBinding(token);
  if (
    !binding ||
    !seed ||
    binding.employeeId !== seed.employeeId ||
    (seed.organizationId && binding.organizationId !== seed.organizationId) ||
    (siteId && binding.siteId !== siteId) ||
    (policy?.siteId && binding.siteId !== policy.siteId)
  ) return false;
  const snapshotPolicy = binding.attendancePolicy as Record<string, unknown> | undefined;
  const snapshotSite = binding.site as Record<string, unknown> | undefined;
  const enabled = typeof snapshotPolicy?.enabled === 'boolean' ? snapshotPolicy.enabled : policy?.enabled ?? false;
  const latitude = typeof snapshotSite?.latitude === 'number' ? snapshotSite.latitude : policy?.companyLatitude ?? null;
  const longitude = typeof snapshotSite?.longitude === 'number' ? snapshotSite.longitude : policy?.companyLongitude ?? null;
  const radius = typeof snapshotSite?.allowedRadiusMeters === 'number'
    ? snapshotSite.allowedRadiusMeters
    : typeof snapshotPolicy?.allowedRadiusMeters === 'number'
      ? snapshotPolicy.allowedRadiusMeters
      : policy?.allowedRadiusMeters ?? null;
  storeOfflineAttendanceContext(window.localStorage, token);
  storeOfflineAttendanceBootstrap(window.localStorage, {
    ...seed,
    version: 1,
    organizationId: binding.organizationId,
    timeZone: binding.timeZone ?? seed.timeZone,
    siteId: binding.siteId,
    siteName: policy?.siteName ?? binding.siteId,
    securityPolicy: {
      enabled,
      selfieRequired: typeof snapshotPolicy?.selfieRequired === 'boolean' ? snapshotPolicy.selfieRequired : policy?.selfieRequired ?? false,
      gpsRequired: typeof snapshotPolicy?.gpsRequired === 'boolean' ? snapshotPolicy.gpsRequired : policy?.gpsRequired ?? false,
      locationConfigured: typeof snapshotPolicy?.locationConfigured === 'boolean' ? snapshotPolicy.locationConfigured : policy?.locationConfigured ?? false,
      trustedRadiusMeters: typeof snapshotPolicy?.trustedRadiusMeters === 'number' ? snapshotPolicy.trustedRadiusMeters : null,
      warningRadiusMeters: typeof snapshotPolicy?.warningRadiusMeters === 'number' ? snapshotPolicy.warningRadiusMeters : null,
      allowedRadiusMeters: radius,
      maxAccuracyMeters: typeof snapshotPolicy?.maxAccuracyMeters === 'number' ? snapshotPolicy.maxAccuracyMeters : null,
      companyLatitude: latitude,
      companyLongitude: longitude,
      siteId: binding.siteId,
      siteName: policy?.siteName ?? binding.siteId,
    },
    contextToken: token,
    contextIssuedAt: binding.issuedAt,
    contextValidUntil: binding.validUntil,
  });
  return true;
}

const WIZARD_STEPS = [
  'Action',
  'Selfie',
  'Commentaire',
  'Vérification',
  'Succès',
];
const COMMENT_MAX_LENGTH = 120;
const COMMENT_SUGGESTIONS = [
  'Retard',
  'Mission externe',
  'Rendez-vous client',
  'Autre',
];

function getActionLabel(action: AttendanceAction | null) {
  return action === 'check-out' ? 'Sortie' : 'Entrée';
}

function getStepIndex(step: TerminalStep) {
  switch (step) {
    case 'selfie':
      return 2;
    case 'comment':
      return 3;
    case 'validation':
    case 'submitting':
      return 4;
    case 'success':
      return 5;
    default:
      return 1;
  }
}

function getActionPath(action: AttendanceAction) {
  return action === 'check-out'
    ? '/api/attendance/me/check-out'
    : '/api/attendance/me/check-in';
}

function formatActionTime(
  value: Date | string | null | undefined,
  timeZone?: string,
) {
  if (!value) {
    return '--:--';
  }

  const date = typeof value === 'string' ? new Date(value) : value;

  if (Number.isNaN(date.getTime())) {
    return '--:--';
  }

  return date.toLocaleTimeString('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone,
  });
}

function formatActionDate(
  value: Date | string | null | undefined,
  timeZone?: string,
) {
  if (!value) {
    return '--/--/----';
  }

  const date = typeof value === 'string' ? new Date(value) : value;

  if (Number.isNaN(date.getTime())) {
    return '--/--/----';
  }

  return date.toLocaleDateString('fr-FR', { timeZone });
}

function formatMinutesAsHours(totalMinutes: number) {
  const minutes = Math.max(0, Math.round(totalMinutes));
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  if (hours <= 0) {
    return `${remainingMinutes} min`;
  }

  if (remainingMinutes === 0) {
    return `${hours}h`;
  }

  return `${hours}h${String(remainingMinutes).padStart(2, '0')}`;
}

function getSuccessSummary(
  action: AttendanceAction | null,
  attendance: Partial<AttendanceRecord> | null,
  timeZone?: string,
) {
  if (action === 'check-out') {
    const time = formatActionTime(attendance?.clockOutAt, timeZone);
    const earlyExitMinutes = Math.max(0, attendance?.earlyExitMinutes ?? 0);
    const overtimeMinutes = Math.max(0, attendance?.overtimeMinutes ?? 0);

    if (overtimeMinutes > 0) {
      return {
        line: `Sortie : ${time}`,
        detail: `Heures supplémentaires : ${formatMinutesAsHours(
          overtimeMinutes,
        )}`,
      };
    }

    if (earlyExitMinutes > 0) {
      return {
        line: `Sortie : ${time}`,
        detail: `Départ anticipé : ${earlyExitMinutes} min`,
      };
    }

    return {
      line: `Sortie : ${time}`,
      detail: "Sortie à l'heure",
    };
  }

  const time = formatActionTime(attendance?.clockInAt, timeZone);
  const minutesLate = Math.max(0, attendance?.minutesLate ?? 0);

  if (minutesLate > 0) {
    return {
      line: `Entrée : ${time}`,
      detail: `Retard : ${minutesLate} min`,
    };
  }

  return {
    line: `Entrée : ${time}`,
    detail: "À l'heure",
  };
}

function formatSuccessDuration(value: string) {
  const minuteMatch = value.match(/^(\d+) min$/);

  if (minuteMatch) {
    const totalMinutes = Number(minuteMatch[1]);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;

    if (hours === 0) {
      return `${minutes} min`;
    }

    if (minutes === 0) {
      return `${hours} h`;
    }

    return `${hours} h ${minutes} min`;
  }

  const hourMatch = value.match(/^(\d+)h(?:(\d{2}))?$/);

  if (hourMatch) {
    const hours = Number(hourMatch[1]);
    const minutes = Number(hourMatch[2] ?? 0);

    if (minutes === 0) {
      return `${hours} h`;
    }

    return `${hours} h ${minutes} min`;
  }

  return value;
}

function getSuccessStatusDisplay(detail: string) {
  const statusParts = detail.includes(':') ? detail.split(':') : null;
  const label = statusParts?.[0].trim() ?? 'Statut';
  const rawValue = statusParts?.slice(1).join(':').trim() ?? detail;
  const isWarning = label === 'Retard' || label === 'Départ anticipé';

  return {
    label,
    value: formatSuccessDuration(rawValue),
    className: isWarning ? 'text-accent' : 'text-success',
  };
}

function hasLocation(
  payload: AttendanceSecurityPayload | null,
): payload is AttendanceSecurityPayload & {
  latitude: number;
  longitude: number;
} {
  return (
    typeof payload?.latitude === 'number' &&
    typeof payload.longitude === 'number'
  );
}

function getPositionStatusLabel(input: {
  comment: string;
  locationStatus: LocationStatus;
  securityPayload: AttendanceSecurityPayload | null;
  securityPolicy?: AttendanceSecurityPolicy | null;
}) {
  const { comment, locationStatus, securityPayload, securityPolicy } = input;

  if (locationStatus === 'denied') return 'Autorisation GPS refusée';
  if (locationStatus === 'timeout') return 'Délai GPS dépassé';
  if (locationStatus === 'unavailable') {
    return 'GPS indisponible';
  }

  if (locationStatus !== 'recorded' || !hasLocation(securityPayload)) {
    return 'Position non vérifiée';
  }

  if (
    !securityPolicy?.enabled ||
    securityPolicy.companyLatitude === null ||
    securityPolicy.companyLongitude === null ||
    securityPolicy.allowedRadiusMeters === null
  ) {
    return 'Position enregistrée';
  }

  const distanceMeters = getDistanceMeters(
    {
      latitude: securityPayload.latitude,
      longitude: securityPayload.longitude,
    },
    {
      latitude: securityPolicy.companyLatitude,
      longitude: securityPolicy.companyLongitude,
    },
  );

  if (distanceMeters <= securityPolicy.allowedRadiusMeters) {
    return 'Dans la zone autorisée';
  }

  return comment.trim()
    ? 'Pointage hors bureau justifié'
    : 'Hors bureau - commentaire requis';
}

function StepIndicator({ currentStep }: { currentStep: number }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <p className="text-[10px] font-black uppercase tracking-[0.14em] text-primary sm:text-xs sm:tracking-[0.16em]">
        Étape {currentStep}/5
      </p>
      <div
        aria-label={`Étape ${currentStep} sur ${WIZARD_STEPS.length}`}
        className="flex items-center gap-1.5"
      >
        {WIZARD_STEPS.map((stepLabel, index) => {
          const stepNumber = index + 1;

          return (
            <span
              key={stepLabel}
              className={cn(
                'h-2 rounded-full transition-all duration-200',
                stepNumber === currentStep
                  ? 'w-7 bg-accent'
                  : stepNumber < currentStep
                    ? 'w-2 bg-primary'
                    : 'w-2 bg-slate-200',
              )}
            />
          );
        })}
      </div>
    </div>
  );
}

function SummaryRow({
  label,
  value,
  valueClassName,
  preserveLines = false,
}: {
  label: string;
  value: string;
  valueClassName?: string;
  preserveLines?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-slate-100 py-2.5 last:border-b-0">
      <p className="shrink-0 text-sm font-bold text-slate-500">{label}</p>
      <p
        className={cn(
          'min-w-0 break-words text-right text-sm font-black leading-5 text-slate-950',
          preserveLines ? 'whitespace-pre-wrap' : '',
          valueClassName,
        )}
      >
        {value}
      </p>
    </div>
  );
}

export function EmployeeAttendanceActions({
  attendanceEntryRedirectTo,
  attendanceSites = [],
  offlineSessionBinding,
  offlineQueueOwner,
  offlineBootstrapSeed,
  canCheckIn,
  canCheckOut,
  employeeName = 'Employé',
  securityPolicy: baseSecurityPolicy,
  sessionMode = 'account',
  requiresSiteSelection = false,
  timeZone,
}: EmployeeAttendanceActionsProps) {
  const router = useRouter();
  const [selectedSiteId, setSelectedSiteId] = useState(
    baseSecurityPolicy?.siteId ?? '',
  );
  const [step, setStep] = useState<TerminalStep>('action');
  const [pendingAction, setPendingAction] = useState<AttendanceAction | null>(
    null,
  );
  const [selfieDataUrl, setSelfieDataUrl] = useState<string | null>(null);
  const [comment, setComment] = useState('');
  const [capturedAt, setCapturedAt] = useState<Date | null>(null);
  const [locallyQueued, setLocallyQueued] = useState(false);
  const [offlineContextToken, setOfflineContextToken] = useState<string | null>(null);
  const [deviceOnline, setDeviceOnline] = useState(true);
  const [offlineActionState, setOfflineActionState] = useState({
    canCheckIn,
    canCheckOut,
    blocked: false,
    contextValid: false,
  });
  const [locationStatus, setLocationStatus] =
    useState<LocationStatus>('pending');
  const [securityPayload, setSecurityPayload] =
    useState<AttendanceSecurityPayload | null>(null);
  const [feedback, setFeedback] = useState<FeedbackState>(null);
  const [successAttendance, setSuccessAttendance] =
    useState<Partial<AttendanceRecord> | null>(null);
  const selectedSite = attendanceSites.find(
    (site) => site.id === selectedSiteId,
  );
  const securityPolicy =
    selectedSite && baseSecurityPolicy
      ? {
          ...baseSecurityPolicy,
          allowedRadiusMeters: selectedSite.allowedRadiusMeters,
          companyLatitude: selectedSite.latitude,
          companyLongitude: selectedSite.longitude,
          locationConfigured: true,
          siteId: selectedSite.id,
          siteName: selectedSite.name,
        }
      : baseSecurityPolicy;
  const attendanceSiteId = (securityPolicy?.siteId ?? selectedSiteId) || null;

  useEffect(() => {
    const refresh = () => {
      const online = navigator.onLine;
      setDeviceOnline(online);
      if (online) {
        setOfflineActionState({ canCheckIn, canCheckOut, blocked: false, contextValid: true });
        return;
      }
      const bootstrap = readActiveOfflineAttendanceBootstrap(window.localStorage);
      if (
        !bootstrap ||
        !offlineQueueOwner ||
        bootstrap.employeeId !== offlineQueueOwner.employeeId ||
        (offlineQueueOwner.organizationId && bootstrap.organizationId !== offlineQueueOwner.organizationId) ||
        bootstrap.siteId !== attendanceSiteId
      ) {
        setOfflineActionState({ canCheckIn: false, canCheckOut: false, blocked: true, contextValid: false });
        return;
      }
      const actionState = deriveOfflineAttendanceActions(
        bootstrap,
        readOfflineAttendanceQueue(window.localStorage),
      );
      setOfflineActionState({
        ...actionState,
        contextValid: isOfflineContextValidForCapture(bootstrap, new Date()),
      });
    };
    refresh();
    window.addEventListener('online', refresh);
    window.addEventListener('offline', refresh);
    window.addEventListener('storage', refresh);
    window.addEventListener(OFFLINE_ATTENDANCE_QUEUE_EVENT, refresh);
    const contextExpiryTimer = window.setInterval(refresh, 30_000);
    return () => {
      window.clearInterval(contextExpiryTimer);
      window.removeEventListener('online', refresh);
      window.removeEventListener('offline', refresh);
      window.removeEventListener('storage', refresh);
      window.removeEventListener(OFFLINE_ATTENDANCE_QUEUE_EVENT, refresh);
    };
  }, [
    canCheckIn,
    canCheckOut,
    offlineQueueOwner?.employeeId,
    offlineQueueOwner?.organizationId,
    attendanceSiteId,
  ]);

  useEffect(() => {
    const cachedContext = readOfflineAttendanceContext(window.localStorage);
    if (cachedContext && offlineQueueOwner && offlineContextMatchesOwner(cachedContext, offlineQueueOwner)) {
      const binding = getOfflineAttendanceContextBinding(cachedContext);
      if (binding?.siteId === attendanceSiteId) setOfflineContextToken(cachedContext);
    }
    if (!navigator.onLine || !offlineSessionBinding) return;
    const contextPath = attendanceSiteId
      ? `/api/attendance/me/offline-context?siteId=${encodeURIComponent(attendanceSiteId)}&authMode=${sessionMode}`
      : `/api/attendance/me/offline-context?authMode=${sessionMode}`;
    void fetch(contextPath, { method: 'GET' })
      .then(async (response) => {
        if (!response.ok) return;
        const payload = (await response.json()) as { contextToken?: string };
        if (payload.contextToken) {
          if (persistOfflineContextToken(payload.contextToken, offlineBootstrapSeed, attendanceSiteId, securityPolicy)) {
            setOfflineContextToken(payload.contextToken);
          }
        }
      })
      .catch(() => undefined);
  }, [
    sessionMode,
    attendanceSiteId,
    offlineSessionBinding,
    offlineQueueOwner?.employeeId,
    offlineQueueOwner?.organizationId,
    offlineBootstrapSeed?.employeeId,
    offlineBootstrapSeed?.organizationId,
    offlineBootstrapSeed?.canCheckIn,
    offlineBootstrapSeed?.canCheckOut,
    offlineBootstrapSeed?.snapshotAt,
    securityPolicy?.enabled,
    securityPolicy?.selfieRequired,
    securityPolicy?.gpsRequired,
    securityPolicy?.locationConfigured,
    securityPolicy?.allowedRadiusMeters,
    securityPolicy?.companyLatitude,
    securityPolicy?.companyLongitude,
    securityPolicy?.siteName,
  ]);

  const isBusy = step === 'submitting';
  const actionLabel = getActionLabel(pendingAction);
  const successSummary = getSuccessSummary(
    pendingAction,
    successAttendance,
    timeZone,
  );
  const currentStep = getStepIndex(step);
  const validationDate = capturedAt
    ? capturedAt.toLocaleDateString('fr-FR')
    : '--/--/----';
  const validationTime = formatActionTime(capturedAt, timeZone);
  const successRecordedAt =
    pendingAction === 'check-out'
      ? successAttendance?.clockOutAt
      : successAttendance?.clockInAt;
  const successStatus = getSuccessStatusDisplay(successSummary.detail);
  const positionStatusLabel = getPositionStatusLabel({
    comment,
    locationStatus,
    securityPayload,
    securityPolicy,
  });

  useEffect(() => {
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let synchronizationRunning = false;

    function scheduleNextRetry() {
      clearTimeout(retryTimer);
      const nextAttemptTime = readOfflineAttendanceQueue(window.localStorage)
        .filter(({ state }) => state === 'pending' || state === 'syncing')
        .map(({ nextAttemptAt }) =>
          nextAttemptAt ? new Date(nextAttemptAt).getTime() : Date.now(),
        )
        .filter(Number.isFinite)
        .sort((left, right) => left - right)[0];

      if (nextAttemptTime !== undefined && navigator.onLine) {
        retryTimer = setTimeout(
          synchronize,
          Math.max(0, nextAttemptTime - Date.now()),
        );
      }
    }

    async function synchronize() {
      if (!navigator.onLine || synchronizationRunning || !offlineSessionBinding) {
        return;
      }
      synchronizationRunning = true;
      try {
        await synchronizeOfflineAttendanceQueue(
          window.localStorage,
          offlineSessionBinding,
          (item) =>
            fetch('/api/attendance/me/sync', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                clientRequestId: item.clientRequestId,
                sessionBinding: item.sessionBinding,
                contextToken: item.contextToken,
                action: item.action,
                capturedAt: item.capturedAt,
                ...(item.siteId ? { siteId: item.siteId } : {}),
                ...(item.notes ? { notes: item.notes } : {}),
                ...(item.security ? { security: item.security } : {}),
              }),
            }),
          undefined,
          offlineQueueOwner,
        );
      } finally {
        synchronizationRunning = false;
      }
      router.refresh();
      scheduleNextRetry();
    }

    const handleOnline = () => void synchronize();
    const handleQueueChanged = () => {
      if (navigator.onLine) void synchronize();
    };
    window.addEventListener('online', handleOnline);
    window.addEventListener(OFFLINE_ATTENDANCE_QUEUE_EVENT, handleQueueChanged);
    if (navigator.onLine) void synchronize();
    return () => {
      clearTimeout(retryTimer);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener(OFFLINE_ATTENDANCE_QUEUE_EVENT, handleQueueChanged);
    };
  }, [offlineSessionBinding, offlineQueueOwner, router]);

  async function beginAction(action: AttendanceAction) {
    if (!navigator.onLine) {
      const bootstrap = readActiveOfflineAttendanceBootstrap(window.localStorage);
      const eventTime = new Date();
      const actionState = bootstrap
        ? deriveOfflineAttendanceActions(bootstrap, readOfflineAttendanceQueue(window.localStorage))
        : { canCheckIn: false, canCheckOut: false, blocked: true };
      const requestedActionAllowed = action === 'check-in'
        ? actionState.canCheckIn
        : actionState.canCheckOut;
      if (
        !bootstrap ||
        !offlineQueueOwner ||
        bootstrap.employeeId !== offlineQueueOwner.employeeId ||
        (offlineQueueOwner.organizationId && bootstrap.organizationId !== offlineQueueOwner.organizationId) ||
        bootstrap.siteId !== attendanceSiteId ||
        actionState.blocked ||
        !requestedActionAllowed ||
        !isOfflineContextValidForCapture(bootstrap, eventTime)
      ) {
        setFeedback({
          tone: 'error',
          message: 'Le contexte de pointage hors ligne est absent ou expiré. Reconnectez-vous pour le renouveler.',
        });
        setStep('error');
        return;
      }
      setOfflineContextToken(bootstrap.contextToken);
    }
    if (navigator.onLine) {
      const contextPath = attendanceSiteId
        ? `/api/attendance/me/offline-context?siteId=${encodeURIComponent(attendanceSiteId)}&authMode=${sessionMode}`
        : `/api/attendance/me/offline-context?authMode=${sessionMode}`;
      try {
        const response = await fetch(contextPath, { method: 'GET' });
        if (response.ok) {
          const payload = (await response.json()) as { contextToken?: string };
          if (payload.contextToken) {
            if (persistOfflineContextToken(payload.contextToken, offlineBootstrapSeed, attendanceSiteId, securityPolicy)) {
              setOfflineContextToken(payload.contextToken);
            }
          }
        }
      } catch {
        // Online attendance can proceed; a current cached context remains
        // available for offline queuing if its signed validity has not ended.
      }
    }
    setPendingAction(action);
    setSelfieDataUrl(null);
    setComment('');
    setCapturedAt(new Date());
    setSecurityPayload(null);
    setLocationStatus('pending');
    setFeedback(null);
    setSuccessAttendance(null);
    setLocallyQueued(false);
    setStep(securityPolicy?.selfieRequired ? 'selfie' : 'comment');
  }

  function resetToAction() {
    setStep('action');
    setPendingAction(null);
    setSelfieDataUrl(null);
    setComment('');
    setCapturedAt(null);
    setSecurityPayload(null);
    setLocationStatus('pending');
    setFeedback(null);
    setSuccessAttendance(null);
    setLocallyQueued(false);
  }

  function applyCommentSuggestion(suggestion: string) {
    setComment((currentComment) => {
      const trimmedComment = currentComment.trim();
      const nextComment = trimmedComment
        ? `${trimmedComment} - ${suggestion}`
        : suggestion;

      return nextComment.slice(0, COMMENT_MAX_LENGTH);
    });
  }

  async function prepareValidation(nextComment = comment) {
    const normalizedComment = nextComment.slice(0, COMMENT_MAX_LENGTH);

    if (normalizedComment !== comment) {
      setComment(normalizedComment);
    }

    if (securityPolicy?.selfieRequired && !selfieDataUrl) {
      setFeedback({
        tone: 'error',
        message: 'Le selfie est obligatoire pour valider ce pointage.',
      });
      setStep('selfie');
      return;
    }

    setFeedback(null);
    setLocationStatus('pending');

    const security: AttendanceSecurityPayload = {};
    if (securityPolicy?.enabled) {
      security.evidenceCapturedAt = new Date().toISOString();
    }
    if (selfieDataUrl) {
      security.verificationPhotoDataUrl = selfieDataUrl;
    }

    if (securityPolicy?.gpsRequired) {
      try {
        const location = await getCurrentLocation();

        security.latitude = location.latitude;
        security.longitude = location.longitude;
        security.accuracyMeters = location.accuracyMeters;
        setLocationStatus('recorded');
      } catch (error) {
        const geolocationError = error as GeolocationPositionError;
        setLocationStatus(
          geolocationError.code === 1
            ? 'denied'
            : geolocationError.code === 3
              ? 'timeout'
              : 'unavailable',
        );
      }
    }

    setSecurityPayload(security);
    setStep('validation');
  }

  async function submitAttendance() {
    if (!pendingAction || !securityPayload || !capturedAt) {
      return;
    }

    if (securityPolicy?.gpsRequired && locationStatus !== 'recorded') {
      setFeedback({
        tone: 'error',
        message:
          'La localisation est obligatoire pour ce pointage. Autorisez la position puis réessayez.',
      });
      return;
    }

    setStep('submitting');
    setFeedback(null);
    const offlinePayload = {
      action: pendingAction,
      capturedAt: capturedAt.toISOString(),
      ...(offlineContextToken ? { contextToken: offlineContextToken } : {}),
      ...(attendanceSiteId ? { siteId: attendanceSiteId } : {}),
      ...(comment.trim() ? { notes: comment.trim() } : {}),
      security: securityPayload,
    };

    const queueForSynchronization = async () => {
      if (!offlineSessionBinding || !offlineContextToken) {
        setFeedback({
          tone: 'error',
          message:
            'La session nécessaire au pointage hors ligne est indisponible. Reconnectez-vous puis réessayez.',
        });
        setStep('validation');
        return;
      }
      if (
        securityPayload.verificationPhotoDataUrl &&
        securityPayload.verificationPhotoDataUrl.length > 1_000_000
      ) {
        setFeedback({
          tone: 'error',
          message: 'La photo dépasse la taille acceptée. Reprenez le selfie avant de valider.',
        });
        setStep('validation');
        return;
      }
      try {
        await enqueueOfflineAttendanceWithEvidence(window.localStorage, {
          ...offlinePayload,
          sessionBinding: offlineSessionBinding,
        });
      } catch {
        setFeedback({
          tone: 'error',
          message: 'Le pointage et ses preuves n’ont pas pu être enregistrés sur cet appareil. Libérez de l’espace puis réessayez.',
        });
        setStep('validation');
        return;
      }
      setLocallyQueued(true);
      if (navigator.onLine) {
        window.dispatchEvent(new Event(OFFLINE_ATTENDANCE_QUEUE_EVENT));
      }
      setFeedback({
        tone: 'success',
        message:
          'Pointage enregistré sur cet appareil — synchronisation en attente.',
      });
      setStep('validation');
    };

    if (!navigator.onLine) {
      await queueForSynchronization();
      return;
    }

    try {
      const response = await fetch(getActionPath(pendingAction), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...(attendanceSiteId ? { siteId: attendanceSiteId } : {}),
          ...(comment.trim() ? { notes: comment.trim() } : {}),
          security: securityPayload,
        }),
      });

      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
      } & Partial<AttendanceRecord>;

      if (!response.ok) {
        if (response.status >= 500 || response.status === 429) {
          await queueForSynchronization();
          return;
        }
        setFeedback({
          tone: 'error',
          message: data.error ?? 'Impossible de valider ce pointage.',
        });
        setStep('validation');
        return;
      }

      setSuccessAttendance(data);
      router.refresh();
      setStep('success');
    } catch {
      await queueForSynchronization();
    }
  }

  if (step === 'success') {
    return (
      <section className="fixed inset-0 z-50 flex justify-center overflow-hidden bg-background">
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.98)_52%,rgba(240,253,244,0.5))]" />
        <div className="relative flex h-[100dvh] w-full max-w-[460px] flex-col px-4 pb-3 pt-[calc(env(safe-area-inset-top)+1.5rem)]">
          <div className="min-h-0 flex-1 overflow-y-auto pt-4">
            <div className="relative flex justify-center py-3">
              <span className="absolute left-[16%] top-8 h-3 w-3 rotate-45 rounded-sm bg-accent/90" />
              <span className="absolute right-[18%] top-4 h-3 w-3 rotate-45 rounded-sm bg-success/80" />
              <span className="absolute left-[24%] bottom-8 h-2.5 w-2.5 rounded-full bg-success/70" />
              <span className="absolute right-[26%] bottom-7 h-2.5 w-2.5 rounded-full bg-accent/80" />
              <div className="flex h-40 w-40 items-center justify-center rounded-full bg-success/10 shadow-[0_24px_58px_rgba(25,135,84,0.18)]">
                <div className="flex h-28 w-28 items-center justify-center rounded-full bg-success text-6xl font-black leading-none text-white shadow-[0_18px_42px_rgba(25,135,84,0.26)]">
                  ✓
                </div>
              </div>
            </div>

            <div className="mt-4 text-center">
              <h2 className="text-[2rem] font-black leading-tight text-slate-950">
                Pointage enregistré !
              </h2>
              <p
                className={cn(
                  'mt-3 text-lg font-black',
                  successStatus.className,
                )}
              >
                {successStatus.label === 'Statut'
                  ? successStatus.value
                  : `${successStatus.label} : ${successStatus.value}`}
              </p>
            </div>

            <div className="mt-8 rounded-[28px] border border-slate-200/90 bg-white/96 px-4 shadow-[0_18px_44px_rgba(15,45,58,0.08)]">
              <SummaryRow
                label="Type de pointage"
                value={getActionLabel(pendingAction)}
                valueClassName={
                  pendingAction === 'check-out' ? 'text-accent' : 'text-success'
                }
              />
              <SummaryRow label="Employé" value={employeeName} />
              <SummaryRow
                label="Date"
                value={formatActionDate(successRecordedAt, timeZone)}
              />
              <SummaryRow
                label="Heure"
                value={formatActionTime(successRecordedAt, timeZone)}
              />
              <div className="flex items-start justify-between gap-4 border-b border-slate-100 py-2.5">
                <p className="shrink-0 text-sm font-bold text-slate-500">GPS</p>
                <p className="inline-flex items-center gap-2 text-sm font-black text-success">
                  <span className="h-2.5 w-2.5 rounded-full bg-success" />
                  {positionStatusLabel}
                </p>
              </div>
              <SummaryRow
                label={successStatus.label}
                value={successStatus.value}
                valueClassName={successStatus.className}
              />
            </div>
          </div>

          {sessionMode === 'attendance-entry' ? (
            <AttendanceEntrySessionButton
              className="sticky bottom-0 shrink-0 bg-white/95 pb-[calc(env(safe-area-inset-bottom)+0.875rem)] pt-3 [&_button]:h-[64px] [&_button]:w-full [&_button]:rounded-[26px] [&_button]:bg-success [&_button]:text-base [&_button]:font-black [&_button]:text-white [&_button]:shadow-[0_22px_46px_rgba(25,135,84,0.26)]"
              label="Nouveau pointage"
              onLoggedOut={resetToAction}
              pendingLabel="Préparation..."
              redirectTo={attendanceEntryRedirectTo}
              variant="default"
            />
          ) : (
            <div className="sticky bottom-0 shrink-0 bg-white/95 pb-[calc(env(safe-area-inset-bottom)+0.875rem)] pt-3">
              <Button
                className="h-[64px] w-full rounded-[26px] bg-success text-base font-black text-white shadow-[0_22px_46px_rgba(25,135,84,0.26)] hover:bg-success/95"
                onClick={resetToAction}
                type="button"
              >
                Nouveau pointage
              </Button>
            </div>
          )}
        </div>
      </section>
    );
  }

  return (
    <section className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden sm:gap-4">
      <OfflineAttendanceStatus />
      {!deviceOnline ? (
        <p aria-live="polite" className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-950">
          {!offlineActionState.contextValid
            ? 'Contexte hors ligne expiré ou absent : reconnectez-vous avant un nouveau pointage.'
            : offlineActionState.blocked
              ? 'Un pointage précédent nécessite une résolution. Les actions suivantes sont bloquées.'
              : 'Vous êtes hors connexion. Les pointages valides seront conservés sur cet appareil.'}
        </p>
      ) : null}
      {step === 'action' || step === 'comment' ? null : (
        <StepIndicator currentStep={currentStep} />
      )}

      {step === 'action' ? (
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pb-[calc(env(safe-area-inset-bottom)+0.75rem)]">
          <AttendanceLiveClock timeZone={timeZone} />

          <section className="rounded-[22px] border border-slate-200/80 bg-white px-4 py-3 shadow-[0_14px_34px_rgba(15,45,58,0.07)]">
            {requiresSiteSelection ? (
              <label className="mb-3 block space-y-2 text-sm font-bold text-slate-700">
                Site de pointage
                <select
                  className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3"
                  onChange={(event) => setSelectedSiteId(event.target.value)}
                  value={selectedSiteId}
                >
                  <option value="">Sélectionner un site</option>
                  {attendanceSites
                    .filter((site) => site.isActive)
                    .map((site) => (
                      <option key={site.id} value={site.id}>
                        {site.name}
                      </option>
                    ))}
                </select>
              </label>
            ) : null}
            {securityPolicy?.siteName ? (
              <p className="mb-3 rounded-xl bg-primary/5 px-3 py-2 text-sm font-bold text-primary">
                Site de pointage : {securityPolicy.siteName}
              </p>
            ) : null}
            <div className="grid gap-2 text-sm font-black text-slate-800">
              <div className="flex items-center gap-3">
                <span className="h-2.5 w-2.5 rounded-full bg-primary/70" />
                <span>
                  {securityPolicy?.gpsRequired
                    ? 'GPS obligatoire'
                    : 'GPS non requis'}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <span className="h-2.5 w-2.5 rounded-full bg-accent/80" />
                <span>
                  {securityPolicy?.selfieRequired
                    ? 'Selfie obligatoire'
                    : 'Selfie non requis'}
                </span>
              </div>
            </div>
          </section>

          <section className="space-y-4">
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.18em] text-accent">
                Choix de l'action
              </p>
              <h2 className="mt-1 text-xl font-black leading-tight text-slate-950">
                Que souhaitez-vous faire ?
              </h2>
            </div>

            <div className="grid gap-4">
              <Button
                className="min-h-[144px] w-full justify-between rounded-[24px] border border-success/40 bg-success/15 px-5 text-left shadow-[0_20px_46px_rgba(25,135,84,0.16)] transition duration-200 hover:bg-success/20 active:scale-[0.99] disabled:border-success/15 disabled:bg-success/5 disabled:text-slate-400 disabled:opacity-55 disabled:shadow-none"
                disabled={
                  !(deviceOnline ? canCheckIn : offlineActionState.canCheckIn) ||
                  (!deviceOnline && (!offlineActionState.contextValid || offlineActionState.blocked)) ||
                  (requiresSiteSelection && !selectedSiteId)
                }
                onClick={() => beginAction('check-in')}
                type="button"
                variant="secondary"
              >
                <span className="flex min-w-0 items-center gap-4">
                  <span className="flex h-20 w-20 shrink-0 items-center justify-center rounded-[24px] bg-success text-[2rem] font-black leading-none text-white shadow-[0_16px_30px_rgba(25,135,84,0.24)]">
                    →
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[2rem] font-black leading-tight text-success">
                      Entrée
                    </span>
                    <span className="mt-2 block text-lg font-semibold leading-6 text-slate-700">
                      Début de journée
                    </span>
                  </span>
                </span>
                <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-success/10 text-4xl font-black leading-none text-success">
                  ›
                </span>
              </Button>

              <Button
                className="min-h-[144px] w-full justify-between rounded-[24px] border border-accent/40 bg-accent/15 px-5 text-left shadow-[0_20px_46px_rgba(249,115,22,0.15)] transition duration-200 hover:bg-accent/20 active:scale-[0.99] disabled:border-accent/15 disabled:bg-accent/5 disabled:text-slate-400 disabled:opacity-55 disabled:shadow-none"
                disabled={
                  !(deviceOnline ? canCheckOut : offlineActionState.canCheckOut) ||
                  (!deviceOnline && (!offlineActionState.contextValid || offlineActionState.blocked)) ||
                  (requiresSiteSelection && !selectedSiteId)
                }
                onClick={() => beginAction('check-out')}
                type="button"
                variant="secondary"
              >
                <span className="flex min-w-0 items-center gap-4">
                  <span className="flex h-20 w-20 shrink-0 items-center justify-center rounded-[24px] bg-accent text-[2rem] font-black leading-none text-white shadow-[0_16px_30px_rgba(249,115,22,0.22)]">
                    ←
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[2rem] font-black leading-tight text-accent">
                      Sortie
                    </span>
                    <span className="mt-2 block text-lg font-semibold leading-6 text-slate-700">
                      Fin de journée
                    </span>
                  </span>
                </span>
                <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-accent/10 text-4xl font-black leading-none text-accent">
                  ›
                </span>
              </Button>
            </div>
          </section>
        </div>
      ) : null}

      {step === 'selfie' ? (
        <div className="fixed inset-0 z-50 flex justify-center overflow-hidden bg-background">
          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.98)_52%,rgba(240,253,244,0.5))]" />
          <div className="relative flex h-[100dvh] w-full max-w-[460px] flex-col px-4 pb-3 pt-[calc(env(safe-area-inset-top)+0.75rem)]">
            <header className="flex shrink-0 items-center">
              <Button
                className="h-12 rounded-full px-4 text-sm font-black"
                onClick={() => setStep('action')}
                type="button"
                variant="secondary"
              >
                Retour
              </Button>
            </header>

            <div className="mt-5 flex shrink-0 items-center justify-between gap-4 rounded-[26px] border border-white/80 bg-white/90 px-4 py-3 shadow-[0_16px_40px_rgba(15,45,58,0.08)]">
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-success/10 text-2xl text-success">
                  ●
                </span>
                <div className="min-w-0">
                  <p className="text-base font-black leading-tight text-slate-950">
                    Position enregistrée
                  </p>
                  <p className="mt-1 truncate text-sm font-semibold text-slate-500">
                    Vérifiée avant validation
                  </p>
                </div>
              </div>
              <span className="shrink-0 rounded-full bg-success/10 px-3 py-1.5 text-sm font-black text-success">
                Prêt
              </span>
            </div>

            <div className="flex min-h-0 flex-1 flex-col justify-between gap-4 overflow-y-auto pt-5">
              {selfieDataUrl ? (
                <div className="flex min-h-0 flex-1 flex-col items-center justify-between gap-4">
                  <div className="relative flex w-full justify-center">
                    <div className="absolute inset-x-8 top-4 h-24 rounded-full bg-success/10 blur-3xl" />
                    <div className="relative aspect-square w-full max-w-[min(68dvh,320px)] rounded-full border border-slate-200/90 bg-white p-2 shadow-[0_24px_60px_rgba(15,45,58,0.14)]">
                      <Image
                        alt="Selfie capturé"
                        className="h-full w-full rounded-full object-cover ring-8 ring-slate-50"
                        height={720}
                        src={selfieDataUrl}
                        unoptimized
                        width={720}
                      />
                    </div>
                  </div>

                  <p className="text-center text-[1.35rem] font-black leading-tight text-slate-950">
                    Cadrez votre visage
                  </p>

                  <div className="sticky bottom-0 grid w-full grid-cols-[0.9fr_1.1fr] gap-3 bg-white/95 pb-[env(safe-area-inset-bottom)] pt-1">
                    <Button
                      className="h-[60px] rounded-[22px] text-sm font-black"
                      onClick={() => setSelfieDataUrl(null)}
                      type="button"
                      variant="secondary"
                    >
                      Reprendre
                    </Button>
                    <Button
                      className="h-[60px] rounded-[22px] bg-success text-base font-black shadow-[0_18px_36px_rgba(25,135,84,0.22)] hover:bg-success/95"
                      onClick={() => setStep('comment')}
                      type="button"
                    >
                      Continuer
                    </Button>
                  </div>
                </div>
              ) : (
                <AttendanceSelfieCapture
                  onCapture={(photoDataUrl) => {
                    setSelfieDataUrl(photoDataUrl);
                    setFeedback(null);
                  }}
                />
              )}
            </div>
          </div>
        </div>
      ) : null}

      {step === 'comment' ? (
        <div className="fixed inset-0 z-50 flex justify-center overflow-hidden bg-background">
          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.98)_52%,rgba(240,253,244,0.42))]" />
          <div className="relative flex h-[100dvh] w-full max-w-[460px] flex-col px-4 pb-3 pt-[calc(env(safe-area-inset-top)+0.75rem)]">
            <header className="flex shrink-0 items-center">
              <Button
                className="h-12 rounded-full px-4 text-sm font-black"
                onClick={() =>
                  setStep(securityPolicy?.selfieRequired ? 'selfie' : 'action')
                }
                type="button"
                variant="secondary"
              >
                Retour
              </Button>
            </header>

            <div className="flex min-h-0 flex-1 flex-col overflow-y-auto pt-6">
              <div className="flex flex-col items-center text-center">
                <div className="flex h-24 w-24 items-center justify-center rounded-full bg-success/10 text-success shadow-[0_18px_44px_rgba(25,135,84,0.12)]">
                  <span className="relative flex h-12 w-14 items-center justify-center rounded-[22px] bg-success text-2xl font-black leading-none text-white after:absolute after:-bottom-1 after:left-2 after:h-4 after:w-4 after:rounded-bl-[10px] after:bg-success after:content-['']">
                    ···
                  </span>
                </div>

                <h2 className="mt-6 text-[2rem] font-black leading-tight text-slate-950">
                  Ajouter un commentaire
                </h2>
                <p className="mt-4 text-xl font-semibold leading-8 text-slate-600">
                  Ce commentaire est facultatif.
                  <br />
                  Il sera visible par votre responsable.
                </p>
              </div>

              <div className="relative mt-6 rounded-[28px] border border-slate-200/90 bg-white/96 p-4 pb-8 shadow-[0_18px_44px_rgba(15,45,58,0.08)]">
                <textarea
                  className="h-[200px] w-full resize-none bg-transparent text-[1.35rem] font-semibold leading-8 text-slate-950 outline-none placeholder:text-slate-400"
                  maxLength={COMMENT_MAX_LENGTH}
                  onChange={(event) => setComment(event.target.value)}
                  placeholder="Écrivez votre commentaire..."
                  value={comment}
                />
                <p className="absolute bottom-3 right-5 text-xs font-medium text-slate-400">
                  {comment.length}/{COMMENT_MAX_LENGTH}
                </p>
              </div>

              <div className="mt-6">
                <p className="text-lg font-black text-slate-950">
                  Suggestions rapides
                </p>
                <div className="mt-3 flex flex-wrap gap-3">
                  {COMMENT_SUGGESTIONS.map((suggestion) => (
                    <button
                      className="min-h-12 rounded-[22px] border border-success/15 bg-success/10 px-5 text-base font-black text-primary shadow-[0_10px_24px_rgba(25,135,84,0.08)] transition duration-200 active:scale-[0.98]"
                      key={suggestion}
                      onClick={() => applyCommentSuggestion(suggestion)}
                      type="button"
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="sticky bottom-0 shrink-0 bg-white/95 pb-[calc(env(safe-area-inset-bottom)+0.875rem)] pt-3">
              <Button
                className="h-[60px] w-full justify-between rounded-[24px] bg-success px-8 text-lg font-black shadow-[0_20px_42px_rgba(25,135,84,0.24)] hover:bg-success/95"
                onClick={() => prepareValidation(comment)}
                type="button"
              >
                <span />
                <span>Continuer</span>
                <span className="text-3xl leading-none">→</span>
              </Button>
              <button
                className="mt-3 h-11 w-full text-center text-base font-medium text-success/80"
                onClick={() => {
                  setComment('');
                  void prepareValidation('');
                }}
                type="button"
              >
                Passer cette étape
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {step === 'validation' || step === 'submitting' ? (
        <div className="fixed inset-0 z-50 flex justify-center overflow-hidden bg-background">
          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.98)_52%,rgba(240,253,244,0.42))]" />
          <div className="relative flex h-[100dvh] w-full max-w-[460px] flex-col px-4 pb-3 pt-[calc(env(safe-area-inset-top)+0.75rem)]">
            <header className="flex shrink-0 items-center">
              <Button
                className="h-12 rounded-full px-4 text-sm font-black"
                disabled={isBusy || locallyQueued}
                onClick={() => setStep('comment')}
                type="button"
                variant="secondary"
              >
                Retour
              </Button>
            </header>

            <div className="flex min-h-0 flex-1 flex-col overflow-y-auto pt-6">
              <div className="text-center">
                <h2 className="inline-flex items-center justify-center gap-2 text-[2rem] font-black leading-tight text-slate-950">
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-success/10 text-base text-success">
                    ✓
                  </span>
                  <span>Validation</span>
                </h2>
                <p className="mt-3 text-base font-semibold leading-6 text-slate-600">
                  Vérifiez les informations avant d'enregistrer.
                </p>
              </div>

              {selfieDataUrl ? (
                <div className="mt-6 flex justify-center">
                  <div className="rounded-[30px] border border-white/90 bg-white p-2 shadow-[0_22px_54px_rgba(15,45,58,0.12)]">
                    <Image
                      alt="Selfie ajouté"
                      className="aspect-square h-[min(32dvh,260px)] w-auto rounded-[24px] object-cover"
                      height={720}
                      src={selfieDataUrl}
                      unoptimized
                      width={720}
                    />
                  </div>
                </div>
              ) : null}

              <div className="mt-6 rounded-[28px] border border-slate-200/90 bg-white/96 px-4 shadow-[0_18px_44px_rgba(15,45,58,0.08)]">
                <SummaryRow
                  label="Type de pointage"
                  value={actionLabel}
                  valueClassName={
                    pendingAction === 'check-out'
                      ? 'text-accent'
                      : 'text-success'
                  }
                />
                <SummaryRow label="Employé" value={employeeName} />
                <SummaryRow label="Date" value={validationDate} />
                <SummaryRow label="Heure" value={validationTime} />
                <div className="flex items-start justify-between gap-4 border-b border-slate-100 py-2.5">
                  <p className="shrink-0 text-sm font-bold text-slate-500">
                    GPS
                  </p>
                  <p className="inline-flex items-center gap-2 text-sm font-black text-success">
                    <span className="h-2.5 w-2.5 rounded-full bg-success" />
                    {positionStatusLabel}
                  </p>
                </div>
                <SummaryRow
                  label="Commentaire"
                  preserveLines
                  value={comment.trim() ? comment.trim() : 'Aucun'}
                />
              </div>

              {feedback ? (
                <div
                  aria-live="polite"
                  className={cn(
                    'mt-4 rounded-[20px] border px-4 py-3 text-sm font-bold',
                    feedback.tone === 'error' &&
                      'border-red-100 bg-red-50 text-red-700',
                    feedback.tone === 'success' &&
                      'border-success/20 bg-success/10 text-success',
                  )}
                >
                  {feedback.message}
                </div>
              ) : null}
            </div>

            <div className="sticky bottom-0 shrink-0 bg-white/95 pb-[calc(env(safe-area-inset-bottom)+0.875rem)] pt-3">
              <Button
                className="h-[60px] w-full rounded-[24px] bg-success text-base font-black text-white opacity-100 shadow-[0_20px_42px_rgba(25,135,84,0.24)] hover:bg-success/95 disabled:bg-success disabled:text-white disabled:opacity-100 disabled:shadow-[0_18px_38px_rgba(25,135,84,0.2)]"
                disabled={isBusy || locallyQueued}
                onClick={submitAttendance}
                type="button"
              >
                {isBusy ? (
                  <span className="inline-flex items-center gap-2">
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                    Enregistrement...
                  </span>
                ) : locallyQueued ? (
                  'Pointage mis en attente'
                ) : (
                  'Valider le pointage'
                )}
              </Button>
              {locallyQueued ? (
                <button
                  className="mt-3 h-11 w-full text-center text-base font-bold text-success"
                  onClick={resetToAction}
                  type="button"
                >
                  Continuer vers le prochain pointage
                </button>
              ) : (
                <button
                  className="mt-3 h-11 w-full text-center text-base font-medium text-slate-500"
                  disabled={isBusy}
                  onClick={() => setStep('comment')}
                  type="button"
                >
                  Modifier
                </button>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
