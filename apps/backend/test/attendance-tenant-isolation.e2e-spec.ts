import { BadRequestException, NotFoundException } from '@nestjs/common';
import { MembershipRole } from '@prisma/client';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { AttendanceService } from '../src/modules/attendance/attendance.service';
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

function createService() {
  const prisma = {
    attendance: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      updateMany: jest.fn(),
      create: jest.fn(),
    },
    employee: { findFirst: jest.fn(), findUnique: jest.fn() },
  };
  const security = {
    getPolicy: jest.fn(() => ({})),
    evaluateCheckIn: jest.fn(),
    evaluateCheckOut: jest.fn(),
  };
  const calendar = {
    isNonWorkingDay: jest.fn().mockResolvedValue(false),
    getNonWorkingDateKeys: jest.fn().mockResolvedValue(new Set()),
  };
  return {
    prisma,
    service: new AttendanceService(
      prisma as unknown as PrismaService,
      security as never,
      calendar as never,
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
});
