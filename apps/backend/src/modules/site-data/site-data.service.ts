import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { employeeOperationalWhere, scheduleOperationalWhere, attendanceOperationalWhere } from '../../common/prisma/operational-scope';
import { publicEmployeeSelect, scheduleSelect } from '../../common/prisma/selects';
import { getBusinessDate } from '../../common/utils/attendance-date.util';
import { OrganizationTimezoneService } from '../../common/time/organization-timezone.service';
import { AttendanceSitesService } from '../attendance-sites/attendance-sites.service';
import { AttendanceService } from '../attendance/attendance.service';
import { AttendanceHistoryQueryDto } from '../attendance/dto/attendance-history-query.dto';
import { AuthenticationContext } from '../auth/interfaces/authentication-context.interface';
import { requireOrganizationContext } from '../auth/interfaces/organization-context.helpers';
import { SiteListQueryDto } from './dto/site-list-query.dto';

@Injectable()
export class SiteDataService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sites: AttendanceSitesService,
    private readonly attendanceService: AttendanceService,
    private readonly timezones: OrganizationTimezoneService,
  ) {}

  detail(siteId: string, auth: AuthenticationContext) {
    return this.sites.resolveAdminSite(siteId, auth);
  }

  private effectiveSiteWhere(organizationId: string, siteId: string, date: Date): Prisma.EmployeeWhereInput {
    return {
      ...employeeOperationalWhere(organizationId),
      siteAssignments: { some: {
        organizationId, siteId,
        effectiveFrom: { lte: date },
        OR: [{ effectiveTo: null }, { effectiveTo: { gt: date } }],
      } },
    };
  }

  private async currentDate(auth: AuthenticationContext) {
    const timezone = await this.timezones.resolve(auth);
    return { timezone, date: getBusinessDate(new Date(), timezone) };
  }

  async employees(siteId: string, query: SiteListQueryDto, auth: AuthenticationContext) {
    const { organizationId } = requireOrganizationContext(auth);
    const site = await this.sites.resolveAdminSite(siteId, auth, true);
    const { date } = await this.currentDate(auth);
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 50;
    const search = query.search?.trim();
    const where: Prisma.EmployeeWhereInput = {
      ...this.effectiveSiteWhere(organizationId, site.id, date),
      ...(query.isActive ? { isActive: query.isActive === 'true' } : {}),
      ...(search ? { OR: [
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        { employeeIdentifier: { contains: search, mode: 'insensitive' } },
      ] } : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.employee.findMany({
        where,
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }, { id: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          ...publicEmployeeSelect,
          siteAssignments: {
            where: { organizationId, siteId: site.id, effectiveFrom: { lte: date }, OR: [{ effectiveTo: null }, { effectiveTo: { gt: date } }] },
            orderBy: { effectiveFrom: 'desc' }, take: 1,
            select: { id: true, effectiveFrom: true, effectiveTo: true },
          },
          scheduleAssignments: {
            where: {
              organizationId, siteId: site.id, v1ScopeStatus: 'OPERATIONAL',
              effectiveFrom: { lte: date }, OR: [{ effectiveTo: null }, { effectiveTo: { gt: date } }],
              employeeSiteAssignment: { is: { effectiveFrom: { lte: date }, OR: [{ effectiveTo: null }, { effectiveTo: { gt: date } }] } },
              schedule: { is: { organizationId, siteId: site.id, isActive: true, v1ScopeStatus: 'OPERATIONAL' } },
            },
            orderBy: { effectiveFrom: 'desc' }, take: 1,
            select: { schedule: { select: scheduleSelect } },
          },
        },
      }),
      this.prisma.employee.count({ where }),
    ]);
    return {
      site: { id: site.id, name: site.name },
      items: items.map(({ siteAssignments, scheduleAssignments, ...employee }) => ({
        ...employee,
        effectiveAssignment: siteAssignments[0] ?? null,
        currentSchedule: scheduleAssignments[0]?.schedule ?? null,
      })),
      page, pageSize, total, totalPages: Math.ceil(total / pageSize),
    };
  }

  async schedules(siteId: string, query: SiteListQueryDto, auth: AuthenticationContext) {
    const { organizationId } = requireOrganizationContext(auth);
    const site = await this.sites.resolveAdminSite(siteId, auth);
    const { date } = await this.currentDate(auth);
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 50;
    const search = query.search?.trim();
    const where: Prisma.ScheduleWhereInput = {
      ...scheduleOperationalWhere(organizationId), siteId: site.id,
      ...(query.isActive ? { isActive: query.isActive === 'true' } : {}),
      ...(search ? { name: { contains: search, mode: 'insensitive' } } : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.schedule.findMany({
        where,
        select: {
          ...scheduleSelect,
          _count: { select: { employeeScheduleAssignments: { where: {
            organizationId, siteId: site.id, v1ScopeStatus: 'OPERATIONAL',
            effectiveFrom: { lte: date }, OR: [{ effectiveTo: null }, { effectiveTo: { gt: date } }],
            employee: { is: { ...employeeOperationalWhere(organizationId), isActive: true } },
            employeeSiteAssignment: { is: { effectiveFrom: { lte: date }, OR: [{ effectiveTo: null }, { effectiveTo: { gt: date } }] } },
          } } } },
        },
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        skip: (page - 1) * pageSize, take: pageSize,
      }),
      this.prisma.schedule.count({ where }),
    ]);
    return {
      site: { id: site.id, name: site.name, isActive: site.isActive },
      items: items.map(({ _count, ...schedule }) => ({ ...schedule, currentAssignedEmployeeCount: _count.employeeScheduleAssignments })),
      page, pageSize, total, totalPages: Math.ceil(total / pageSize),
    };
  }

  async attendance(siteId: string, query: AttendanceHistoryQueryDto, auth: AuthenticationContext) {
    const site = await this.sites.resolveAdminSite(siteId, auth, true);
    return this.attendanceService.getSiteAttendanceHistory(site.id, query, auth);
  }

  async history(siteId: string, query: AttendanceHistoryQueryDto, auth: AuthenticationContext) {
    const site = await this.sites.resolveAdminSite(siteId, auth);
    return this.attendanceService.getSiteAttendanceHistory(site.id, query, auth);
  }

  async dashboard(siteId: string, auth: AuthenticationContext) {
    const { organizationId } = requireOrganizationContext(auth);
    const site = await this.sites.resolveAdminSite(siteId, auth, true);
    const { timezone, date } = await this.currentDate(auth);
    const attendanceWhere: Prisma.AttendanceWhereInput = {
      ...attendanceOperationalWhere(organizationId), attendanceSiteId: site.id, date,
    };
    const [activeEmployees, presentToday, lateToday, earlyExitToday, overtime, recentAttendance] = await Promise.all([
      this.prisma.employee.count({ where: { ...this.effectiveSiteWhere(organizationId, site.id, date), isActive: true } }),
      this.prisma.attendance.count({ where: { ...attendanceWhere, clockInAt: { not: null } } }),
      this.prisma.attendance.count({ where: { ...attendanceWhere, minutesLate: { gt: 0 } } }),
      this.prisma.attendance.count({ where: { ...attendanceWhere, earlyExit: true } }),
      this.prisma.attendance.aggregate({ where: attendanceWhere, _sum: { overtimeHours: true } }),
      this.prisma.attendance.findMany({
        where: { ...attendanceOperationalWhere(organizationId), attendanceSiteId: site.id },
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }], take: 5,
        select: { id: true, date: true, status: true, clockInAt: true, clockOutAt: true, minutesLate: true, earlyExit: true, overtimeHours: true,
          employee: { select: { id: true, firstName: true, lastName: true, employeeIdentifier: true } } },
      }),
    ]);
    return {
      site: { id: site.id, name: site.name, isActive: site.isActive },
      date: date.toISOString(), organizationTimezone: timezone,
      activeEmployees, presentToday, lateToday, earlyExitToday,
      overtimeHoursToday: overtime._sum.overtimeHours ?? 0,
      recentAttendance,
    };
  }
}
