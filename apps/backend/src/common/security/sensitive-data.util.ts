const SENSITIVE_KEY_PATTERN =
  /^(authorization|cookie|setcookie|password|passphrase|pin|pincode|pincodehash|token|tokenhash|invitationtoken|jwt|jwtsecret|secret|apikey|apisecret|databaseurl|redisurl|connectionstring)$/i;

const BEARER_PATTERN = /\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi;
const JWT_PATTERN = /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g;
const CREDENTIAL_URL_PATTERN =
  /\b([a-z][a-z0-9+.-]*:\/\/)[^\s/@:]+:[^\s/@]+@/gi;

export function sanitizeLogText(value: unknown, maxLength = 256) {
  const text = typeof value === 'string' ? value : String(value ?? 'unknown');
  const withoutControlCharacters = Array.from(text, (character) => {
    const code = character.charCodeAt(0);
    return code <= 31 || code === 127 ? ' ' : character;
  }).join('');
  return withoutControlCharacters
    .replace(BEARER_PATTERN, 'Bearer [REDACTED]')
    .replace(JWT_PATTERN, '[REDACTED_JWT]')
    .replace(CREDENTIAL_URL_PATTERN, '$1[REDACTED]@')
    .slice(0, maxLength);
}

export function sanitizeRequestPath(value: unknown) {
  const raw = typeof value === 'string' ? value : 'unknown';
  return sanitizeLogText(raw.split('?')[0].split('#')[0], 256);
}

export function getSafeErrorSummary(error: unknown) {
  const errorType =
    error instanceof Error ? error.constructor.name : 'UnknownError';
  const code = (error as { code?: unknown } | null)?.code;
  const safeCode =
    typeof code === 'string' && /^[A-Za-z0-9_-]{1,32}$/.test(code)
      ? code
      : undefined;

  return safeCode ? `${errorType} (${safeCode})` : errorType;
}

export function sanitizeAuditMetadata(
  value: Record<string, unknown> | undefined,
): Record<string, unknown> {
  return sanitizeRecord(value ?? {}, new WeakSet<object>());
}

function sanitizeRecord(
  value: Record<string, unknown>,
  seen: WeakSet<object>,
): Record<string, unknown> {
  if (seen.has(value)) return { circularReference: '[REDACTED]' };
  seen.add(value);

  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [
      key,
      SENSITIVE_KEY_PATTERN.test(key)
        ? '[REDACTED]'
        : sanitizeMetadataValue(entry, seen),
    ]),
  );
}

function sanitizeMetadataValue(value: unknown, seen: WeakSet<object>): unknown {
  if (typeof value === 'string') return sanitizeLogText(value, 512);
  if (Array.isArray(value))
    return value
      .slice(0, 100)
      .map((entry) => sanitizeMetadataValue(entry, seen));
  if (value && typeof value === 'object')
    return sanitizeRecord(value as Record<string, unknown>, seen);
  return value;
}
