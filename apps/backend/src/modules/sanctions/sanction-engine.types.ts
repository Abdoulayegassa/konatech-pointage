export enum SanctionRuleType {
  MINOR_LATENESS = 'MINOR_LATENESS',
  MAJOR_LATENESS = 'MAJOR_LATENESS',
  EARLY_DEPARTURE = 'EARLY_DEPARTURE',
  UNJUSTIFIED_ABSENCE = 'UNJUSTIFIED_ABSENCE',
  JUSTIFIED_ABSENCE = 'JUSTIFIED_ABSENCE',
  LEAVE = 'LEAVE',
  EXTERNAL_MISSION = 'EXTERNAL_MISSION',
}

export enum SanctionStatus {
  TOLERATED = 'TOLERATED',
  APPLIED = 'APPLIED',
  NOT_APPLICABLE = 'NOT_APPLICABLE',
}

export type SanctionCondition =
  | {
      field: 'minutesLate';
      operator: 'gt';
      value: number;
    }
  | {
      field: 'minutesLate';
      operator: 'gte';
      value: number;
    }
  | {
      field: 'minutesLate';
      operator: 'lt';
      value: number;
    }
  | {
      field: 'minutesLate';
      operator: 'lte';
      value: number;
    };

export type SanctionRuleConfig = {
  id?: string;
  type: SanctionRuleType;
  name?: string;
  description?: string | null;
  active: boolean;
  conditions: SanctionCondition[];
  latenessMinMinutes?: number | null;
  latenessMinInclusive?: boolean;
  latenessMaxMinutes?: number | null;
  latenessMaxInclusive?: boolean;
  monthlyTolerance: number;
  amount: number;
  reason: string;
  toleratedReason?: string | null;
  priority?: number;
};

export type SanctionAttendanceInput = {
  employeeId: string;
  attendanceId: string;
  date: Date;
  minutesLate: number;
};

export type SanctionResult = {
  employeeId: string;
  employeeIdentifier?: string | null;
  employeeName?: string | null;
  department?: string | null;
  attendanceId: string;
  date: Date;
  ruleType: SanctionRuleType | null;
  reason: string;
  amount: number;
  status: SanctionStatus;
};
