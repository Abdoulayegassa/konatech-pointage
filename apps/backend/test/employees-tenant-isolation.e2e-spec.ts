import { NotFoundException } from '@nestjs/common';
import { AccessRole, MembershipRole } from '@prisma/client';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { EmployeesService } from '../src/modules/employees/employees.service';
import { AuthenticationContext } from '../src/modules/auth/interfaces/authentication-context.interface';

const accountContext = (organizationId = 'org-a'): AuthenticationContext => ({
  generation: 'saas',
  purpose: 'account',
  userId: 'user-a',
  membershipId: 'membership-a',
  organizationId,
  membershipRole: MembershipRole.ADMIN,
  employeeId: null,
  attendanceSiteId: null,
});

const employeeRecord = (organizationId = 'org-a') => ({
  id: 'employee-a',
  employeeIdentifier: 'EMP-2026-001',
  employeeCode: null,
  firstName: 'Awa',
  lastName: 'Traore',
  email: 'awa@example.com',
  role: 'Direction',
  accessRole: AccessRole.ADMIN,
  department: null,
  isActive: true,
  scheduleId: null,
  organizationId,
  userId: null,
  pinCode: null,
  pinCodeHash: null,
  schedule: null,
  createdAt: new Date(),
  updatedAt: new Date(),
});

function createService() {
  const prisma = {
    employee: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      create: jest.fn(),
    },
    schedule: { findUnique: jest.fn() },
    $transaction: jest.fn(),
  };
  return {
    prisma,
    service: new EmployeesService(prisma as unknown as PrismaService),
  };
}

describe('Employee tenant isolation', () => {
  it('scopes listing to the authenticated organization', async () => {
    const { prisma, service } = createService();
    prisma.employee.findMany.mockResolvedValue([]);

    await service.findAll(accountContext('org-a'));

    expect(prisma.employee.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { organizationId: 'org-a' } }),
    );
  });

  it('does not retrieve an employee from another organization', async () => {
    const { prisma, service } = createService();
    prisma.employee.findFirst.mockResolvedValue(null);

    await expect(
      service.findOne('employee-b', accountContext('org-a')),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.employee.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'employee-b', organizationId: 'org-a' } }),
    );
  });

  it('rejects cross-tenant updates and status changes', async () => {
    const { prisma, service } = createService();
    prisma.employee.findFirst.mockResolvedValue(null);

    await expect(
      service.updateStatus('employee-b', { isActive: false }, accountContext('org-a')),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      service.update('employee-b', { firstName: 'Changed' }, accountContext('org-a')),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.employee.update).not.toHaveBeenCalled();
  });

  it('derives organization ownership from context when creating', async () => {
    const { prisma, service } = createService();
    let createdData: Record<string, unknown> | undefined;
    prisma.employee.findMany.mockResolvedValue([]);
    prisma.$transaction.mockImplementation(async (callback: (tx: unknown) => unknown) =>
      callback({
        employee: {
          findMany: jest.fn().mockResolvedValue([]),
          create: jest.fn().mockImplementation(({ data }) => {
            createdData = data;
            return Promise.resolve(employeeRecord(data.organizationId));
          }),
        },
      }),
    );

    await service.create(
      {
        firstName: 'Awa',
        lastName: 'Traore',
        email: 'awa@example.com',
        role: 'Direction',
        accessRole: AccessRole.ADMIN,
        password: 'password123',
      },
      accountContext('org-a'),
    );

    expect(createdData?.organizationId).toBe('org-a');
    expect(createdData?.organizationId).not.toBe('org-b');
  });
});
