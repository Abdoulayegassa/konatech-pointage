import {
  SanctionRuleType,
  SanctionStatus,
} from '../src/modules/sanctions/sanction-engine.types';
import { SANCTION_RULES } from '../src/modules/sanctions/sanction-rules.config';
import { SanctionsService } from '../src/modules/sanctions/sanctions.service';

type MockPrisma = {
  sanctionRule: {
    findMany: jest.Mock;
    findUnique: jest.Mock;
    update: jest.Mock;
  };
  attendance: {
    findMany: jest.Mock;
    findUnique: jest.Mock;
  };
};

const defaultDbRules = [
  {
    id: '6cb80c4d-b5d5-4e17-a74d-3f47b65a0001',
    type: SanctionRuleType.MINOR_LATENESS,
    name: 'Retard mineur',
    description: null,
    active: true,
    latenessMinMinutes: 0,
    latenessMinInclusive: false,
    latenessMaxMinutes: 15,
    latenessMaxInclusive: false,
    monthlyTolerance: 1,
    amountFcfa: 2_000,
    priority: 10,
    appliedReason: 'Tolérance mensuelle déjà utilisée.',
    toleratedReason: 'Premier retard mineur du mois : tolérance accordée.',
  },
  {
    id: '0cf3b2be-fc1d-4b3d-8b8b-3f47b65a0002',
    type: SanctionRuleType.MAJOR_LATENESS,
    name: 'Retard majeur',
    description: null,
    active: true,
    latenessMinMinutes: 15,
    latenessMinInclusive: true,
    latenessMaxMinutes: null,
    latenessMaxInclusive: false,
    monthlyTolerance: 0,
    amountFcfa: 5_000,
    priority: 20,
    appliedReason:
      'Retard majeur (15 min ou plus) : sanction appliquée sans tolérance.',
    toleratedReason: null,
  },
];

describe('SanctionsService', () => {
  function createService() {
    const prisma: MockPrisma = {
      sanctionRule: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      attendance: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
      },
    };

    return {
      prisma,
      service: new SanctionsService(prisma as never),
    };
  }

  function attendance(
    minutesLate: number,
    date: string,
    employeeId = 'employee-1',
  ) {
    return {
      id: `attendance-${employeeId}-${date}-${minutesLate}`,
      employeeId,
      date: new Date(date),
      minutesLate,
      employee: {
        employeeIdentifier: 'EMP-2026-001',
        firstName: 'Awa',
        lastName: 'Traore',
        department: 'Operations',
      },
    };
  }

  it('keeps hardcoded V1 rules available as fallback configuration', () => {
    expect(SANCTION_RULES).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: SanctionRuleType.MINOR_LATENESS,
          active: true,
          monthlyTolerance: 1,
          amount: 2_000,
        }),
        expect.objectContaining({
          type: SanctionRuleType.MAJOR_LATENESS,
          active: true,
          monthlyTolerance: 0,
          amount: 5_000,
        }),
      ]),
    );
  });

  it('default DB rules reproduce current V1 monthly behavior', async () => {
    const { prisma, service } = createService();
    prisma.sanctionRule.findMany.mockResolvedValue(defaultDbRules);
    prisma.attendance.findMany.mockResolvedValue([
      attendance(8, '2026-04-10T00:00:00.000Z'),
      attendance(10, '2026-04-11T00:00:00.000Z'),
      attendance(15, '2026-04-12T00:00:00.000Z'),
    ]);

    const results = await service.getMonthlySanctions('2026-04');

    expect(results).toEqual([
      expect.objectContaining({
        ruleType: SanctionRuleType.MINOR_LATENESS,
        status: SanctionStatus.TOLERATED,
        amount: 0,
      }),
      expect.objectContaining({
        ruleType: SanctionRuleType.MINOR_LATENESS,
        status: SanctionStatus.APPLIED,
        amount: 2_000,
      }),
      expect.objectContaining({
        ruleType: SanctionRuleType.MAJOR_LATENESS,
        status: SanctionStatus.APPLIED,
        amount: 5_000,
      }),
    ]);
  });

  it('empty DB rules fallback to V1 defaults', async () => {
    const { prisma, service } = createService();
    prisma.sanctionRule.findMany.mockResolvedValue([]);
    prisma.attendance.findMany.mockResolvedValue([
      attendance(15, '2026-04-10T00:00:00.000Z'),
    ]);

    const [result] = await service.getMonthlySanctions('2026-04');

    expect(result).toEqual(
      expect.objectContaining({
        ruleType: SanctionRuleType.MAJOR_LATENESS,
        status: SanctionStatus.APPLIED,
        amount: 5_000,
      }),
    );
  });

  it('minor lateness first occurrence is tolerated', () => {
    const { service } = createService();

    expect(
      service.calculateForAttendance(
        {
          employeeId: 'employee-1',
          attendanceId: 'attendance-1',
          date: new Date('2026-04-10T00:00:00.000Z'),
          minutesLate: 8,
        },
        0,
      ),
    ).toEqual(
      expect.objectContaining({
        ruleType: SanctionRuleType.MINOR_LATENESS,
        status: SanctionStatus.TOLERATED,
        amount: 0,
      }),
    );
  });

  it('minor lateness second occurrence applies 2,000 FCFA', () => {
    const { service } = createService();

    expect(
      service.calculateForAttendance(
        {
          employeeId: 'employee-1',
          attendanceId: 'attendance-2',
          date: new Date('2026-04-11T00:00:00.000Z'),
          minutesLate: 10,
        },
        1,
      ),
    ).toEqual(
      expect.objectContaining({
        ruleType: SanctionRuleType.MINOR_LATENESS,
        status: SanctionStatus.APPLIED,
        amount: 2_000,
      }),
    );
  });

  it('major lateness applies 5,000 FCFA', () => {
    const { service } = createService();

    expect(
      service.calculateForAttendance(
        {
          employeeId: 'employee-1',
          attendanceId: 'attendance-3',
          date: new Date('2026-04-12T00:00:00.000Z'),
          minutesLate: 15,
        },
        0,
      ),
    ).toEqual(
      expect.objectContaining({
        ruleType: SanctionRuleType.MAJOR_LATENESS,
        status: SanctionStatus.APPLIED,
        amount: 5_000,
      }),
    );
  });

  it('custom minor threshold counts previous attendances matching the same rule', async () => {
    const { prisma, service } = createService();
    prisma.sanctionRule.findMany.mockResolvedValue([
      {
        ...defaultDbRules[0],
        latenessMaxMinutes: 20,
        amountFcfa: 3_000,
      },
      {
        ...defaultDbRules[1],
        latenessMinMinutes: 20,
        amountFcfa: 7_000,
      },
    ]);
    prisma.attendance.findMany.mockResolvedValue([
      attendance(16, '2026-04-10T00:00:00.000Z'),
      attendance(16, '2026-04-11T00:00:00.000Z'),
    ]);

    const results = await service.getMonthlySanctions('2026-04');

    expect(results).toEqual([
      expect.objectContaining({
        ruleType: SanctionRuleType.MINOR_LATENESS,
        status: SanctionStatus.TOLERATED,
        amount: 0,
      }),
      expect.objectContaining({
        ruleType: SanctionRuleType.MINOR_LATENESS,
        status: SanctionStatus.APPLIED,
        amount: 3_000,
      }),
    ]);
  });

  it('custom major threshold works if DB rule changes', async () => {
    const { prisma, service } = createService();
    prisma.sanctionRule.findMany.mockResolvedValue([
      {
        ...defaultDbRules[0],
        latenessMaxMinutes: 20,
      },
      {
        ...defaultDbRules[1],
        latenessMinMinutes: 20,
        amountFcfa: 7_000,
      },
    ]);
    prisma.attendance.findMany.mockResolvedValue([
      attendance(20, '2026-04-10T00:00:00.000Z'),
    ]);

    const [result] = await service.getMonthlySanctions('2026-04');

    expect(result).toEqual(
      expect.objectContaining({
        ruleType: SanctionRuleType.MAJOR_LATENESS,
        status: SanctionStatus.APPLIED,
        amount: 7_000,
      }),
    );
  });

  it('inactive rule is ignored', async () => {
    const { prisma, service } = createService();
    prisma.sanctionRule.findMany.mockResolvedValue([
      defaultDbRules[0],
      {
        ...defaultDbRules[1],
        active: false,
      },
    ]);
    prisma.attendance.findMany.mockResolvedValue([
      attendance(30, '2026-04-10T00:00:00.000Z'),
    ]);

    const [result] = await service.getMonthlySanctions('2026-04');

    expect(result).toEqual(
      expect.objectContaining({
        ruleType: null,
        status: SanctionStatus.NOT_APPLICABLE,
        amount: 0,
      }),
    );
  });

  it('monthly endpoint totals remain correct', async () => {
    const { prisma, service } = createService();
    prisma.sanctionRule.findMany.mockResolvedValue(defaultDbRules);
    prisma.attendance.findMany.mockResolvedValue([
      attendance(4, '2026-04-10T00:00:00.000Z'),
      attendance(6, '2026-04-11T00:00:00.000Z'),
      attendance(25, '2026-04-12T00:00:00.000Z'),
      attendance(0, '2026-04-13T00:00:00.000Z'),
    ]);

    const results = await service.getMonthlySanctions('2026-04');

    expect(results).toHaveLength(4);
    expect(
      results
        .filter((result) => result.status === SanctionStatus.APPLIED)
        .reduce((total, result) => total + result.amount, 0),
    ).toBe(7_000);
  });

  it('attendance endpoint shape remains unchanged', async () => {
    const { prisma, service } = createService();
    const currentAttendance = attendance(
      10,
      '2026-04-11T00:00:00.000Z',
    );
    prisma.sanctionRule.findMany.mockResolvedValue(defaultDbRules);
    prisma.attendance.findUnique.mockResolvedValue({
      id: currentAttendance.id,
      employeeId: currentAttendance.employeeId,
      date: currentAttendance.date,
      minutesLate: currentAttendance.minutesLate,
    });
    prisma.attendance.findMany.mockResolvedValue([
      {
        minutesLate: 8,
      },
    ]);

    const result = await service.getAttendanceSanction(currentAttendance.id);

    expect(Object.keys(result).sort()).toEqual(
      [
        'amount',
        'attendanceId',
        'date',
        'employeeId',
        'reason',
        'ruleType',
        'status',
      ].sort(),
    );
    expect(result).toEqual(
      expect.objectContaining({
        employeeId: currentAttendance.employeeId,
        attendanceId: currentAttendance.id,
        ruleType: SanctionRuleType.MINOR_LATENESS,
        status: SanctionStatus.APPLIED,
        amount: 2_000,
      }),
    );
  });

  it('updates a sanction rule amount', async () => {
    const { prisma, service } = createService();
    prisma.sanctionRule.findUnique.mockResolvedValue(defaultDbRules[0]);
    prisma.sanctionRule.findMany.mockResolvedValue([defaultDbRules[1]]);
    prisma.sanctionRule.update.mockResolvedValue({
      ...defaultDbRules[0],
      amountFcfa: 3_000,
    });

    const result = await service.updateRule(defaultDbRules[0].id, {
      amountFcfa: 3_000,
    });

    expect(prisma.sanctionRule.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          amountFcfa: 3_000,
        }),
      }),
    );
    expect(result).toEqual(
      expect.objectContaining({
        amount: 3_000,
      }),
    );
  });

  it('updates a sanction rule monthly tolerance', async () => {
    const { prisma, service } = createService();
    prisma.sanctionRule.findUnique.mockResolvedValue(defaultDbRules[0]);
    prisma.sanctionRule.findMany.mockResolvedValue([defaultDbRules[1]]);
    prisma.sanctionRule.update.mockResolvedValue({
      ...defaultDbRules[0],
      monthlyTolerance: 2,
    });

    const result = await service.updateRule(defaultDbRules[0].id, {
      monthlyTolerance: 2,
    });

    expect(result).toEqual(
      expect.objectContaining({
        monthlyTolerance: 2,
      }),
    );
  });

  it('updates sanction rule thresholds', async () => {
    const { prisma, service } = createService();
    prisma.sanctionRule.findUnique.mockResolvedValue(defaultDbRules[0]);
    prisma.sanctionRule.findMany.mockResolvedValue([defaultDbRules[1]]);
    prisma.sanctionRule.update.mockResolvedValue({
      ...defaultDbRules[0],
      latenessMinMinutes: 1,
      latenessMaxMinutes: 14,
    });

    const result = await service.updateRule(defaultDbRules[0].id, {
      latenessMinMinutes: 1,
      latenessMaxMinutes: 14,
    });

    expect(result).toEqual(
      expect.objectContaining({
        conditions: expect.arrayContaining([
          expect.objectContaining({
            operator: 'gt',
            value: 1,
          }),
          expect.objectContaining({
            operator: 'lt',
            value: 14,
          }),
        ]),
      }),
    );
  });

  it('deactivates a sanction rule', async () => {
    const { prisma, service } = createService();
    prisma.sanctionRule.findUnique.mockResolvedValue(defaultDbRules[0]);
    prisma.sanctionRule.update.mockResolvedValue({
      ...defaultDbRules[0],
      active: false,
    });

    const result = await service.updateRule(defaultDbRules[0].id, {
      active: false,
    });

    expect(prisma.sanctionRule.findMany).not.toHaveBeenCalled();
    expect(result).toEqual(
      expect.objectContaining({
        active: false,
      }),
    );
  });

  it('rejects overlapping active sanction ranges', async () => {
    const { prisma, service } = createService();
    prisma.sanctionRule.findUnique.mockResolvedValue(defaultDbRules[0]);
    prisma.sanctionRule.findMany.mockResolvedValue([defaultDbRules[1]]);

    await expect(
      service.updateRule(defaultDbRules[0].id, {
        latenessMaxMinutes: 20,
      }),
    ).rejects.toThrow('Les plages de sanctions se chevauchent.');
    expect(prisma.sanctionRule.update).not.toHaveBeenCalled();
  });

  it('rejects invalid sanction thresholds', async () => {
    const { prisma, service } = createService();
    prisma.sanctionRule.findUnique.mockResolvedValue(defaultDbRules[0]);

    await expect(
      service.updateRule(defaultDbRules[0].id, {
        latenessMinMinutes: 15,
        latenessMaxMinutes: 15,
      }),
    ).rejects.toThrow(
      'latenessMinMinutes must be lower than latenessMaxMinutes.',
    );
    expect(prisma.sanctionRule.update).not.toHaveBeenCalled();
  });

  it('updates sanction rule priority', async () => {
    const { prisma, service } = createService();
    prisma.sanctionRule.findUnique.mockResolvedValue(defaultDbRules[0]);
    prisma.sanctionRule.findMany.mockResolvedValue([defaultDbRules[1]]);
    prisma.sanctionRule.update.mockResolvedValue({
      ...defaultDbRules[0],
      priority: 5,
    });

    const result = await service.updateRule(defaultDbRules[0].id, {
      priority: 5,
    });

    expect(result).toEqual(
      expect.objectContaining({
        priority: 5,
      }),
    );
  });
});
