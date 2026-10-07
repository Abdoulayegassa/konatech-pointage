import type { AccessRole, MembershipRole } from './api';

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

export function getDefaultRedirectPath(
  accessRole: AccessRole,
  membershipRole?: MembershipRole,
) {
  if (membershipRole === 'ADMIN') {
    return '/dashboard';
  }

  return accessRole === 'ADMIN' ? '/dashboard' : '/my-attendance';
}

function canAccessRequestedTarget(
  target: string,
  accessRole: AccessRole,
  membershipRole?: MembershipRole,
) {
  if (target === '/platform' || target.startsWith('/platform/')) return false;

  if (membershipRole === 'ADMIN') return true;

  if (membershipRole === 'EMPLOYEE' || accessRole === 'EMPLOYEE') {
    return target === '/my-attendance' || target.startsWith('/my-attendance?');
  }

  return accessRole === 'ADMIN';
}

export function resolvePostLoginRedirect(
  accessRole: AccessRole,
  requestedTarget?: unknown,
  membershipRole?: MembershipRole,
) {
  const normalizedTarget = normalizeRedirectTarget(requestedTarget);

  if (
    !normalizedTarget ||
    !canAccessRequestedTarget(normalizedTarget, accessRole, membershipRole)
  ) {
    return getDefaultRedirectPath(accessRole, membershipRole);
  }

  if (
    accessRole === 'ADMIN' &&
    (normalizedTarget === '/attendance-entry' ||
      normalizedTarget.startsWith('/attendance-entry?'))
  ) {
    return '/dashboard';
  }

  return normalizedTarget;
}

export function buildLoginRedirectPath(target: string) {
  return `/login?redirectTo=${encodeURIComponent(target)}`;
}
