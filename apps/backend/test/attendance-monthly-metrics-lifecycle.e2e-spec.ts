import { AttendanceMonthlyMetricsService } from '../src/modules/attendance/attendance-monthly-metrics.service';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { CalendarService } from '../src/modules/calendar/calendar.service';
import { EffectiveScheduleResolver } from '../src/modules/schedules/effective-schedule.resolver';

describe('Attendance monthly metrics lifecycle (e2e)', () => {
  it('waits for scheduled recalculation before module shutdown completes', async () => {
    let finishRecalculation!: () => void;
    let recalculationFinished = false;
    const pendingRecalculation = new Promise<void>((resolve) => {
      finishRecalculation = resolve;
    });
    const service = new AttendanceMonthlyMetricsService(
      {} as PrismaService,
      {} as CalendarService,
      {} as EffectiveScheduleResolver,
    );
    const serviceInternals = service as unknown as {
      runIfMonthClosed: (date: Date) => Promise<void>;
    };
    serviceInternals.runIfMonthClosed = jest
      .fn()
      .mockReturnValue(pendingRecalculation);

    service.onModuleInit();
    const shutdown = service.onModuleDestroy().then(() => {
      recalculationFinished = true;
    });

    await Promise.resolve();
    expect(recalculationFinished).toBe(false);

    finishRecalculation();
    await shutdown;

    expect(recalculationFinished).toBe(true);
  });
});
