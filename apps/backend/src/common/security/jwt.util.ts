import { createHmac, timingSafeEqual } from 'crypto';

type JwtBasePayload = { sub: string; iat: number; exp: number };

export type LegacyJwtPayload = JwtBasePayload & {
  email: string;
  purpose?: never;
};

export type AccountJwtPayload = JwtBasePayload & {
  membershipId: string;
  organizationId: string;
  sessionBinding: string;
  purpose: 'account';
  userVersion: number;
  membershipVersion: number;
};

export type AttendanceEntryJwtPayload = JwtBasePayload & {
  organizationId: string;
  attendanceSiteId: string;
  sessionBinding: string;
  purpose: 'attendance_entry';
};

export type OrganizationSelectionJwtPayload = JwtBasePayload & {
  sub: string;
  purpose: 'organization_selection';
  userVersion: number;
  candidates: Array<{
    organizationId: string;
    membershipId: string;
    membershipVersion: number;
  }>;
};

export type PlatformJwtPayload = JwtBasePayload & {
  purpose: 'platform';
  platformAdminId: string;
  userVersion: number;
  platformAdminVersion: number;
};

export type OfflineAttendanceContextJwtPayload = JwtBasePayload & {
  purpose: 'offline_attendance_context';
  context: Record<string, unknown>;
};

export type JwtPayload =
  | LegacyJwtPayload
  | AccountJwtPayload
  | AttendanceEntryJwtPayload
  | OrganizationSelectionJwtPayload
  | PlatformJwtPayload
  | OfflineAttendanceContextJwtPayload;

export type SignableJwtPayload =
  | Omit<LegacyJwtPayload, 'iat' | 'exp'>
  | Omit<AccountJwtPayload, 'iat' | 'exp'>
  | Omit<AttendanceEntryJwtPayload, 'iat' | 'exp'>
  | Omit<OrganizationSelectionJwtPayload, 'iat' | 'exp'>
  | Omit<PlatformJwtPayload, 'iat' | 'exp'>
  | Omit<OfflineAttendanceContextJwtPayload, 'iat' | 'exp'>;

const DURATION_MULTIPLIERS: Record<string, number> = {
  s: 1,
  m: 60,
  h: 60 * 60,
  d: 60 * 60 * 24,
};

function encodeBase64Url(value: string | Buffer) {
  return Buffer.from(value)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function decodeBase64Url(value: string) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(
    normalized.length + ((4 - (normalized.length % 4)) % 4),
    '=',
  );

  return Buffer.from(padded, 'base64').toString('utf8');
}

function createSignature(value: string, secret: string) {
  return encodeBase64Url(createHmac('sha256', secret).update(value).digest());
}

function parseDuration(value: string) {
  if (/^\d+$/.test(value)) {
    return Number(value);
  }

  const match = value.match(/^(\d+)([smhd])$/);

  if (!match) {
    throw new Error(
      'JWT_EXPIRES_IN must use seconds or a short duration such as 15m, 8h, or 1d.',
    );
  }

  const [, amount, unit] = match;

  return Number(amount) * DURATION_MULTIPLIERS[unit];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function isPositiveInteger(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) > 0;
}

function parseAndValidatePayload(value: string, allowExpired = false): JwtPayload {
  const payload: unknown = JSON.parse(decodeBase64Url(value));

  if (
    !isRecord(payload) ||
    !isNonEmptyString(payload.sub) ||
    !isPositiveInteger(payload.iat) ||
    !isPositiveInteger(payload.exp)
  ) {
    throw new Error('Invalid JWT payload.');
  }

  if (!allowExpired && payload.exp <= Math.floor(Date.now() / 1000)) {
    throw new Error('JWT token has expired.');
  }

  if (payload.purpose === undefined) {
    if (!isNonEmptyString(payload.email)) {
      throw new Error('Invalid legacy JWT payload.');
    }

    return payload as LegacyJwtPayload;
  }

  if (payload.purpose === 'account') {
    if (
      !isNonEmptyString(payload.membershipId) ||
      !isNonEmptyString(payload.organizationId) ||
      !isNonEmptyString(payload.sessionBinding) ||
      !isPositiveInteger(payload.userVersion) ||
      !isPositiveInteger(payload.membershipVersion)
    ) {
      throw new Error('Invalid account JWT payload.');
    }

    return payload as AccountJwtPayload;
  }

  if (payload.purpose === 'attendance_entry') {
    if (
      !isNonEmptyString(payload.organizationId) ||
      !isNonEmptyString(payload.attendanceSiteId) ||
      !isNonEmptyString(payload.sessionBinding)
    ) {
      throw new Error('Invalid attendance-entry JWT payload.');
    }

    return payload as AttendanceEntryJwtPayload;
  }

  if (payload.purpose === 'platform') {
    if (
      !isNonEmptyString(payload.platformAdminId) ||
      !isPositiveInteger(payload.userVersion) ||
      !isPositiveInteger(payload.platformAdminVersion)
    ) {
      throw new Error('Invalid platform JWT payload.');
    }
    return payload as PlatformJwtPayload;
  }

  if (payload.purpose === 'offline_attendance_context') {
    if (!isRecord(payload.context) || payload.exp <= payload.iat) {
      throw new Error('Invalid offline-attendance context payload.');
    }
    return payload as OfflineAttendanceContextJwtPayload;
  }

  if (payload.purpose === 'organization_selection') {
    if (
      !isPositiveInteger(payload.userVersion) ||
      !Array.isArray(payload.candidates) ||
      payload.candidates.length < 2 ||
      payload.exp <= payload.iat
    ) {
      throw new Error('Invalid organization-selection JWT payload.');
    }

    const candidateKeys = new Set<string>();
    for (const candidate of payload.candidates) {
      if (
        !isRecord(candidate) ||
        !isNonEmptyString(candidate.organizationId) ||
        !isNonEmptyString(candidate.membershipId) ||
        !isPositiveInteger(candidate.membershipVersion)
      ) {
        throw new Error('Invalid organization-selection JWT payload.');
      }

      const candidateKey = `${candidate.organizationId}\u0000${candidate.membershipId}`;
      if (candidateKeys.has(candidateKey)) {
        throw new Error('Invalid organization-selection JWT payload.');
      }
      candidateKeys.add(candidateKey);
    }

    return payload as OrganizationSelectionJwtPayload;
  }

  throw new Error('Invalid JWT purpose.');
}

export function isLegacyJwtPayload(
  payload: JwtPayload,
): payload is LegacyJwtPayload {
  return payload.purpose === undefined;
}

export function isAccountJwtPayload(
  payload: JwtPayload,
): payload is AccountJwtPayload {
  return payload.purpose === 'account';
}

export function isPlatformJwtPayload(
  payload: JwtPayload,
): payload is PlatformJwtPayload {
  return payload.purpose === 'platform';
}

export function isOrganizationSelectionJwtPayload(
  payload: JwtPayload,
): payload is OrganizationSelectionJwtPayload {
  return payload.purpose === 'organization_selection';
}

export function signJwtToken(
  payload: SignableJwtPayload,
  secret: string,
  expiresIn: string,
) {
  const issuedAt = Math.floor(Date.now() / 1000);
  const tokenPayload = {
    ...payload,
    iat: issuedAt,
    exp: issuedAt + parseDuration(expiresIn),
  } as JwtPayload;

  const header = encodeBase64Url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = encodeBase64Url(JSON.stringify(tokenPayload));
  const signature = createSignature(`${header}.${body}`, secret);

  return `${header}.${body}.${signature}`;
}

export function verifyJwtToken(
  token: string,
  secret: string,
  options: { allowExpired?: boolean } = {},
): JwtPayload {
  const segments = token.split('.');

  if (segments.length !== 3 || segments.some((segment) => !segment)) {
    throw new Error('Malformed JWT token.');
  }

  const [header, payload, signature] = segments;
  const expectedSignature = createSignature(`${header}.${payload}`, secret);
  const expectedBuffer = Buffer.from(expectedSignature);
  const receivedBuffer = Buffer.from(signature);

  if (
    expectedBuffer.length !== receivedBuffer.length ||
    !timingSafeEqual(expectedBuffer, receivedBuffer)
  ) {
    throw new Error('Invalid JWT signature.');
  }

  const parsedHeader: unknown = JSON.parse(decodeBase64Url(header));

  if (
    !isRecord(parsedHeader) ||
    parsedHeader.alg !== 'HS256' ||
    parsedHeader.typ !== 'JWT'
  ) {
    throw new Error('Invalid JWT header.');
  }

  return parseAndValidatePayload(payload, options.allowExpired);
}
