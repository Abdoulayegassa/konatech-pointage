import { BadRequestException, NotFoundException } from '@nestjs/common';
import { MembershipRole } from '@prisma/client';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { AttendanceService } from '../src/modules/attendance/attendance.service';
import { getBusinessDate } from '../src/common/utils/attendance-date.util';
import { AuthenticationContext } from '../src/modules/auth/interfaces/authentication-context.interface';

const context = (
  organizationId: string | null = 'org-a',
): AuthenticationContext => ({
  generation: 'saas',
  purpose: 'account',
  userId: 'user-a',
  membershipId: 'membership-a',
  organizationId,
  membershipRole: MembershipRole.ADMIN,
  employeeId: null,
  attendanceSiteId: null,
});

const legacyContext: AuthenticationContext = {
  generation: 'legacy',
  purpose: 'account',
  userId: null,
  membershipId: null,
  organizationId: null,
  membershipRole: null,
  employeeId: 'legacy-admin',
  attendanceSiteId: null,
};

function createService() {
  const attendanceMock = {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    updateMany: jest.fn(),
    create: jest.fn(),
  };
  const syncRequestMock = {
    create: jest.fn().mockResolvedValue({ id: 'sync-request-a' }),
    updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
    findUnique: jest.fn(),
  };
  const attendanceSiteMock = { findFirst: jest.fn() };
  const txMock = {
    attendance: attendanceMock,
    offlineAttendanceSyncRequest: syncRequestMock,
    attendanceSite: attendanceSiteMock,
    $queryRaw: jest.fn().mockResolvedValue([]),
  };
  const prisma = {
    attendance: attendanceMock,
    offlineAttendanceSyncRequest: syncRequestMock,
    attendanceSite: attendanceSiteMock,
    $transaction: jest.fn(async (run: (tx: unknown) => unknown) => run(txMock)),
    employee: { findFirst: jest.fn(), findUnique: jest.fn() },
    organization: {
      findUnique: jest.fn().mockResolvedValue({ timezone: 'UTC' }),
    },
  };
  const security = {
    getPolicy: jest.fn(() => ({})),
    validateEvidence: jest.fn(),
    getPhotoEvidenceFingerprint: jest.fn(),
    evaluateCheckIn: jest.fn(),
    evaluateCheckOut: jest.fn(),
  };
  const calendar = {
    isNonWorkingDay: jest.fn().mockResolvedValue(false),
    getNonWorkingDateKeys: jest.fn().mockResolvedValue(new Set()),
    getNonWorkingDateKeysForEmployeeInOrganization: jest
      .fn()
      .mockResolvedValue(new Set()),
  };
  return {
    prisma,
    service: new AttendanceService(
      prisma as unknown as PrismaService,
      security as never,
      {} as never,
      calendar as never,
      { assertHistoryAllowed: jest.fn() } as never,
      {
        resolveActiveAttendanceSite: jest.fn().mockResolvedValue(null),
      } as never,
      undefined,
      {
        resolveOptional: jest.fn().mockResolvedValue(null),
      } as never,
    ),
  };
}

describe('Attendance tenant isolation', () => {
  it('scopes date-range history to the authenticated organization', async () => {
    const { prisma, service } = createService();
    prisma.attendance.findMany.mockResolvedValue([]);
    await service.getMonthlyHistory('2026-01', context('org-a'));
    expect(prisma.attendance.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ organizationId: 'org-a' }),
      }),
    );
  });

  it('rejects a SaaS request without organization context before querying', async () => {
    const { prisma, service } = createService();
    await expect(
      service.getMonthlyHistory('2026-01', context(null)),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.attendance.findMany).not.toHaveBeenCalled();
  });

  it('does not resolve a cross-tenant employee for attendance creation', async () => {
    const { prisma, service } = createService();
    prisma.employee.findFirst.mockResolvedValue(null);
    await expect(
      service.checkIn({ employeeId: 'employee-b' }, context('org-a')),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.attendance.create).not.toHaveBeenCalled();
  });

  it('requires a genuine Legacy Employee for Legacy attendance creation', async () => {
    const { prisma, service } = createService();
    prisma.employee.findFirst.mockResolvedValue(null);

    await expect(
      service.checkIn({ employeeId: 'saas-employee' }, legacyContext),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.employee.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'saas-employee',
          organizationId: null,
          userId: null,
        }),
      }),
    );
    expect(prisma.attendance.create).not.toHaveBeenCalled();
  });

  it.each([
    ['same day', '2026-10-05T08:03:00.000Z', '2026-10-05T10:45:00.000Z', 'UTC'],
    ['organization-local midnight', '2026-10-06T06:58:00.000Z', '2026-10-06T07:04:00.000Z', 'America/Los_Angeles'],
  ])('persists offline event time and business date from capturedAt (%s)', async (_case, capturedAt, receivedAtIso, timezone) => {
    const { prisma, service } = createService();
    const receivedAt = new Date(receivedAtIso);
    prisma.organization.findUnique.mockResolvedValue({ timezone } as never);
    prisma.employee.findFirst.mockResolvedValue({
      id: 'employee-a',
      isActive: true,
      schedule: null,
    } as never);
    prisma.attendance.findMany.mockResolvedValue([]);
    prisma.attendance.findFirst.mockResolvedValue(null);
    prisma.attendance.create.mockImplementation(async ({ data }) => ({
      id: 'attendance-a',
      ...data,
    }) as never);
    const security = (service as unknown as {
      attendanceSecurityService: { evaluateCheckIn: jest.Mock };
    }).attendanceSecurityService;
    security.evaluateCheckIn.mockResolvedValue({});
    jest.useFakeTimers().setSystemTime(receivedAt);

    try {
      await service.synchronizeOfflineAttendance(
        'employee-a',
        {
          clientRequestId: 'f3c76cd0-5b5e-41ca-8fb5-daaefc0fb5e1',
          sessionBinding: '0f205e79-48ae-469a-93a8-f8af87168e71',
          action: 'check-in' as never,
          capturedAt,
        },
        {
          ...context(),
          sessionBinding: '0f205e79-48ae-469a-93a8-f8af87168e71',
        },
      );

      expect(prisma.offlineAttendanceSyncRequest.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            capturedAt: new Date(capturedAt),
            receivedAt,
          }),
        }),
      );
      const attendanceWrite = prisma.attendance.create.mock.calls[0][0].data;
      expect(attendanceWrite.clockInAt).toEqual(new Date(capturedAt));
      expect(attendanceWrite.date).toEqual(
        getBusinessDate(new Date(capturedAt), timezone),
      );
      expect(attendanceWrite.clockInAt).not.toEqual(receivedAt);
    } finally {
      jest.useRealTimers();
    }
  });

  it('keeps online employee attendance server-time authoritative', async () => {
    const { prisma, service } = createService();
    const receivedAt = new Date('2026-10-05T10:45:00.000Z');
    prisma.employee.findFirst.mockResolvedValue({
      id: 'employee-a', isActive: true, schedule: null,
    } as never);
    prisma.attendance.findMany.mockResolvedValue([]);
    prisma.attendance.findFirst.mockResolvedValue(null);
    prisma.attendance.create.mockImplementation(async ({ data }) => ({
      id: 'attendance-a', ...data,
    }) as never);
    const security = (service as unknown as {
      attendanceSecurityService: { evaluateCheckIn: jest.Mock };
    }).attendanceSecurityService;
    security.evaluateCheckIn.mockResolvedValue({});
    jest.useFakeTimers().setSystemTime(receivedAt);

    try {
      await service.checkInForEmployee(
        'employee-a',
        { occurredAt: '2026-10-05T08:03:00.000Z' },
        context(),
      );
      expect(prisma.attendance.create.mock.calls[0][0].data.clockInAt).toEqual(receivedAt);
    } finally {
      jest.useRealTimers();
    }
  });

  it('expires a legacy offline event older than the approved 24-hour maximum', async () => {
    const { prisma, service } = createService();
    const receivedAt = new Date('2026-10-05T10:45:00.000Z');
    const capturedAt = new Date('2026-10-03T10:45:00.000Z');
    prisma.employee.findFirst.mockResolvedValue({
      id: 'employee-a', isActive: true, schedule: null,
    } as never);
    prisma.attendance.findMany.mockResolvedValue([]);
    prisma.attendance.findFirst.mockResolvedValue(null);
    prisma.attendance.create.mockImplementation(async ({ data }) => ({
      id: 'attendance-a', ...data,
    }) as never);
    const security = (service as unknown as {
      attendanceSecurityService: { evaluateCheckIn: jest.Mock };
    }).attendanceSecurityService;
    security.evaluateCheckIn.mockResolvedValue({});
    jest.useFakeTimers().setSystemTime(receivedAt);

    try {
      const result = await service.synchronizeOfflineAttendance(
        'employee-a',
        {
          clientRequestId: '5b8672d2-e14f-4f99-898b-e30c0f88710c',
          sessionBinding: '0f205e79-48ae-469a-93a8-f8af87168e71',
          action: 'check-in' as never,
          capturedAt: capturedAt.toISOString(),
        },
        { ...legacyContext, sessionBinding: '0f205e79-48ae-469a-93a8-f8af87168e71' },
      );
      expect(result).toMatchObject({ state: 'expired', capturedAt: capturedAt.toISOString() });
      expect(prisma.attendance.create).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });

  it('continues to apply a supported legacy offline event within 24 hours', async () => {
    const { prisma, service } = createService();
    const receivedAt = new Date('2026-10-05T10:45:00.000Z');
    const capturedAt = new Date('2026-10-04T11:00:00.000Z');
    prisma.employee.findFirst.mockResolvedValue({
      id: 'employee-a', isActive: true, schedule: null,
    } as never);
    prisma.attendance.findMany.mockResolvedValue([]);
    prisma.attendance.findFirst.mockResolvedValue(null);
    prisma.attendance.create.mockImplementation(async ({ data }) => ({
      id: 'attendance-legacy', ...data,
    }) as never);
    const security = (service as unknown as {
      attendanceSecurityService: { evaluateCheckIn: jest.Mock };
    }).attendanceSecurityService;
    security.evaluateCheckIn.mockResolvedValue({});
    jest.useFakeTimers().setSystemTime(receivedAt);

    try {
      const result = await service.synchronizeOfflineAttendance(
        'employee-a',
        {
          clientRequestId: crypto.randomUUID(),
          sessionBinding: '0f205e79-48ae-469a-93a8-f8af87168e71',
          action: 'check-in' as never,
          capturedAt: capturedAt.toISOString(),
        },
        { ...legacyContext, sessionBinding: '0f205e79-48ae-469a-93a8-f8af87168e71' },
      );
      expect(result.state).toBe('accepted');
      expect(prisma.attendance.create.mock.calls[0][0].data.clockInAt).toEqual(capturedAt);
    } finally {
      jest.useRealTimers();
    }
  });

  it('calculates offline lateness from event time and resolves schedule by its business date', async () => {
    const { prisma, service } = createService();
    const receivedAt = new Date('2026-10-05T10:45:00.000Z');
    const capturedAt = '2026-10-05T08:03:00.000Z';
    prisma.employee.findFirst.mockResolvedValue({
      id: 'employee-a', isActive: true, schedule: null,
    } as never);
    prisma.attendance.findMany.mockResolvedValue([]);
    prisma.attendance.findFirst.mockResolvedValue(null);
    prisma.attendance.create.mockImplementation(async ({ data }) => ({
      id: 'attendance-a', ...data,
    }) as never);
    const security = (service as unknown as {
      attendanceSecurityService: { evaluateCheckIn: jest.Mock };
    }).attendanceSecurityService;
    security.evaluateCheckIn.mockResolvedValue({});
    const scheduleResolver = (service as unknown as {
      effectiveSchedules: { resolveOptional: jest.Mock };
    }).effectiveSchedules;
    scheduleResolver.resolveOptional.mockResolvedValue({
      schedule: {
        id: 'schedule-historical', name: 'Historical', isActive: true,
        startTime: '08:00', endTime: '17:00', latenessMarginMinutes: 0,
        workDays: ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'],
      },
    });
    jest.useFakeTimers().setSystemTime(receivedAt);

    try {
      await service.synchronizeOfflineAttendance(
        'employee-a',
        {
          clientRequestId: crypto.randomUUID(),
          sessionBinding: '0f205e79-48ae-469a-93a8-f8af87168e71',
          action: 'check-in' as never,
          capturedAt,
        },
        { ...context(), sessionBinding: '0f205e79-48ae-469a-93a8-f8af87168e71' },
      );
      const write = prisma.attendance.create.mock.calls[0][0].data;
      expect(write.clockInAt).toEqual(new Date(capturedAt));
      expect(write.minutesLate).toBe(3);
      expect(write.scheduleIdSnapshot).toBe('schedule-historical');
      expect(scheduleResolver.resolveOptional).toHaveBeenCalledWith(
        'employee-a', 'org-a', getBusinessDate(new Date(capturedAt), 'UTC'),
      );
    } finally {
      jest.useRealTimers();
    }
  });

  it('rejects invalid and future offline event timestamps before creating sync state', async () => {
    const { prisma, service } = createService();
    const now = new Date('2026-10-05T10:45:00.000Z');
    jest.useFakeTimers().setSystemTime(now);
    try {
      for (const capturedAt of [
        'not-a-date',
        '2026-10-05T10:47:00.001Z',
        '2026-10-05T10:47:06.000Z',
      ]) {
        await expect(service.synchronizeOfflineAttendance(
          'employee-a',
          {
            clientRequestId: crypto.randomUUID(),
            sessionBinding: '0f205e79-48ae-469a-93a8-f8af87168e71',
            action: 'check-in' as never,
            capturedAt,
          },
          { ...context(), sessionBinding: '0f205e79-48ae-469a-93a8-f8af87168e71' },
        )).rejects.toBeInstanceOf(BadRequestException);
      }
      expect(prisma.offlineAttendanceSyncRequest.create).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });
});
