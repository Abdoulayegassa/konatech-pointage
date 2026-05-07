import { execFileSync } from 'child_process';
import { resolve } from 'path';
import { PrismaClient } from '@prisma/client';
import { seedDatabase } from '../prisma/seed';
import { applyTestEnvironment } from './test-environment';

function quoteIdentifier(value: string) {
  return `"${value.replace(/"/g, '""')}"`;
}

function getDatabaseName(databaseUrl: string) {
  const parsedUrl = new URL(databaseUrl);
  const databaseName = parsedUrl.pathname.replace(/^\//, '');

  if (!databaseName) {
    throw new Error('Test DATABASE_URL must include a database name.');
  }

  return databaseName;
}

function getAdminDatabaseUrl(databaseUrl: string) {
  const parsedUrl = new URL(databaseUrl);
  parsedUrl.pathname = '/postgres';

  return parsedUrl.toString();
}

function getPrismaCliEntrypoint() {
  return resolve(__dirname, '../node_modules/prisma/build/index.js');
}

function runMigrations(databaseUrl: string) {
  const writableTempDirectory = resolve(__dirname, '../../../.tmp');
  const args = ['migrate', 'deploy', '--schema', 'prisma/schema.prisma'];
  const options = {
    cwd: resolve(__dirname, '..'),
    env: {
      ...process.env,
      DATABASE_URL: databaseUrl,
      HOME: resolve(__dirname, '../../..'),
      USERPROFILE: resolve(__dirname, '../../..'),
      TEMP: writableTempDirectory,
      TMP: writableTempDirectory,
    },
    stdio: 'inherit' as const,
  };

  execFileSync(process.execPath, [getPrismaCliEntrypoint(), ...args], options);
}

async function recreateDatabase(databaseUrl: string) {
  const databaseName = getDatabaseName(databaseUrl);
  const adminPrisma = new PrismaClient({
    datasources: {
      db: {
        url: getAdminDatabaseUrl(databaseUrl),
      },
    },
  });

  try {
    await adminPrisma.$connect();
    await adminPrisma.$executeRaw`
      SELECT pg_terminate_backend(pid)
      FROM pg_stat_activity
      WHERE datname = ${databaseName}
        AND pid <> pg_backend_pid()
    `;
    await adminPrisma.$executeRawUnsafe(
      `DROP DATABASE IF EXISTS ${quoteIdentifier(databaseName)}`,
    );
    await adminPrisma.$executeRawUnsafe(
      `CREATE DATABASE ${quoteIdentifier(databaseName)}`,
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unknown PostgreSQL error.';

    throw new Error(
      `Unable to prepare the backend test database. Start PostgreSQL with "docker compose up -d" and verify the test DATABASE_URL. ${message}`,
      {
        cause: error,
      },
    );
  } finally {
    await adminPrisma.$disconnect();
  }
}

export async function prepareTestDatabase() {
  const { databaseUrl } = applyTestEnvironment();

  await recreateDatabase(databaseUrl);
  runMigrations(databaseUrl);

  const prisma = new PrismaClient({
    datasources: {
      db: {
        url: databaseUrl,
      },
    },
  });

  try {
    await seedDatabase(prisma, new Date('2026-04-20T00:00:00.000Z'));
  } finally {
    await prisma.$disconnect();
  }
}
