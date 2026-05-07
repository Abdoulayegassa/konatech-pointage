import { AccessRole } from './api';

function isSafeInternalPath(value: string) {
  return (
    value.startsWith('/') && !value.startsWith('//') && !value.startsWith('/\\')
  );
}

export function normalizeRedirectTarget(value: unknown) {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmedValue = value.trim();

  if (
    !trimmedValue ||
    !isSafeInternalPath(trimmedValue) ||
    trimmedValue === '/login'
  ) {
    return null;
  }

  return trimmedValue;
}

export function getDefaultRedirectPath(accessRole: AccessRole) {
  return accessRole === 'ADMIN' ? '/' : '/my-attendance';
}

export function resolvePostLoginRedirect(
  accessRole: AccessRole,
  requestedTarget?: unknown,
) {
  const normalizedTarget = normalizeRedirectTarget(requestedTarget);

  if (!normalizedTarget) {
    return getDefaultRedirectPath(accessRole);
  }

  if (
    accessRole === 'ADMIN' &&
    (normalizedTarget === '/attendance-entry' ||
      normalizedTarget.startsWith('/attendance-entry?'))
  ) {
    return '/';
  }

  return normalizedTarget;
}

export function buildLoginRedirectPath(target: string) {
  return `/login?redirectTo=${encodeURIComponent(target)}`;
}
