import 'dotenv/config';
import { AccessRole, PrismaClient } from '@prisma/client';
import { hashPinCode } from '../src/common/security/password.util';

async function main() {
  const prisma = new PrismaClient();

  try {
    const employees = await prisma.employee.findMany({
      where: {
        accessRole: AccessRole.EMPLOYEE,
        pinCodeHash: null,
        pinCode: {
          not: null,
        },
      },
      select: {
        id: true,
        pinCode: true,
      },
    });

    let migratedCount = 0;

    for (const employee of employees) {
      if (!employee.pinCode) {
        continue;
      }

      await prisma.employee.update({
        where: {
          id: employee.id,
        },
        data: {
          pinCodeHash: await hashPinCode(employee.pinCode),
          pinCode: null,
        },
      });

      migratedCount += 1;
    }

    console.log(
      `Employee PIN hash backfill completed. Migrated ${migratedCount} employee record(s).`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch((error) => {
  console.error(
    'Employee PIN hash backfill failed:',
    error instanceof Error ? error.message : error,
  );
  process.exitCode = 1;
});
