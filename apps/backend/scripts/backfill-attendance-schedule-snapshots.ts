import { PrismaClient } from '@prisma/client';
import { scheduleSelect } from '../src/common/prisma/selects';
import { buildAttendanceScheduleSnapshot } from '../src/common/utils/attendance-schedule-snapshot.util';

const prisma = new PrismaClient();

async function main() {
  const attendances = await prisma.attendance.findMany({
    where: {
      scheduleNameSnapshot: null,
    },
    select: {
      id: true,
      date: true,
      clockInAt: true,
      employee: {
        select: {
          schedule: {
            select: scheduleSelect,
          },
        },
      },
    },
  });

  let updatedCount = 0;
  let skippedCount = 0;

  for (const attendance of attendances) {
    const schedule = attendance.employee.schedule;

    if (!schedule?.isActive) {
      skippedCount += 1;
      continue;
    }

    await prisma.attendance.update({
      where: {
        id: attendance.id,
      },
      data: buildAttendanceScheduleSnapshot(
        schedule,
        attendance.clockInAt ?? attendance.date,
      ),
    });
    updatedCount += 1;
  }

  console.log(
    `Attendance schedule snapshot backfill complete: ${updatedCount} updated, ${skippedCount} skipped.`,
  );
}

main()
  .catch(async (error) => {
    console.error('Attendance schedule snapshot backfill failed:', error);
    await prisma.$disconnect();
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
