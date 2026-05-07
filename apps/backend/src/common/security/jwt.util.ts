import { createHmac, timingSafeEqual } from 'crypto';

export type JwtPayload = {
  sub: string;
  email: string;
  iat: number;
  exp: number;
};

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

export function signJwtToken(
  payload: Omit<JwtPayload, 'iat' | 'exp'>,
  secret: string,
  expiresIn: string,
) {
  const issuedAt = Math.floor(Date.now() / 1000);
  const tokenPayload: JwtPayload = {
    ...payload,
    iat: issuedAt,
    exp: issuedAt + parseDuration(expiresIn),
  };

  const header = encodeBase64Url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = encodeBase64Url(JSON.stringify(tokenPayload));
  const signature = createSignature(`${header}.${body}`, secret);

  return `${header}.${body}.${signature}`;
}

export function verifyJwtToken(token: string, secret: string): JwtPayload {
  const [header, payload, signature] = token.split('.');

  if (!header || !payload || !signature) {
    throw new Error('Malformed JWT token.');
  }

  const expectedSignature = createSignature(`${header}.${payload}`, secret);
  const expectedBuffer = Buffer.from(expectedSignature);
  const receivedBuffer = Buffer.from(signature);

  if (
    expectedBuffer.length !== receivedBuffer.length ||
    !timingSafeEqual(expectedBuffer, receivedBuffer)
  ) {
    throw new Error('Invalid JWT signature.');
  }

  const parsedPayload = JSON.parse(decodeBase64Url(payload)) as JwtPayload;

  if (!parsedPayload.sub || !parsedPayload.email) {
    throw new Error('Invalid JWT payload.');
  }

  if (parsedPayload.exp <= Math.floor(Date.now() / 1000)) {
    throw new Error('JWT token has expired.');
  }

  return parsedPayload;
}
