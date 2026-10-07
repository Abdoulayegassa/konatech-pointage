import { NotFoundException, BadRequestException } from '@nestjs/common';
import { MembershipRole, Prisma } from '@prisma/client';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { SchedulesService } from '../src/modules/schedules/schedules.service';
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

const schedule = (organizationId = 'org-a') => ({
  id: 'schedule-a',
  name: 'Morning',
  startTime: '08:00',
  endTime: '17:00',
  latenessMarginMinutes: 10,
  isActive: true,
  workDays: ['MONDAY'],
  siteId: 'site-a',
  organizationId,
  employees: [],
  createdAt: new Date(),
  updatedAt: new Date(),
});

function createService() {
  const prisma = {
    schedule: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    attendanceSite: {
      findFirst: jest.fn().mockResolvedValue({ id: 'site-a' }),
    },
  };
  return {
    prisma,
    service: new SchedulesService(prisma as unknown as PrismaService),
  };
}

describe('Schedule tenant isolation', () => {
  it('uses an explicit Legacy namespace for schedules and related employees', async () => {
    const { prisma, service } = createService();
    prisma.schedule.findMany.mockResolvedValue([]);
    prisma.schedule.findFirst.mockResolvedValue(null);

    await service.findAll(legacyContext);
    await expect(
      service.findOne('saas-schedule', legacyContext),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(prisma.schedule.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organizationId: null },
        select: expect.objectContaining({
          employees: expect.objectContaining({
            where: { organizationId: null, userId: null },
          }),
        }),
      }),
    );
    expect(prisma.schedule.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'saas-schedule', organizationId: null },
      }),
    );
  });

  it('scopes listings to the authenticated organization', async () => {
    const { prisma, service } = createService();
    prisma.schedule.findMany.mockResolvedValue([schedule('org-a')]);
    const schedules = await service.findAll(context('org-a'));
    expect(prisma.schedule.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ organizationId: 'org-a' }),
        select: expect.objectContaining({ siteId: true }),
      }),
    );
    expect(schedules).toMatchObject([
      { id: 'schedule-a', siteId: 'site-a', isActive: true },
    ]);
  });

  it('does not retrieve or update another organization schedule', async () => {
    const { prisma, service } = createService();
    prisma.schedule.findFirst.mockResolvedValue(null);
    await expect(
      service.findOne('schedule-b', context('org-a')),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      service.updateStatus('schedule-b', { isActive: false }, context('org-a')),
    ).rejects.toBeInstanceOf(NotFoundException);
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
    await service.create(
      {
        name: 'Morning',
        startTime: '08:00',
        endTime: '17:00',
        siteId: 'site-a',
        workDays: ['MONDAY'],
      },
      context('org-a'),
    );
    expect(prisma.schedule.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ organizationId: 'org-a' }),
      }),
    );
  });

  it('reports schedule-name conflicts within the current organization', async () => {
    const { prisma, service } = createService();
    prisma.schedule.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('unique constraint', {
        code: 'P2002',
        clientVersion: 'test',
        meta: { target: ['organizationId', 'name'] },
      }),
    );

    await expect(
      service.create(
        {
          name: 'Morning',
          startTime: '08:00',
          endTime: '17:00',
          siteId: 'site-a',
          workDays: ['MONDAY'],
        },
        context('org-a'),
      ),
    ).rejects.toMatchObject({
      message: 'Schedule name already exists in this organization.',
    });
  });

  it('does not misreport a transitional global name conflict as tenant-local', async () => {
    const { prisma, service } = createService();
    prisma.schedule.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('unique constraint', {
        code: 'P2002',
        clientVersion: 'test',
        meta: { target: ['name'] },
      }),
    );

    await expect(
      service.create(
        {
          name: 'Morning',
          startTime: '08:00',
          endTime: '17:00',
          siteId: 'site-a',
          workDays: ['MONDAY'],
        },
        context('org-a'),
      ),
    ).rejects.toMatchObject({
      message: 'This schedule name is currently unavailable.',
    });
  });
});
