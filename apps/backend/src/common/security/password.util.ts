import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'crypto';
import { promisify } from 'util';

const scrypt = promisify(scryptCallback);
const KEY_LENGTH = 64;
const HASH_PREFIX = 'scrypt';

export async function hashSecret(secret: string) {
  const salt = randomBytes(16).toString('hex');
  const derivedKey = (await scrypt(secret, salt, KEY_LENGTH)) as Buffer;

  return `${HASH_PREFIX}:${salt}:${derivedKey.toString('hex')}`;
}

export async function verifySecret(secret: string, storedHash: string) {
  const [prefix, salt, hash] = storedHash.split(':');

  if (!prefix || !salt || !hash || prefix !== HASH_PREFIX) {
    return false;
  }

  const derivedKey = (await scrypt(secret, salt, KEY_LENGTH)) as Buffer;
  const storedKey = Buffer.from(hash, 'hex');

  if (storedKey.length !== derivedKey.length) {
    return false;
  }

  return timingSafeEqual(storedKey, derivedKey);
}

export function hashPassword(password: string) {
  return hashSecret(password);
}

export function verifyPassword(password: string, storedHash: string) {
  return verifySecret(password, storedHash);
}

export function hashPinCode(pinCode: string) {
  return hashSecret(pinCode);
}

export function verifyPinCode(pinCode: string, storedHash: string) {
  return verifySecret(pinCode, storedHash);
}
