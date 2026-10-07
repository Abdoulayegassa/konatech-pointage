import { NotFoundException } from '@nestjs/common';
import { AccessRole, MembershipRole, Prisma } from '@prisma/client';
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

const employeeRecord = (organizationId: string | null = 'org-a') => ({
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
    attendanceSite: { findFirst: jest.fn() },
    employeeSiteAssignment: { findMany: jest.fn().mockResolvedValue([]) },
    $transaction: jest.fn(),
  };
  return {
    prisma,
    service: new EmployeesService(
      prisma as unknown as PrismaService,
      {
        assertMayIncrease: jest.fn(),
      } as never,
    ),
  };
}

describe('Employee tenant isolation', () => {
  it('uses an explicit Legacy namespace for list and ID lookup', async () => {
    const { prisma, service } = createService();
    prisma.employee.findMany.mockResolvedValue([]);
    prisma.employee.findFirst.mockResolvedValue(null);

    await service.findAll(legacyContext);
    await expect(
      service.findOne('saas-employee', legacyContext),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(prisma.employee.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organizationId: null, userId: null },
      }),
    );
    expect(prisma.employee.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'saas-employee',
          organizationId: null,
          userId: null,
        },
      }),
    );
  });

  it('scopes listing to the authenticated organization', async () => {
    const { prisma, service } = createService();
    prisma.employee.findMany.mockResolvedValue([]);

    await service.findAll(accountContext('org-a'));

    expect(prisma.employee.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { organizationId: 'org-a', v1ScopeStatus: 'OPERATIONAL' } }),
    );
  });

  it('does not retrieve an employee from another organization', async () => {
    const { prisma, service } = createService();
    prisma.employee.findFirst.mockResolvedValue(null);

    await expect(
      service.findOne('employee-b', accountContext('org-a')),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.employee.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'employee-b', organizationId: 'org-a', v1ScopeStatus: 'OPERATIONAL' },
      }),
    );
  });

  it('rejects cross-tenant updates and status changes', async () => {
    const { prisma, service } = createService();
    prisma.employee.findFirst.mockResolvedValue(null);

    await expect(
      service.updateStatus(
        'employee-b',
        { isActive: false },
        accountContext('org-a'),
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      service.update(
        'employee-b',
        { firstName: 'Changed' },
        accountContext('org-a'),
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.employee.update).not.toHaveBeenCalled();
  });

  it('derives organization ownership from context when creating', async () => {
    const { prisma, service } = createService();
    let createdData: Record<string, unknown> | undefined;
    const findIdentifiers = jest.fn().mockResolvedValue([]);
    prisma.employee.findMany.mockResolvedValue([]);
    prisma.$transaction.mockImplementation(
      async (callback: (tx: unknown) => unknown) =>
        callback({
          attendanceSite: { findFirst: jest.fn().mockResolvedValue({ id: 'site-a' }) },
          employee: {
            findMany: findIdentifiers,
            create: jest.fn().mockImplementation(({ data }) => {
              createdData = data;
              return Promise.resolve(employeeRecord(data.organizationId));
            }),
          },
          employeeSiteAssignment: {
            create: jest.fn().mockResolvedValue({ id: 'assignment-a' }),
          },
        }),
    );

    await service.create(
      {
        firstName: 'Awa',
        lastName: 'Traore',
        email: 'awa@example.com',
        siteId: 'site-a',
        role: 'Direction',
        accessRole: AccessRole.ADMIN,
        password: 'password123',
      },
      accountContext('org-a'),
    );

    expect(createdData?.organizationId).toBe('org-a');
    expect(createdData?.organizationId).not.toBe('org-b');
    expect(findIdentifiers).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ organizationId: 'org-a' }),
      }),
    );
  });

  it('keeps generated identifiers explicitly scoped to Legacy employees', async () => {
    const { prisma, service } = createService();
    const findIdentifiers = jest.fn().mockResolvedValue([]);
    prisma.$transaction.mockImplementation(
      async (callback: (tx: unknown) => unknown) =>
        callback({
          employee: {
            findMany: findIdentifiers,
            create: jest.fn().mockResolvedValue(employeeRecord(null)),
          },
        }),
    );

    await service.create({
      firstName: 'Legacy',
      lastName: 'Employee',
      email: 'legacy@example.com',
      role: 'Direction',
      accessRole: AccessRole.ADMIN,
      password: 'password123',
    });

    expect(findIdentifiers).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ organizationId: null }),
      }),
    );
  });

  it.each([
    [
      'email',
      'An employee with the same email already exists in this organization.',
    ],
    [
      'employeeCode',
      'An employee with the same code already exists in this organization.',
    ],
  ])(
    'maps a %s uniqueness conflict without exposing its constraint',
    async (field, message) => {
      const { prisma, service } = createService();
      prisma.$transaction.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('unique constraint', {
          code: 'P2002',
          clientVersion: 'test',
          meta: { target: ['organizationId', field] },
        }),
      );

      await expect(
        service.create(
          {
            firstName: 'Awa',
            lastName: 'Traore',
            email: 'awa@example.com',
            siteId: 'site-a',
            role: 'Direction',
            accessRole: AccessRole.ADMIN,
            password: 'password123',
          },
          accountContext('org-a'),
        ),
      ).rejects.toMatchObject({ message });
    },
  );

  it('does not misreport a transitional global email conflict as tenant-local', async () => {
    const { prisma, service } = createService();
    prisma.$transaction.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('unique constraint', {
        code: 'P2002',
        clientVersion: 'test',
        meta: { target: ['email'] },
      }),
    );

    await expect(
      service.create(
        {
          firstName: 'Awa',
          lastName: 'Traore',
          email: 'awa@example.com',
          siteId: 'site-a',
          role: 'Direction',
          accessRole: AccessRole.ADMIN,
          password: 'password123',
        },
        accountContext('org-a'),
      ),
    ).rejects.toMatchObject({
      message: 'This employee email is currently unavailable.',
    });
  });
});
