import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';

const DEFAULT_TEST_DATABASE_URL =
  'postgresql://postgres:postgres@localhost:5433/konatech_attendance_test?schema=public';

function loadEnvFile(filePath: string) {
  if (!existsSync(filePath)) {
    return;
  }

  const content = readFileSync(filePath, 'utf8');
  const lines = content.split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const separatorIndex = trimmed.indexOf('=');

    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    let value = trimmed.slice(separatorIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

export function applyTestEnvironment() {
  process.env.NODE_ENV = 'test';

  loadEnvFile(resolve(__dirname, '../.env.test.local'));
  loadEnvFile(resolve(__dirname, '../.env.test'));

  process.env.PORT ??= '4000';
  process.env.FRONTEND_URL ??= 'http://localhost:3000';
  process.env.DATABASE_URL =
    process.env.TEST_DATABASE_URL ??
    process.env.DATABASE_URL ??
    DEFAULT_TEST_DATABASE_URL;

  return {
    databaseUrl: process.env.DATABASE_URL,
  };
}
