import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { SanctionRuleType as PrismaSanctionRuleType } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  formatAttendanceMonth,
  getAttendanceMonthRange,
  getAttendanceMonthRangeFromDate,
} from '../../common/utils/attendance-date.util';
import { SANCTION_RULES } from './sanction-rules.config';
import {
  SanctionAttendanceInput,
  SanctionCondition,
  SanctionResult,
  SanctionRuleConfig,
  SanctionRuleType,
  SanctionStatus,
} from './sanction-engine.types';
import { UpdateSanctionRuleDto } from './dto/update-sanction-rule.dto';

type DbSanctionRuleRecord = {
  id: string;
  type: SanctionRuleType;
  name: string;
  description: string | null;
  active: boolean;
  latenessMinMinutes: number | null;
  latenessMinInclusive: boolean;
  latenessMaxMinutes: number | null;
  latenessMaxInclusive: boolean;
  monthlyTolerance: number;
  amountFcfa: number;
  priority: number;
  appliedReason: string;
  toleratedReason: string | null;
  createdAt?: Date;
};

@Injectable()
/**
 * SOURCE OF TRUTH
 * Sanctions engine.
 *
 * Sanction rules and monthly sanction results are computed here. UI and report
 * layers must display these results without reimplementing disciplinary logic.
 */
export class SanctionsService {
  constructor(private readonly prisma: PrismaService) {}

  async getRules() {
    const databaseRules = await this.getDatabaseRules();

    return databaseRules.length > 0 ? databaseRules : SANCTION_RULES;
  }

  async updateRule(id: string, payload: UpdateSanctionRuleDto) {
    const existingRule = (await this.prisma.sanctionRule.findUnique({
      where: {
        id,
      },
      select: this.getSanctionRuleSelect(),
    })) as DbSanctionRuleRecord | null;

    if (!existingRule) {
      throw new NotFoundException('Sanction rule not found.');
    }

    const nextRule = {
      ...existingRule,
      ...payload,
    };

    this.assertValidRuleThresholds(nextRule);

    if (nextRule.active && this.isLatenessRule(nextRule.type)) {
      await this.assertNoOverlappingActiveLatenessRanges(id, nextRule);
    }

    const updatedRule = (await this.prisma.sanctionRule.update({
      where: {
        id,
      },
      data: {
        ...(payload.active !== undefined ? { active: payload.active } : {}),
        ...(payload.name !== undefined ? { name: payload.name.trim() } : {}),
        ...(payload.description !== undefined
          ? { description: payload.description?.trim() || null }
          : {}),
        ...(payload.latenessMinMinutes !== undefined
          ? { latenessMinMinutes: payload.latenessMinMinutes }
          : {}),
        ...(payload.latenessMaxMinutes !== undefined
          ? { latenessMaxMinutes: payload.latenessMaxMinutes }
          : {}),
        ...(payload.monthlyTolerance !== undefined
          ? { monthlyTolerance: payload.monthlyTolerance }
          : {}),
        ...(payload.amountFcfa !== undefined
          ? { amountFcfa: payload.amountFcfa }
          : {}),
        ...(payload.priority !== undefined ? { priority: payload.priority } : {}),
      },
      select: this.getSanctionRuleSelect(),
    })) as DbSanctionRuleRecord;

    return this.toRuleConfig(updatedRule);
  }

  async getAttendanceSanction(attendanceId: string) {
    const rules = await this.getActiveRules();
    const attendance = await this.prisma.attendance.findUnique({
      where: {
        id: attendanceId,
      },
      select: {
        id: true,
        employeeId: true,
        date: true,
        minutesLate: true,
      },
    });

    if (!attendance) {
      throw new NotFoundException('Attendance record not found.');
    }

    const sanctionInput = {
      employeeId: attendance.employeeId,
      attendanceId: attendance.id,
      date: attendance.date,
      minutesLate: attendance.minutesLate,
    };
    const rule = this.findMatchingRule(rules, sanctionInput);
    const previousRuleMatchCount = rule
      ? await this.countPreviousMonthlyRuleMatches({
          employeeId: attendance.employeeId,
          date: attendance.date,
          rule,
        })
      : 0;

    return this.calculateForAttendance(
      sanctionInput,
      previousRuleMatchCount,
      rules,
    );
  }

  async getMonthlySanctions(month?: string, employeeId?: string) {
    const { start, end } = this.getMonthRange(month);
    return this.getSanctionsForDateRange(start, end, employeeId);
  }

  async getSanctionsForDateRange(
    start: Date,
    end: Date,
    employeeId?: string,
  ) {
    const rules = await this.getActiveRules();
    const attendances = await this.prisma.attendance.findMany({
      where: {
        date: {
          gte: start,
          lt: end,
        },
        ...(employeeId
          ? {
              employeeId,
            }
          : {}),
      },
      select: {
        id: true,
        employeeId: true,
        date: true,
        minutesLate: true,
        employee: {
          select: {
            employeeIdentifier: true,
            firstName: true,
            lastName: true,
            department: true,
          },
        },
      },
      orderBy: [{ employeeId: 'asc' }, { date: 'asc' }, { createdAt: 'asc' }],
    });
    const ruleMatchCounts = new Map<string, number>();

    return attendances.map((attendance) => {
      const sanctionInput = {
        employeeId: attendance.employeeId,
        attendanceId: attendance.id,
        date: attendance.date,
        minutesLate: attendance.minutesLate,
      };
      const rule = this.findMatchingRule(rules, sanctionInput);
      const ruleCountKey = rule
        ? this.buildRuleCountKey(attendance.employeeId, rule)
        : null;
      const previousRuleMatchCount = ruleCountKey
        ? (ruleMatchCounts.get(ruleCountKey) ?? 0)
        : 0;
      const result = this.calculateForAttendance(
        sanctionInput,
        previousRuleMatchCount,
        rules,
      );
      const enrichedResult: SanctionResult = {
        ...result,
        employeeIdentifier: attendance.employee.employeeIdentifier,
        employeeName: `${attendance.employee.firstName} ${attendance.employee.lastName}`,
        department: attendance.employee.department,
      };

      if (rule && ruleCountKey) {
        ruleMatchCounts.set(ruleCountKey, previousRuleMatchCount + 1);
      }

      return enrichedResult;
    });
  }

  calculateForAttendance(
    attendance: SanctionAttendanceInput,
    previousMonthlyRuleMatchCount: number,
    rules: readonly SanctionRuleConfig[] = SANCTION_RULES,
  ): SanctionResult {
    const rule = this.findMatchingRule(rules, attendance);

    if (!rule) {
      return {
        employeeId: attendance.employeeId,
        attendanceId: attendance.attendanceId,
        date: attendance.date,
        ruleType: null,
        reason: 'No active sanction rule applies to this attendance record.',
        amount: 0,
        status: SanctionStatus.NOT_APPLICABLE,
      };
    }

    if (previousMonthlyRuleMatchCount < rule.monthlyTolerance) {
      return {
        employeeId: attendance.employeeId,
        attendanceId: attendance.attendanceId,
        date: attendance.date,
        ruleType: rule.type,
        reason:
          rule.toleratedReason ??
          'This occurrence is tolerated by the monthly sanction rule.',
        amount: 0,
        status: SanctionStatus.TOLERATED,
      };
    }

    return {
      employeeId: attendance.employeeId,
      attendanceId: attendance.attendanceId,
      date: attendance.date,
      ruleType: rule.type,
      reason: rule.reason,
      amount: rule.amount,
      status: SanctionStatus.APPLIED,
    };
  }

  private async getActiveRules() {
    const databaseRules = await this.getActiveDatabaseRules();

    return databaseRules.length > 0 ? databaseRules : SANCTION_RULES;
  }

  private async getDatabaseRules(): Promise<SanctionRuleConfig[]> {
    const records = (await this.prisma.sanctionRule.findMany({
      orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
      select: this.getSanctionRuleSelect(),
    })) as DbSanctionRuleRecord[];

    return records.flatMap((record) => {
      const rule = this.toRuleConfig(record);

      return rule ? [rule] : [];
    });
  }

  private async getActiveDatabaseRules(): Promise<SanctionRuleConfig[]> {
    const records = (await this.prisma.sanctionRule.findMany({
      where: {
        active: true,
      },
      orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
      select: this.getSanctionRuleSelect(),
    })) as DbSanctionRuleRecord[];

    return records.flatMap((record) => {
      const rule = this.toRuleConfig(record);

      return rule ? [rule] : [];
    });
  }

  private getSanctionRuleSelect() {
    return {
      id: true,
      type: true,
      name: true,
      description: true,
      active: true,
      latenessMinMinutes: true,
      latenessMinInclusive: true,
      latenessMaxMinutes: true,
      latenessMaxInclusive: true,
      monthlyTolerance: true,
      amountFcfa: true,
      priority: true,
      appliedReason: true,
      toleratedReason: true,
      createdAt: true,
    };
  }

  private assertValidRuleThresholds(rule: DbSanctionRuleRecord) {
    if (!rule.name.trim()) {
      throw new BadRequestException('Rule name is required.');
    }

    if (
      rule.latenessMinMinutes !== null &&
      rule.latenessMaxMinutes !== null &&
      rule.latenessMinMinutes >= rule.latenessMaxMinutes
    ) {
      throw new BadRequestException(
        'latenessMinMinutes must be lower than latenessMaxMinutes.',
      );
    }

    if (rule.monthlyTolerance < 0) {
      throw new BadRequestException('monthlyTolerance must be greater than or equal to 0.');
    }

    if (rule.amountFcfa < 0) {
      throw new BadRequestException('amountFcfa must be greater than or equal to 0.');
    }

    if (rule.priority < 0) {
      throw new BadRequestException('priority must be greater than or equal to 0.');
    }
  }

  private async assertNoOverlappingActiveLatenessRanges(
    id: string,
    nextRule: DbSanctionRuleRecord,
  ) {
    const activeRules = (await this.prisma.sanctionRule.findMany({
      where: {
        active: true,
        type: {
          in: [
            PrismaSanctionRuleType.MINOR_LATENESS,
            PrismaSanctionRuleType.MAJOR_LATENESS,
          ],
        },
        NOT: {
          id,
        },
      },
      select: this.getSanctionRuleSelect(),
    })) as DbSanctionRuleRecord[];

    const hasOverlap = activeRules.some((rule) =>
      this.rangesOverlap(nextRule, rule),
    );

    if (hasOverlap) {
      throw new BadRequestException('Les plages de sanctions se chevauchent.');
    }
  }

  private rangesOverlap(
    left: Pick<
      DbSanctionRuleRecord,
      | 'latenessMinMinutes'
      | 'latenessMinInclusive'
      | 'latenessMaxMinutes'
      | 'latenessMaxInclusive'
    >,
    right: Pick<
      DbSanctionRuleRecord,
      | 'latenessMinMinutes'
      | 'latenessMinInclusive'
      | 'latenessMaxMinutes'
      | 'latenessMaxInclusive'
    >,
  ) {
    return (
      this.lowerIsBeforeOrEqualUpper(
        left.latenessMinMinutes,
        left.latenessMinInclusive,
        right.latenessMaxMinutes,
        right.latenessMaxInclusive,
      ) &&
      this.lowerIsBeforeOrEqualUpper(
        right.latenessMinMinutes,
        right.latenessMinInclusive,
        left.latenessMaxMinutes,
        left.latenessMaxInclusive,
      )
    );
  }

  private lowerIsBeforeOrEqualUpper(
    lower: number | null,
    lowerInclusive: boolean,
    upper: number | null,
    upperInclusive: boolean,
  ) {
    if (lower === null || upper === null) {
      return true;
    }

    if (lower < upper) {
      return true;
    }

    if (lower > upper) {
      return false;
    }

    return lowerInclusive && upperInclusive;
  }

  private toRuleConfig(
    record: DbSanctionRuleRecord,
  ): SanctionRuleConfig | null {
    if (!this.isLatenessRule(record.type)) {
      return null;
    }

    const conditions: SanctionCondition[] = [];

    if (record.latenessMinMinutes !== null) {
      conditions.push({
        field: 'minutesLate',
        operator: record.latenessMinInclusive ? 'gte' : 'gt',
        value: record.latenessMinMinutes,
      });
    }

    if (record.latenessMaxMinutes !== null) {
      conditions.push({
        field: 'minutesLate',
        operator: record.latenessMaxInclusive ? 'lte' : 'lt',
        value: record.latenessMaxMinutes,
      });
    }

    if (conditions.length === 0) {
      return null;
    }

    return {
      id: record.id,
      type: record.type,
      name: record.name,
      description: record.description,
      active: record.active,
      conditions,
      latenessMinMinutes: record.latenessMinMinutes,
      latenessMinInclusive: record.latenessMinInclusive,
      latenessMaxMinutes: record.latenessMaxMinutes,
      latenessMaxInclusive: record.latenessMaxInclusive,
      monthlyTolerance: record.monthlyTolerance,
      amount: record.amountFcfa,
      reason: record.appliedReason,
      toleratedReason: record.toleratedReason,
      priority: record.priority,
    };
  }

  private isLatenessRule(type: SanctionRuleType) {
    return (
      type === SanctionRuleType.MINOR_LATENESS ||
      type === SanctionRuleType.MAJOR_LATENESS
    );
  }

  private findMatchingRule(
    rules: readonly SanctionRuleConfig[],
    attendance: SanctionAttendanceInput,
  ) {
    return rules.find(
      (candidate) =>
        candidate.active && this.matchesRule(candidate, attendance),
    );
  }

  private matchesRule(
    rule: SanctionRuleConfig,
    attendance: SanctionAttendanceInput,
  ) {
    return rule.conditions.every((condition) =>
      this.matchesCondition(condition, attendance),
    );
  }

  private matchesCondition(
    condition: SanctionCondition,
    attendance: SanctionAttendanceInput,
  ) {
    const actualValue = attendance[condition.field];

    if (condition.operator === 'gt') {
      return actualValue > condition.value;
    }

    if (condition.operator === 'gte') {
      return actualValue >= condition.value;
    }

    if (condition.operator === 'lte') {
      return actualValue <= condition.value;
    }

    return actualValue < condition.value;
  }

  private async countPreviousMonthlyRuleMatches(input: {
    employeeId: string;
    date: Date;
    rule: SanctionRuleConfig;
  }) {
    const { start, end } = getAttendanceMonthRangeFromDate(input.date);
    const attendances = await this.prisma.attendance.findMany({
      where: {
        employeeId: input.employeeId,
        AND: [
          {
            date: {
              gte: start,
              lt: end,
            },
          },
          {
            date: {
              lt: input.date,
            },
          },
        ],
      },
      select: {
        minutesLate: true,
      },
    });

    return attendances.filter((attendance) =>
      this.matchesRule(input.rule, {
        employeeId: input.employeeId,
        attendanceId: '',
        date: input.date,
        minutesLate: attendance.minutesLate,
      }),
    ).length;
  }

  private buildRuleCountKey(employeeId: string, rule: SanctionRuleConfig) {
    return `${employeeId}:${rule.type}:${JSON.stringify(rule.conditions)}`;
  }

  private getMonthRange(month?: string) {
    const resolvedMonth = month ?? formatAttendanceMonth(new Date());

    if (!/^\d{4}-\d{2}$/.test(resolvedMonth)) {
      throw new BadRequestException('month must be in YYYY-MM format.');
    }

    const [year, monthIndex] = resolvedMonth.split('-').map(Number);
    const { startOfMonth: start, endOfMonth: end } = getAttendanceMonthRange(
      year,
      monthIndex,
    );

    return {
      start,
      end,
    };
  }
}
