import { NotFoundException, BadRequestException } from '@nestjs/common';
import { MembershipRole } from '@prisma/client';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { SchedulesService } from '../src/modules/schedules/schedules.service';
import { AuthenticationContext } from '../src/modules/auth/interfaces/authentication-context.interface';

const context = (organizationId: string | null = 'org-a'): AuthenticationContext => ({
  generation: 'saas',
  purpose: 'account',
  userId: 'user-a',
  membershipId: 'membership-a',
  organizationId,
  membershipRole: MembershipRole.ADMIN,
  employeeId: null,
  attendanceSiteId: null,
});

const schedule = (organizationId = 'org-a') => ({
  id: 'schedule-a', name: 'Morning', startTime: '08:00', endTime: '17:00',
  latenessMarginMinutes: 10, isActive: true, workDays: ['MONDAY'],
  organizationId, employees: [], createdAt: new Date(), updatedAt: new Date(),
});

function createService() {
  const prisma = {
    schedule: {
      findMany: jest.fn(), findFirst: jest.fn(), findUnique: jest.fn(),
      create: jest.fn(), update: jest.fn(),
    },
  };
  return { prisma, service: new SchedulesService(prisma as unknown as PrismaService) };
}

describe('Schedule tenant isolation', () => {
  it('scopes listings to the authenticated organization', async () => {
    const { prisma, service } = createService();
    prisma.schedule.findMany.mockResolvedValue([]);
    await service.findAll(context('org-a'));
    expect(prisma.schedule.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { organizationId: 'org-a' } }),
    );
  });

  it('does not retrieve or update another organization schedule', async () => {
    const { prisma, service } = createService();
    prisma.schedule.findFirst.mockResolvedValue(null);
    await expect(service.findOne('schedule-b', context('org-a'))).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.updateStatus('schedule-b', { isActive: false }, context('org-a'))).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.schedule.update).not.toHaveBeenCalled();
  });

  it('rejects SaaS requests without a valid organization context', async () => {
    const { prisma, service } = createService();
    expect(() => service.findAll(context(null))).toThrow(BadRequestException);
    expect(prisma.schedule.findMany).not.toHaveBeenCalled();
  });

  it('derives organization ownership from context when creating', async () => {
    const { prisma, service } = createService();
    prisma.schedule.create.mockResolvedValue(schedule('org-a'));
    await service.create({
      name: 'Morning', startTime: '08:00', endTime: '17:00', workDays: ['MONDAY'],
    }, context('org-a'));
    expect(prisma.schedule.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ organizationId: 'org-a' }),
    }));
  });
});
