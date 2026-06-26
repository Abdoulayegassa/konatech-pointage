import { SanctionRuleConfig, SanctionRuleType } from './sanction-engine.types';

export const SANCTION_RULES: readonly SanctionRuleConfig[] = [
  {
    type: SanctionRuleType.MINOR_LATENESS,
    active: true,
    conditions: [
      {
        field: 'minutesLate',
        operator: 'gt',
        value: 0,
      },
      {
        field: 'minutesLate',
        operator: 'lt',
        value: 15,
      },
    ],
    monthlyTolerance: 1,
    amount: 2_000,
    priority: 10,
    reason:
      'Minor lateness: first occurrence in the month is tolerated; subsequent occurrences are sanctioned.',
    toleratedReason: 'First minor lateness in the month is tolerated.',
  },
  {
    type: SanctionRuleType.MAJOR_LATENESS,
    active: true,
    conditions: [
      {
        field: 'minutesLate',
        operator: 'gte',
        value: 15,
      },
    ],
    monthlyTolerance: 0,
    amount: 5_000,
    priority: 20,
    reason: 'Major lateness: lateness of 15 minutes or more has no tolerance.',
    toleratedReason: null,
  },
  {
    type: SanctionRuleType.EARLY_DEPARTURE,
    active: false,
    conditions: [],
    monthlyTolerance: 0,
    amount: 0,
    reason: 'Prepared for future configuration; inactive in V1.',
  },
  {
    type: SanctionRuleType.UNJUSTIFIED_ABSENCE,
    active: false,
    conditions: [],
    monthlyTolerance: 0,
    amount: 0,
    reason: 'Prepared for future configuration; inactive in V1.',
  },
  {
    type: SanctionRuleType.JUSTIFIED_ABSENCE,
    active: false,
    conditions: [],
    monthlyTolerance: 0,
    amount: 0,
    reason: 'Prepared for future configuration; inactive in V1.',
  },
  {
    type: SanctionRuleType.LEAVE,
    active: false,
    conditions: [],
    monthlyTolerance: 0,
    amount: 0,
    reason: 'Prepared for future configuration; inactive in V1.',
  },
  {
    type: SanctionRuleType.EXTERNAL_MISSION,
    active: false,
    conditions: [],
    monthlyTolerance: 0,
    amount: 0,
    reason: 'Prepared for future configuration; inactive in V1.',
  },
];
