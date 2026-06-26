import 'dotenv/config';
import { AccessRole, Prisma, PrismaClient } from '@prisma/client';
import { hashPassword } from '../src/common/security/password.util';

const prisma = new PrismaClient();

const DEFAULT_FIRST_NAME = 'Initial';
const DEFAULT_LAST_NAME = 'Admin';
const DEFAULT_ROLE = 'Administrator';
const DEFAULT_DEPARTMENT = 'Administration';
const MAX_IDENTIFIER_ATTEMPTS = 3;

type TransactionClient = Prisma.TransactionClient;

async function main() {
  const adminEmail = getRequiredEnv('ADMIN_EMAIL').trim().toLowerCase();
  const adminPassword = getRequiredEnv('ADMIN_PASSWORD');

  if (!adminEmail.includes('@')) {
    throw new Error('ADMIN_EMAIL must be a valid email address.');
  }

  if (adminPassword.length < 8) {
    throw new Error('ADMIN_PASSWORD must contain at least 8 characters.');
  }

  const existingAdmin = await prisma.employee.findUnique({
    where: {
      email: adminEmail,
    },
    select: {
      id: true,
      email: true,
      accessRole: true,
      isActive: true,
    },
  });

  if (existingAdmin) {
    console.log(
      `Admin bootstrap skipped: ${existingAdmin.email} already exists with role ${existingAdmin.accessRole} and active=${existingAdmin.isActive}.`,
    );
    return;
  }

  const passwordHash = await hashPassword(adminPassword);

  for (let attempt = 0; attempt < MAX_IDENTIFIER_ATTEMPTS; attempt += 1) {
    try {
      const admin = await prisma.$transaction(async (transaction) => {
        const employeeIdentifier =
          await generateEmployeeIdentifier(transaction);

        return transaction.employee.create({
          data: {
            employeeIdentifier,
            pinCode: null,
            pinCodeHash: null,
            firstName:
              process.env.ADMIN_FIRST_NAME?.trim() || DEFAULT_FIRST_NAME,
            lastName: process.env.ADMIN_LAST_NAME?.trim() || DEFAULT_LAST_NAME,
            email: adminEmail,
            role: process.env.ADMIN_JOB_TITLE?.trim() || DEFAULT_ROLE,
            accessRole: AccessRole.ADMIN,
            passwordHash,
            department:
              process.env.ADMIN_DEPARTMENT?.trim() || DEFAULT_DEPARTMENT,
            isActive: true,
            scheduleId: null,
          },
          select: {
            id: true,
            email: true,
            accessRole: true,
            isActive: true,
          },
        });
      });

      console.log(
        `Admin bootstrap complete: ${admin.email} created with role ${admin.accessRole} and active=${admin.isActive}.`,
      );
      return;
    } catch (error) {
      if (
        isEmployeeIdentifierConflict(error) &&
        attempt < MAX_IDENTIFIER_ATTEMPTS - 1
      ) {
        continue;
      }

      throw error;
    }
  }
}

function getRequiredEnv(name: string) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`${name} is required.`);
  }

  return value;
}

async function generateEmployeeIdentifier(
  transaction: TransactionClient,
  referenceDate = new Date(),
) {
  const year = referenceDate.getUTCFullYear();
  const prefix = `EMP-${year}-`;
  const existingEmployees = await transaction.employee.findMany({
    where: {
      employeeIdentifier: {
        startsWith: prefix,
      },
    },
    select: {
      employeeIdentifier: true,
    },
  });
  const latestSequence = existingEmployees.reduce((maxSequence, employee) => {
    const parsedSequence = Number.parseInt(
      employee.employeeIdentifier.slice(prefix.length),
      10,
    );

    return Number.isFinite(parsedSequence)
      ? Math.max(maxSequence, parsedSequence)
      : maxSequence;
  }, 0);
  const nextSequence = latestSequence + 1;

  return `${prefix}${String(nextSequence).padStart(3, '0')}`;
}

function isEmployeeIdentifierConflict(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002' &&
    Array.isArray(error.meta?.target) &&
    error.meta.target.includes('employeeIdentifier')
  );
}

if (require.main === module) {
  main()
    .catch((error) => {
      console.error('Admin bootstrap failed:', error);
      process.exitCode = 1;
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
