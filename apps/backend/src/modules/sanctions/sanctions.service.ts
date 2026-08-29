import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  SanctionRuleType as PrismaSanctionRuleType,
} from '@prisma/client';
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
import { CreateSanctionRuleDto } from './dto/create-sanction-rule.dto';
import { AuthenticationContext } from '../auth/interfaces/authentication-context.interface';

type DbSanctionRuleRecord = {
  id: string;
  code: string | null;
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

  async getRules(authentication?: AuthenticationContext) {
    const organizationId = this.tenantId(authentication);
    const databaseRules = await this.getDatabaseRules(organizationId);

    return organizationId || databaseRules.length > 0
      ? databaseRules
      : SANCTION_RULES;
  }

  async getRuleById(id: string, authentication?: AuthenticationContext) {
    const organizationId = this.tenantId(authentication);
    const rule = await this.findRule({ id }, organizationId);

    if (!rule) {
      throw new NotFoundException('Sanction rule not found.');
    }

    return this.toRuleConfig(rule);
  }

  async getRuleByCode(code: string, authentication?: AuthenticationContext) {
    const organizationId = this.tenantId(authentication);
    const rule = await this.findRule({ code }, organizationId);

    if (!rule) {
      throw new NotFoundException('Sanction rule not found.');
    }

    return this.toRuleConfig(rule);
  }

  async createRule(
    payload: CreateSanctionRuleDto,
    authentication?: AuthenticationContext,
  ) {
    const organizationId = this.tenantId(authentication);
    this.assertNoClientOrganizationId(payload);
    const nextRule: DbSanctionRuleRecord = {
      id: '',
      code: payload.code.trim(),
      type: payload.type as SanctionRuleType,
      name: payload.name.trim(),
      description: payload.description?.trim() || null,
      active: payload.active ?? true,
      latenessMinMinutes: payload.latenessMinMinutes ?? null,
      latenessMinInclusive: payload.latenessMinInclusive ?? true,
      latenessMaxMinutes: payload.latenessMaxMinutes ?? null,
      latenessMaxInclusive: payload.latenessMaxInclusive ?? false,
      monthlyTolerance: payload.monthlyTolerance,
      amountFcfa: payload.amountFcfa,
      priority: payload.priority,
      appliedReason: payload.appliedReason.trim(),
      toleratedReason: payload.toleratedReason?.trim() || null,
    };

    this.assertValidRuleThresholds(nextRule);
    if (nextRule.active) {
      await this.assertNoOverlappingActiveLatenessRanges(
        undefined,
        nextRule,
        organizationId,
      );
    }

    try {
      const created = (await this.prisma.sanctionRule.create({
        data: {
          ...nextRule,
          id: undefined,
          type: payload.type as PrismaSanctionRuleType,
          organizationId: organizationId ?? null,
        },
        select: this.getSanctionRuleSelect(),
      })) as DbSanctionRuleRecord;

      return this.toRuleConfig(created);
    } catch (error) {
      this.handleKnownPersistenceError(error);
    }
  }

  async updateRule(
    id: string,
    payload: UpdateSanctionRuleDto,
    authentication?: AuthenticationContext,
  ) {
    const organizationId = this.tenantId(authentication);
    this.assertNoClientOrganizationId(payload);
    const existingRule = await this.findRule({ id }, organizationId);

    if (!existingRule) {
      throw new NotFoundException('Sanction rule not found.');
    }

    const nextRule = {
      ...existingRule,
      ...payload,
    };

    this.assertValidRuleThresholds(nextRule);

    if (nextRule.active && this.isLatenessRule(nextRule.type)) {
      await this.assertNoOverlappingActiveLatenessRanges(
        id,
        nextRule,
        organizationId,
      );
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
        ...(payload.priority !== undefined
          ? { priority: payload.priority }
          : {}),
      },
      select: this.getSanctionRuleSelect(),
    })) as DbSanctionRuleRecord;

    return this.toRuleConfig(updatedRule);
  }

  async getAttendanceSanction(
    attendanceId: string,
    authentication?: AuthenticationContext,
  ) {
    const organizationId = this.tenantId(authentication);
    const rules = await this.getActiveRules(organizationId);
    const attendanceSelect = {
      id: true,
      employeeId: true,
      date: true,
      minutesLate: true,
    } as const;
    const attendance = organizationId
      ? await this.prisma.attendance.findFirst({
          where: {
            id: attendanceId,
            organizationId,
            employee: { organizationId },
          },
          select: attendanceSelect,
        })
      : await this.prisma.attendance.findUnique({
          where: { id: attendanceId },
          select: attendanceSelect,
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
          organizationId,
        })
      : 0;

    return this.calculateForAttendance(
      sanctionInput,
      previousRuleMatchCount,
      rules,
    );
  }

  async getMonthlySanctions(
    month?: string,
    employeeId?: string,
    authentication?: AuthenticationContext,
  ) {
    const { start, end } = this.getMonthRange(month);
    return this.getSanctionsForDateRange(
      start,
      end,
      employeeId,
      authentication,
    );
  }

  async getSanctionsForDateRange(
    start: Date,
    end: Date,
    employeeId?: string,
    authentication?: AuthenticationContext,
  ) {
    const organizationId = this.tenantId(authentication);
    const rules = await this.getActiveRules(organizationId);
    const attendances = await this.prisma.attendance.findMany({
      where: {
        ...(organizationId ? { organizationId } : {}),
        ...(organizationId ? { employee: { organizationId } } : {}),
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

  private async getActiveRules(organizationId?: string) {
    const databaseRules = await this.getActiveDatabaseRules(organizationId);

    return organizationId || databaseRules.length > 0
      ? databaseRules
      : SANCTION_RULES;
  }

  private async getDatabaseRules(
    organizationId?: string,
  ): Promise<SanctionRuleConfig[]> {
    const records = (await this.prisma.sanctionRule.findMany({
      where: organizationId ? { organizationId } : undefined,
      orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
      select: this.getSanctionRuleSelect(),
    })) as DbSanctionRuleRecord[];

    return records.flatMap((record) => {
      const rule = this.toRuleConfig(record);

      return rule ? [rule] : [];
    });
  }

  private async getActiveDatabaseRules(
    organizationId?: string,
  ): Promise<SanctionRuleConfig[]> {
    const records = (await this.prisma.sanctionRule.findMany({
      where: {
        active: true,
        ...(organizationId ? { organizationId } : {}),
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
      code: true,
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
      throw new BadRequestException(
        'monthlyTolerance must be greater than or equal to 0.',
      );
    }

    if (rule.amountFcfa < 0) {
      throw new BadRequestException(
        'amountFcfa must be greater than or equal to 0.',
      );
    }

    if (rule.priority < 0) {
      throw new BadRequestException(
        'priority must be greater than or equal to 0.',
      );
    }
  }

  private async assertNoOverlappingActiveLatenessRanges(
    id: string | undefined,
    nextRule: DbSanctionRuleRecord,
    organizationId?: string,
  ) {
    const activeRules = (await this.prisma.sanctionRule.findMany({
      where: {
        active: true,
        ...(organizationId ? { organizationId } : {}),
        type: {
          in: [
            PrismaSanctionRuleType.MINOR_LATENESS,
            PrismaSanctionRuleType.MAJOR_LATENESS,
          ],
        },
        ...(id ? { NOT: { id } } : {}),
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
      code: record.code,
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
    organizationId?: string;
  }) {
    const { start, end } = getAttendanceMonthRangeFromDate(input.date);
    const attendances = await this.prisma.attendance.findMany({
      where: {
        employeeId: input.employeeId,
        ...(input.organizationId
          ? { organizationId: input.organizationId }
          : {}),
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

  private async findRule(
    where: { id: string } | { code: string },
    organizationId?: string,
  ) {
    if (organizationId) {
      return (await this.prisma.sanctionRule.findFirst({
        where: { ...where, organizationId },
        select: this.getSanctionRuleSelect(),
      })) as DbSanctionRuleRecord | null;
    }

    if ('id' in where) {
      return (await this.prisma.sanctionRule.findUnique({
        where: { id: where.id },
        select: this.getSanctionRuleSelect(),
      })) as DbSanctionRuleRecord | null;
    }

    return (await this.prisma.sanctionRule.findFirst({
      where,
      select: this.getSanctionRuleSelect(),
    })) as DbSanctionRuleRecord | null;
  }

  private tenantId(authentication?: AuthenticationContext) {
    if (!authentication || authentication.generation === 'legacy') {
      return undefined;
    }

    if (!authentication.organizationId) {
      throw new BadRequestException(
        'A valid organization context is required.',
      );
    }

    return authentication.organizationId;
  }

  private assertNoClientOrganizationId(payload: object) {
    if (Object.hasOwn(payload, 'organizationId')) {
      throw new BadRequestException(
        'Sanction rule organization is server-controlled.',
      );
    }
  }

  private handleKnownPersistenceError(error: unknown): never {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      throw new ConflictException(
        'A sanction rule with this code already exists.',
      );
    }

    throw error;
  }
}
