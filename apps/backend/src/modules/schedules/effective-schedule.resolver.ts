import { Injectable, NotFoundException } from '@nestjs/common';
import { Schedule, V1OperationalScopeStatus } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';

/**
 * The only authoritative schedule lookup for SaaS business-date work.
 * Employee.scheduleId is deliberately not consulted: it is a compatibility
 * projection and cannot describe historical or future assignments.
 */
@Injectable()
export class EffectiveScheduleResolver {
  constructor(private readonly prisma: PrismaService) {}

  /** Batch equivalent for report windows: preserves date/site relationship checks without a resolver query per employee-day. */
  async resolvePeriod(
    employeeIds: string[],
    organizationId: string,
    start: Date,
    endExclusive: Date,
    siteId?: string,
  ) {
    const result = new Map<string, Map<number, Schedule>>();
    if (employeeIds.length === 0 || endExclusive <= start) return result;

    const [siteAssignments, scheduleAssignments] = await Promise.all([
      this.prisma.employeeSiteAssignment.findMany({
        where: {
          organizationId,
          employeeId: { in: employeeIds },
          ...(siteId ? { siteId } : {}),
          effectiveFrom: { lt: endExclusive },
          OR: [{ effectiveTo: null }, { effectiveTo: { gt: start } }],
        },
        select: { id: true, employeeId: true, siteId: true, effectiveFrom: true, effectiveTo: true },
        orderBy: { effectiveFrom: 'asc' },
      }),
      this.prisma.employeeScheduleAssignment.findMany({
        where: {
          organizationId,
          employeeId: { in: employeeIds },
          ...(siteId ? { siteId } : {}),
          v1ScopeStatus: V1OperationalScopeStatus.OPERATIONAL,
          effectiveFrom: { lt: endExclusive },
          OR: [{ effectiveTo: null }, { effectiveTo: { gt: start } }],
          schedule: { is: { organizationId, isActive: true, v1ScopeStatus: V1OperationalScopeStatus.OPERATIONAL, ...(siteId ? { siteId } : {}) } },
        },
        include: { schedule: true },
        orderBy: { effectiveFrom: 'asc' },
      }),
    ]);

    const sitesByEmployee = new Map<string, typeof siteAssignments>();
    const schedulesByEmployee = new Map<string, typeof scheduleAssignments>();
    for (const assignment of siteAssignments) {
      const items = sitesByEmployee.get(assignment.employeeId) ?? [];
      items.push(assignment);
      sitesByEmployee.set(assignment.employeeId, items);
    }
    for (const assignment of scheduleAssignments) {
      const items = schedulesByEmployee.get(assignment.employeeId) ?? [];
      items.push(assignment);
      schedulesByEmployee.set(assignment.employeeId, items);
    }

    for (const employeeId of employeeIds) {
      const employeeSchedules = new Map<number, Schedule>();
      const cursor = new Date(start);
      while (cursor < endExclusive) {
        const businessDate = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth(), cursor.getUTCDate()));
        const timestamp = businessDate.getTime();
        const siteAssignment = sitesByEmployee.get(employeeId)?.find((item) =>
          item.effectiveFrom <= businessDate && (!item.effectiveTo || item.effectiveTo > businessDate),
        );
        if (siteAssignment && (!siteId || siteAssignment.siteId === siteId)) {
          const scheduleAssignment = schedulesByEmployee.get(employeeId)?.find((item) =>
            item.siteId === siteAssignment.siteId &&
            item.employeeSiteAssignmentId === siteAssignment.id &&
            item.effectiveFrom <= businessDate &&
            (!item.effectiveTo || item.effectiveTo > businessDate),
          );
          if (scheduleAssignment) employeeSchedules.set(timestamp, scheduleAssignment.schedule);
        }
        cursor.setUTCDate(cursor.getUTCDate() + 1);
      }
      result.set(employeeId, employeeSchedules);
    }
    return result;
  }

  async resolve(employeeId: string, organizationId: string, businessDate: Date) {
    const employee = await this.prisma.employee.findFirst({
      where: { id: employeeId, organizationId, v1ScopeStatus: V1OperationalScopeStatus.OPERATIONAL },
      select: { id: true },
    });
    if (!employee) throw new NotFoundException('Employee not found.');

    const siteAssignment = await this.prisma.employeeSiteAssignment.findFirst({
      where: {
        organizationId, employeeId,
        effectiveFrom: { lte: businessDate },
        OR: [{ effectiveTo: null }, { effectiveTo: { gt: businessDate } }],
      },
      select: { id: true, siteId: true },
    });
    if (!siteAssignment) throw new NotFoundException('Employee has no effective site assignment.');

    const scheduleAssignment = await this.prisma.employeeScheduleAssignment.findFirst({
      where: {
        organizationId, employeeId, siteId: siteAssignment.siteId,
        employeeSiteAssignmentId: siteAssignment.id,
        v1ScopeStatus: V1OperationalScopeStatus.OPERATIONAL,
        effectiveFrom: { lte: businessDate },
        OR: [{ effectiveTo: null }, { effectiveTo: { gt: businessDate } }],
        schedule: { is: { organizationId, siteId: siteAssignment.siteId, isActive: true, v1ScopeStatus: V1OperationalScopeStatus.OPERATIONAL } },
      },
      include: { schedule: true },
    });
    if (!scheduleAssignment) throw new NotFoundException('Employee has no effective operational schedule assignment.');
    return { siteAssignment, scheduleAssignment, schedule: scheduleAssignment.schedule };
  }

  async resolveOptional(employeeId: string, organizationId: string, businessDate: Date) {
    try { return await this.resolve(employeeId, organizationId, businessDate); }
    catch (error) {
      if (error instanceof NotFoundException) return null;
      throw error;
    }
  }
}
