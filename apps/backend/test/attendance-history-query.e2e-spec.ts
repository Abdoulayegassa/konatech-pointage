import { BadRequestException, NotFoundException } from '@nestjs/common';
import { MembershipRole } from '@prisma/client';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { AttendanceService } from '../src/modules/attendance/attendance.service';
import { AuthenticationContext } from '../src/modules/auth/interfaces/authentication-context.interface';

const authentication = (organizationId = 'org-a'): AuthenticationContext => ({
  generation: 'saas',
  purpose: 'account',
  userId: 'user-a',
  membershipId: 'member-a',
  organizationId,
  membershipRole: MembershipRole.ADMIN,
  employeeId: null,
  attendanceSiteId: null,
});

function createService() {
  const prisma = {
    attendance: { findMany: jest.fn(), count: jest.fn() },
    employee: { findFirst: jest.fn() },
    $transaction: jest.fn((operations) => Promise.all(operations)),
  };
  return {
    prisma,
    service: new AttendanceService(
      prisma as unknown as PrismaService,
      { getPolicy: jest.fn() } as never,
      {} as never,
      {} as never,
      { assertHistoryAllowed: jest.fn() } as never,
      undefined,
      { resolve: jest.fn().mockResolvedValue('America/New_York') } as never,
    ),
  };
}

describe('Attendance history query', () => {
  it('uses the inclusive monthly range and tenant scope', async () => {
    const { prisma, service } = createService();
    prisma.attendance.findMany.mockResolvedValue([]);
    prisma.attendance.count.mockResolvedValue(0);

    await service.getAttendanceHistory(
      { month: '2026-07', page: 1, pageSize: 25 },
      authentication(),
    );

    expect(prisma.attendance.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 0,
        take: 25,
        where: expect.objectContaining({
          organizationId: 'org-a',
          date: {
            gte: new Date('2026-07-01T00:00:00.000Z'),
            lt: new Date('2026-08-01T00:00:00.000Z'),
          },
        }),
      }),
    );
  });

  it('uses an inclusive custom range across month boundaries', async () => {
    const { prisma, service } = createService();
    prisma.attendance.findMany.mockResolvedValue([]);
    prisma.attendance.count.mockResolvedValue(0);

    await service.getAttendanceHistory(
      { startDate: '2026-06-15', endDate: '2026-07-15', page: 2, pageSize: 10 },
      authentication(),
    );

    expect(prisma.attendance.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 10,
        take: 10,
        where: expect.objectContaining({
          date: {
            gte: new Date('2026-06-15T00:00:00.000Z'),
            lt: new Date('2026-07-16T00:00:00.000Z'),
          },
        }),
      }),
    );
  });

  it('rejects a forged cross-tenant employee filter', async () => {
    const { prisma, service } = createService();
    prisma.employee.findFirst.mockResolvedValue(null);
    await expect(
      service.getAttendanceHistory(
        { employeeId: '11111111-1111-4111-8111-111111111111' },
        authentication(),
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.attendance.findMany).not.toHaveBeenCalled();
  });

  it('rejects an invalid custom range before querying', async () => {
    const { prisma, service } = createService();
    await expect(
      service.getAttendanceHistory(
        { startDate: '2026-07-15', endDate: '2026-06-15' },
        authentication(),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.attendance.findMany).not.toHaveBeenCalled();
  });
});
