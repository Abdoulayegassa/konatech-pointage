import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import { AttendanceStatus, MembershipRole, Prisma } from '@prisma/client';
import {
  OPERATIONAL_SCOPE,
  operationalScopeCreateData,
} from '../../common/prisma/operational-scope';
import { createHash, randomUUID } from 'node:crypto';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  attendanceWithEmployeeSelect,
  employeeWithScheduleSelect,
  scheduleSelect,
} from '../../common/prisma/selects';
import {
  addAttendanceDays,
  formatBusinessMonth,
  getBusinessDate,
  getAttendanceMonthRange,
  getAttendanceMonthRangeFromDate,
  isScheduledOnDate,
  normalizeAttendanceDate,
  localScheduleTimeToUtc,
  parseAttendanceDateKey,
} from '../../common/utils/attendance-date.util';
import {
  getAttendanceCheckOutOutcome,
  getOutsideScheduleAttendanceOutcome,
} from '../../common/utils/attendance-checkout.util';
import { AttendanceSecurityService } from './attendance-security.service';
import {
  buildAttendanceScheduleSnapshot,
  hasAttendanceScheduleSnapshot,
  isScheduledOnResolvedAttendanceDate,
  resolveAttendanceSchedule,
} from '../../common/utils/attendance-schedule-snapshot.util';
import { ReconciliationQueryDto } from './dto/reconciliation.dto';
import { CheckInDto } from './dto/check-in.dto';
import { CheckInSecurityProofDto } from './dto/check-in-security.dto';
import { CheckOutDto } from './dto/check-out.dto';
import { CalendarService } from '../calendar/calendar.service';
import { AuthenticationContext } from '../auth/interfaces/authentication-context.interface';
import {
  OfflineAttendanceAction,
  OfflineAttendanceSyncDto,
} from './dto/offline-attendance-sync.dto';
import {
  AttendanceHistoryQueryDto,
  type AttendanceHistoryStatusFilter,
} from './dto/attendance-history-query.dto';
import { EntitlementsService } from '../subscriptions/entitlements.service';
import { AttendanceSitesService } from '../attendance-sites/attendance-sites.service';
import { OrganizationTimezoneService } from '../../common/time/organization-timezone.service';
import { EffectiveScheduleResolver } from '../schedules/effective-schedule.resolver';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { AttendancePhotoStorageService } from './attendance-photo-storage.service';
import {
  OfflineAttendanceContextService,
  VerifiedOfflineAttendanceContext,
  OFFLINE_ATTENDANCE_MAX_AGE_MS,
  OFFLINE_ATTENDANCE_FUTURE_SKEW_MS,
} from './offline-attendance-context.service';

@Injectable()
/**
 * SOURCE OF TRUTH
 * Attendance engine.
 *
 * Check-in, check-out, lateness, early departure, overtime, non-working-day
 * work status, and attendance history rules live here. Do not duplicate these
 * rules in frontend components or report renderers.
 */
export class AttendanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly attendanceSecurityService: AttendanceSecurityService,
    private readonly photoStorage: AttendancePhotoStorageService,
    private readonly calendarService: CalendarService,
    private readonly entitlements: EntitlementsService,
    @Optional() private readonly attendanceSites?: AttendanceSitesService,
    @Optional()
    private readonly organizationTimezones?: OrganizationTimezoneService,
    @Optional()
    private readonly effectiveSchedules?: EffectiveScheduleResolver,
    @Optional()
    private readonly offlineContexts?: OfflineAttendanceContextService,
  ) {}

  async getTodaySummary(
    referenceDate: Date = new Date(),
    authentication?: AuthenticationContext,
  ) {
    const organizationId = this.tenantId(authentication);
    const timezone = await this.resolveTimezone(authentication);
    const today = getBusinessDate(referenceDate, timezone);

    const [attendances, scheduledEmployees] =
      await Promise.all([
        this.prisma.attendance.findMany({
          where: {
            date: today,
            ...this.attendanceTenantWhere(organizationId),
          },
          select: {
            employeeId: true,
            clockInAt: true,
            clockOutAt: true,
            minutesLate: true,
            status: true,
          },
        }),
        this.prisma.employee.findMany({
          where: {
            isActive: true,
            ...this.employeeScheduleTenantWhere(organizationId),
          },
          select: {
            id: true,
            schedule: {
              select: {
                id: true,
                name: true,
                isActive: true,
                startTime: true,
                endTime: true,
                latenessMarginMinutes: true,
                workDays: true,
              },
            },
          },
        }),
      ]);

    const attendanceByEmployeeId = new Map(
      attendances.map((attendance) => [attendance.employeeId, attendance]),
    );

    const expectedEmployees = (
      await Promise.all(
        scheduledEmployees.map(async (employee) => ({
          employee,
          schedule: await this.resolveEffectiveSchedule(
            employee.id,
            organizationId,
            today,
            employee.schedule,
          ),
          isNonWorkingDay: (await this.calendarService.getNonWorkingDateKeysForEmployee(
            today,
            addAttendanceDays(today, 1),
            employee.id,
            authentication,
          )).has(today.getTime()),
        })),
      )
    )
      .filter(
        ({ schedule, isNonWorkingDay }) =>
          !isNonWorkingDay &&
          schedule?.isActive &&
          isScheduledOnDate(schedule.workDays, today),
      )
      .map(({ employee }) => employee);

    const checkedIn = attendances.filter(
      (attendance) => attendance.clockInAt !== null,
    ).length;
    const checkedOut = attendances.filter(
      (attendance) => attendance.clockOutAt !== null,
    ).length;
    const late = attendances.filter(
      (attendance) => attendance.minutesLate > 0,
    ).length;
    const absences = expectedEmployees.filter((employee) => {
      const attendance = attendanceByEmployeeId.get(employee.id);

      if (!attendance) {
        return true;
      }

      if (attendance.status === AttendanceStatus.ABSENT) {
        return true;
      }

      return attendance.clockInAt === null;
    }).length;

    return {
      asOf: new Date().toISOString(),
      date: today.toISOString(),
      organizationTimezone:
        authentication?.generation === 'saas' ? timezone : null,
      expected: expectedEmployees.length,
      checkedIn,
      checkedOut,
      late,
      absences,
    };
  }

  async getMonthlyHistory(
    month?: string,
    authentication?: AuthenticationContext,
  ) {
    return this.queryAttendanceHistory({ month }, undefined, authentication);
  }

  async getEmployeeMonthlyHistory(
    employeeId: string,
    month?: string,
    authentication?: AuthenticationContext,
  ) {
    return this.queryAttendanceHistory({ month }, employeeId, authentication);
  }

  private reconciliationOrganization(
    authentication: AuthenticationContext,
  ): string {
    if (
      authentication.generation !== 'saas' ||
      authentication.purpose !== 'account' ||
      authentication.membershipRole !== MembershipRole.ADMIN ||
      !authentication.organizationId ||
      !authentication.userId ||
      !authentication.membershipId
    ) {
      throw new ForbiddenException(
        'Organization administrator access is required.',
      );
    }
    return authentication.organizationId;
  }

  async listOfflineReconciliations(
    authentication: AuthenticationContext,
    query = new ReconciliationQueryDto(),
  ) {
    const organizationId = this.reconciliationOrganization(authentication);
    const where = {
      organizationId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.siteId ? { siteId: query.siteId } : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.offlineAttendanceReconciliation.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        select: {
          id: true,
          employeeId: true,
          siteId: true,
          reasonCode: true,
          status: true,
          employee: {
            select: {
              firstName: true,
              lastName: true,
              employeeIdentifier: true,
            },
          },
          site: { select: { name: true } },
          createdAt: true,
          decidedAt: true,
          resultingAttendanceId: true,
          syncRequest: {
            select: { clientRequestId: true, action: true, capturedAt: true },
          },
        },
      }),
      this.prisma.offlineAttendanceReconciliation.count({ where }),
    ]);
    return {
      items,
      total,
      page: query.page,
      pageSize: query.pageSize,
      totalPages: Math.ceil(total / query.pageSize),
    };
  }

  async getOfflineReconciliation(
    id: string,
    authentication: AuthenticationContext,
  ) {
    const organizationId = this.reconciliationOrganization(authentication);
    const item = await this.prisma.offlineAttendanceReconciliation.findFirst({
      where: { id, organizationId },
      select: {
        id: true,
        employeeId: true,
        siteId: true,
        reasonCode: true,
        reason: true,
        comments: true,
        evidenceSnapshot: true,
        selfieMimeType: true,
        selfieByteSize: true,
        selfieDeletedAt: true,
        selfiePublicId: true,
        employee: {
          select: { firstName: true, lastName: true, employeeIdentifier: true },
        },
        site: { select: { name: true } },
        status: true,
        createdAt: true,
        decidedByUserId: true,
        decidedAt: true,
        decisionReason: true,
        resultingAttendanceId: true,
        decisions: {
          select: {
            id: true,
            actorUserId: true,
            decision: true,
            reason: true,
            decidedAt: true,
          },
          orderBy: { decidedAt: 'asc' },
        },
        syncRequest: {
          select: {
            clientRequestId: true,
            action: true,
            capturedAt: true,
            receivedAt: true,
            contextSnapshot: true,
          },
        },
      },
    });
    if (!item) throw new NotFoundException('Reconciliation case not found.');
    // Provider identifiers, URLs and fingerprint hashes are never delivery credentials.
    const evidence = item.evidenceSnapshot as Record<
      string,
      Prisma.JsonValue
    > | null;
    const { selfieSha256: _fingerprint, ...safeEvidence } = evidence ?? {};
    const { selfiePublicId, ...dto } = item;
    return {
      ...dto,
      hasSelfie: Boolean(selfiePublicId),
      evidenceSnapshot: safeEvidence,
    };
  }

  async decideOfflineReconciliation(
    id: string,
    decision: 'APPROVE' | 'REJECT',
    reason: string,
    authentication: AuthenticationContext,
  ) {
    const organizationId = this.reconciliationOrganization(authentication);
    reason = reason.trim();
    if (reason.length < 5 || reason.length > 1000)
      throw new BadRequestException(
        'A meaningful decision reason is required (5–1000 characters).',
      );
    try {
      return await this.prisma.$transaction(
        async (tx) => {
          await this.entitlements.assertOperationalWriteAllowed(
            organizationId,
            tx,
          );
          const membership = await tx.membership.findFirst({
            where: {
              id: authentication.membershipId!,
              organizationId,
              userId: authentication.userId!,
              role: 'ADMIN',
              status: 'ACTIVE',
              user: { status: 'ACTIVE' },
              organization: { status: 'ACTIVE' },
            },
            select: { id: true },
          });
          if (!membership)
            throw new ForbiddenException(
              'Active organization administrator access is required.',
            );
          await tx.$queryRaw(
            Prisma.sql`SELECT "id" FROM "OfflineAttendanceReconciliation" WHERE "id" = ${id} AND "organizationId" = ${organizationId} FOR UPDATE`,
          );
          const item = await tx.offlineAttendanceReconciliation.findFirst({
            where: { id, organizationId },
            include: { syncRequest: true },
          });
          if (!item)
            throw new NotFoundException('Reconciliation case not found.');
          if (item.status === 'EXPIRED' || item.syncRequest.status === 'EXPIRED') {
            if (item.status === 'EXPIRED' && item.syncRequest.status === 'EXPIRED') {
              const expiryAudit = await tx.offlineAttendanceReconciliationDecision.findFirst({
                where: { organizationId, reconciliationId: id, decision: 'EXPIRE' },
                select: { id: true },
              });
              if (expiryAudit) {
                return {
                  id,
                  status: 'EXPIRED' as const,
                  resultingAttendanceId: null,
                  decidedAt: item.decidedAt,
                  idempotent: true,
                };
              }
            }
            throw new ConflictException('Expired offline events cannot be approved through reconciliation.');
          }
          const terminal = decision === 'APPROVE' ? 'RESOLVED' : 'REJECTED';
          if (
            item.status === terminal &&
            item.decidedByUserId === authentication.userId &&
            item.decisionReason === reason
          ) {
            return {
              id,
              status: item.status,
              resultingAttendanceId: item.resultingAttendanceId,
              decidedAt: item.decidedAt,
              idempotent: true,
            };
          }
          if (
            item.status !== 'PENDING_REVIEW' ||
            item.syncRequest.status !== 'RECONCILIATION_REQUIRED'
          ) {
            throw new ConflictException(
              'This reconciliation case cannot receive this decision.',
            );
          }
          if (
            Date.now() - item.syncRequest.capturedAt.getTime() >
            OFFLINE_ATTENDANCE_MAX_AGE_MS
          ) {
            const decidedAt = new Date();
            const expiryReason = 'Offline attendance event exceeded the 24-hour review eligibility window.';
            await tx.offlineAttendanceReconciliationDecision.create({
              data: {
                organizationId,
                reconciliationId: id,
                actorUserId: authentication.userId!,
                decision: 'EXPIRE',
                reason: `${expiryReason} Requested ${decision.toLowerCase()}; administrator note: ${reason}`,
                decidedAt,
              },
            });
            await tx.offlineAttendanceReconciliation.update({
              where: { id },
              data: {
                status: 'EXPIRED',
                decidedByUserId: authentication.userId,
                decidedAt,
                decisionReason: expiryReason,
                resultingAttendanceId: null,
              },
            });
            await tx.offlineAttendanceSyncRequest.update({
              where: { id: item.syncRequestId },
              data: { status: 'EXPIRED', rejectionReason: expiryReason, attendanceId: null },
            });
            return {
              id,
              status: 'EXPIRED' as const,
              resultingAttendanceId: null,
              decidedAt,
              idempotent: false,
            };
          }
          let attendanceId: string | null = null;
          if (decision === 'APPROVE') {
            // APPROVED is internal to this transaction; only RESOLVED is published
            // once the correction, history and ledger reference commit together.
            await tx.offlineAttendanceReconciliation.update({
              where: { id },
              data: { status: 'APPROVED' },
            });
            const context = item.syncRequest
              .contextSnapshot as unknown as VerifiedOfflineAttendanceContext | null;
            if (
              !context ||
              context.organizationId !== organizationId ||
              context.employeeId !== item.employeeId ||
              context.siteId !== item.siteId ||
              !context.attendancePolicy ||
              typeof context.timeZone !== 'string' ||
              !Array.isArray(context.scheduleSnapshots) ||
              !Array.isArray(context.nonWorkingDates)
            ) {
              throw new ConflictException(
                'The historical attendance context is unavailable.',
              );
            }
            if (
              context.attendancePolicy.selfieRequired &&
              !item.selfiePublicId
            ) {
              throw new ConflictException(
                'Required reconciliation selfie evidence is unavailable.',
              );
            }
            const evidence = item.evidenceSnapshot as Record<
              string,
              Prisma.JsonValue
            > | null;
            await this.attendanceSecurityService
              .validateEvidence(
                {
                  evidenceCapturedAt:
                    typeof evidence?.evidenceCapturedAt === 'string'
                      ? evidence.evidenceCapturedAt
                      : undefined,
                  latitude:
                    typeof evidence?.latitude === 'number'
                      ? evidence.latitude
                      : undefined,
                  longitude:
                    typeof evidence?.longitude === 'number'
                      ? evidence.longitude
                      : undefined,
                  accuracyMeters:
                    typeof evidence?.accuracyMeters === 'number'
                      ? evidence.accuracyMeters
                      : undefined,
                },
                {
                  enforceSecurity: true,
                  requireFreshEvidence: true,
                  evidenceReferenceTime: item.syncRequest.capturedAt,
                  notes: item.comments ?? undefined,
                  authentication,
                  site: context.site,
                  // Selfie is already private server evidence; never reconstruct a DataURL.
                  policyOverride: {
                    ...context.attendancePolicy,
                    selfieRequired: false,
                  },
                },
              )
              .catch(() => {
                throw new ConflictException(
                  'Original evidence cannot support this correction.',
                );
              });
            const engine = new AttendanceService(
              tx as unknown as PrismaService,
              this.attendanceSecurityService,
              this.photoStorage,
              this.calendarService,
              this.entitlements,
              this.attendanceSites,
              this.organizationTimezones,
              this.effectiveSchedules,
              this.offlineContexts,
            );
            await engine.getActiveEmployeeWithSchedule(
              item.employeeId,
              organizationId,
            );
            const options = {
              enforceSecurity: false,
              eventTime: item.syncRequest.capturedAt,
              offlineContext: context,
              reconciliationCorrection: true,
            };
            const payload = {
              notes: item.comments ?? undefined,
              siteId: context.siteId,
            };
            const applyCorrection = async () =>
              item.syncRequest.action === 'check-in'
                ? await engine.recordCheckIn(
                    item.employeeId,
                    payload,
                    options,
                    authentication,
                  )
                : item.syncRequest.action === 'check-out'
                  ? await engine.recordCheckOut(
                      item.employeeId,
                      payload,
                      options,
                      authentication,
                    )
                  : null;
            const attendance = await applyCorrection().catch((error) => {
              if (error instanceof BadRequestException)
                throw new ConflictException(error.message);
              throw error;
            });
            if (!attendance)
              throw new ConflictException(
                'Unsupported original attendance action.',
              );
            attendanceId = attendance.id;
            // Existing verification reason records provenance; the immutable case + ledger
            // retain the private evidence and complete original context without reuploading it.
            await tx.attendance.update({
              where: { id: attendanceId },
              data:
                item.syncRequest.action === 'check-in'
                  ? {
                      checkInVerificationReason:
                        'OFFLINE_RECONCILIATION_ADMIN_CORRECTION',
                    }
                  : {
                      checkOutVerificationReason:
                        'OFFLINE_RECONCILIATION_ADMIN_CORRECTION',
                    },
            });
          }
          const decidedAt = new Date();
          await tx.offlineAttendanceReconciliationDecision.create({
            data: {
              organizationId,
              reconciliationId: id,
              actorUserId: authentication.userId!,
              decision,
              reason,
              decidedAt,
            },
          });
          await tx.offlineAttendanceReconciliation.update({
            where: { id },
            data: {
              status: terminal,
              decidedByUserId: authentication.userId,
              decidedAt,
              decisionReason: reason,
              resultingAttendanceId: attendanceId,
            },
          });
          // Approval remains a reviewed correction, never a normal automatic ACCEPTED sync.
          await tx.offlineAttendanceSyncRequest.update({
            where: { id: item.syncRequestId },
            data: {
              attendanceId,
              ...(decision === 'REJECT'
                ? { status: 'REJECTED', rejectionReason: reason }
                : {}),
            },
          });
          return {
            id,
            status: terminal,
            resultingAttendanceId: attendanceId,
            decidedAt,
            idempotent: false,
          };
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          timeout: 15000,
        },
      );
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        ['P2034', 'P2002'].includes(error.code)
      ) {
        throw new ConflictException(
          'Attendance or reconciliation changed concurrently. Reload before deciding.',
        );
      }
      throw error;
    }
  }

  async getOfflineReconciliationSelfie(
    id: string,
    authentication: AuthenticationContext,
  ) {
    const organizationId = this.reconciliationOrganization(authentication);
    const item = await this.prisma.offlineAttendanceReconciliation.findFirst({
      where: { id, organizationId },
      select: { selfiePublicId: true },
    });
    if (!item?.selfiePublicId)
      throw new NotFoundException('Reconciliation evidence not found.');
    return this.photoStorage.getVerificationPhoto(item.selfiePublicId);
  }

  async getEmployeeOfflineReconciliationOutcome(
    clientRequestId: string,
    employeeId: string,
    authentication: AuthenticationContext,
  ) {
    const organizationId = this.tenantId(authentication);
    if (!organizationId) throw new NotFoundException('Offline reconciliation outcome not found.');
    const item = await this.prisma.$transaction(async (tx) => {
      const ledger = await tx.offlineAttendanceSyncRequest.findFirst({
        where: { organizationId, employeeId, clientRequestId },
        select: { id: true, reconciliation: { select: { id: true } } },
      });
      if (ledger?.reconciliation?.id) {
        await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "OfflineAttendanceReconciliation" WHERE "id" = ${ledger.reconciliation.id} AND "organizationId" = ${organizationId} FOR UPDATE`);
      }
      const current = await tx.offlineAttendanceSyncRequest.findFirst({
        where: { organizationId, employeeId, clientRequestId },
        select: {
          id: true,
          status: true,
          action: true,
          capturedAt: true,
          receivedAt: true,
          rejectionReason: true,
          attendanceId: true,
          reconciliation: {
            select: { id: true, status: true, decisionReason: true, decidedAt: true },
          },
        },
      });
      if (!current) return null;
      if (
        current.reconciliation?.status === 'PENDING_REVIEW' &&
        current.status === 'RECONCILIATION_REQUIRED' &&
        Date.now() - current.capturedAt.getTime() > OFFLINE_ATTENDANCE_MAX_AGE_MS
      ) {
        const decidedAt = new Date();
        const expiryReason = 'Offline attendance event exceeded the 24-hour review eligibility window.';
        await tx.offlineAttendanceReconciliationDecision.create({
          data: {
            organizationId,
            reconciliationId: current.reconciliation.id,
            actorUserId: authentication.userId!,
            decision: 'EXPIRE',
            reason: expiryReason,
            decidedAt,
          },
        });
        await tx.offlineAttendanceReconciliation.update({
          where: { id: current.reconciliation.id },
          data: { status: 'EXPIRED', decidedByUserId: authentication.userId, decidedAt, decisionReason: expiryReason, resultingAttendanceId: null },
        });
        await tx.offlineAttendanceSyncRequest.update({
          where: { id: current.id },
          data: { status: 'EXPIRED', rejectionReason: expiryReason, attendanceId: null },
        });
        return {
          ...current,
          status: 'EXPIRED' as const,
          rejectionReason: expiryReason,
          attendanceId: null,
          reconciliation: { ...current.reconciliation, status: 'EXPIRED' as const, decisionReason: expiryReason, decidedAt },
        };
      }
      return current;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 15000 });
    if (!item)
      throw new NotFoundException('Offline reconciliation outcome not found.');
    return {
      state:
        item.reconciliation?.status === 'RESOLVED'
          ? 'resolved'
          : item.reconciliation?.status === 'REJECTED'
            ? 'rejected'
            : item.status.toLowerCase(),
      action: item.action,
      capturedAt: item.capturedAt,
      receivedAt: item.receivedAt,
      attendanceId: item.attendanceId,
      reason:
        item.reconciliation?.status === 'PENDING_REVIEW'
          ? 'Ce pointage est en attente de vérification administrative.'
          : item.reconciliation?.status === 'RESOLVED'
            ? 'Pointage corrigé après vérification administrative.'
            : item.reconciliation?.status === 'REJECTED'
              ? item.reconciliation.decisionReason
              : item.status === 'EXPIRED'
                ? 'Délai maximal de 24 heures dépassé.'
                : item.rejectionReason,
      reviewStatus: item.reconciliation?.status ?? null,
      decisionReason: item.reconciliation?.decisionReason ?? null,
      decidedAt: item.reconciliation?.decidedAt ?? null,
    };
  }

  async getAttendanceHistory(
    query: AttendanceHistoryQueryDto,
    authentication?: AuthenticationContext,
  ) {
    return this.queryAttendanceHistory(query, undefined, authentication);
  }

  async getSiteAttendanceHistory(
    siteId: string,
    query: AttendanceHistoryQueryDto,
    authentication: AuthenticationContext,
  ) {
    // Site endpoints are always bounded. Historical site is the stored
    // attendanceSiteId, never the employee's current assignment.
    return this.queryAttendanceHistory(
      { ...query, page: query.page ?? 1, pageSize: query.pageSize ?? 50 },
      undefined,
      authentication,
      siteId,
    );
  }

  async getEmployeeAttendanceHistory(
    employeeId: string,
    query: AttendanceHistoryQueryDto,
    authentication?: AuthenticationContext,
  ) {
    return this.queryAttendanceHistory(query, employeeId, authentication);
  }

  async getAuthorizedVerificationPhoto(
    attendanceId: string,
    user: AuthenticatedUser,
    authentication?: AuthenticationContext,
  ) {
    const organizationId = this.tenantId(authentication);
    const attendance = await this.prisma.attendance.findFirst({
      where: {
        id: attendanceId,
        ...this.attendanceTenantWhere(organizationId),
      },
      select: {
        employeeId: true,
        checkInVerificationPhotoPublicId: true,
        checkInVerificationPhotoDeletedAt: true,
        checkOutVerificationPhotoPublicId: true,
        checkOutVerificationPhotoDeletedAt: true,
      },
    });

    if (!attendance || !this.canReadAttendanceEvidence(user, authentication, attendance.employeeId)) {
      throw new NotFoundException('Verification photo not found.');
    }

    const publicId = attendance.checkInVerificationPhotoPublicId
      ? attendance.checkInVerificationPhotoPublicId
      : attendance.checkOutVerificationPhotoPublicId;
    if (!publicId) {
      throw new NotFoundException('Verification photo not found.');
    }

    return this.photoStorage.getVerificationPhoto(publicId);
  }

  async getEmployeeTodayAttendance(
    employeeId: string,
    referenceDate: Date = new Date(),
    authentication?: AuthenticationContext,
  ) {
    const organizationId = this.tenantId(authentication);
    const timezone = await this.resolveTimezone(authentication);
    const today = getBusinessDate(referenceDate, timezone);
    const employee = await this.prisma.employee.findFirst({
      where: {
        id: employeeId,
        ...this.employeeScheduleTenantWhere(organizationId),
      },
      select: employeeWithScheduleSelect,
    });

    if (!employee) {
      throw new NotFoundException('Employee not found.');
    }

    const attendance = await this.prisma.attendance.findFirst({
      where: {
        employeeId,
        date: today,
        ...this.attendanceTenantWhere(organizationId),
      },
      select: attendanceWithEmployeeSelect,
    });
    const effectiveSchedule = await this.resolveEffectiveSchedule(
      employee.id,
      organizationId,
      today,
      employee.schedule,
    );
    const monthlyAbsenceCount = await this.getMonthlyAbsenceCount(
      employee.id,
      referenceDate,
      attendance?.clockInAt ? today : undefined,
      organizationId,
      authentication,
      employee.schedule,
    );

    const expectedToday = effectiveSchedule
      ? effectiveSchedule.isActive &&
        !(await this.calendarService.getNonWorkingDateKeysForEmployee(
          today, addAttendanceDays(today, 1), employee.id, authentication,
        )).has(today.getTime()) &&
        isScheduledOnDate(effectiveSchedule.workDays, today)
      : false;
    const policySite =
      authentication?.generation === 'saas' && authentication.attendanceSiteId
        ? await this.resolveAttendanceSite(authentication)
        : null;
    const securityPolicy =
      await this.attendanceSecurityService.getEffectivePolicy(
        authentication,
        policySite,
      );

    return {
      date: today.toISOString(),
      organizationTimezone:
        authentication?.generation === 'saas' ? timezone : null,
      expectedToday,
      canCheckIn: !attendance?.clockInAt,
      canCheckOut: Boolean(attendance?.clockInAt && !attendance.clockOutAt),
      monthlyAbsenceCount,
      securityPolicy: {
        ...securityPolicy,
        siteId: policySite?.id ?? null,
        siteName: policySite?.name ?? null,
      },
      attendance,
      employee,
    };
  }

  getCheckInSecurityPolicy(authentication?: AuthenticationContext) {
    return this.attendanceSecurityService.getEffectivePolicy(authentication);
  }

  async checkIn(
    checkInDto: CheckInDto,
    authentication?: AuthenticationContext,
  ) {
    return this.recordCheckIn(
      checkInDto.employeeId,
      checkInDto,
      {
        enforceSecurity: false,
      },
      authentication,
    );
  }

  async checkOut(
    checkOutDto: CheckOutDto,
    authentication?: AuthenticationContext,
  ) {
    return this.recordCheckOut(
      checkOutDto.employeeId,
      checkOutDto,
      {
        enforceSecurity: false,
      },
      authentication,
    );
  }

  async checkInForEmployee(
    employeeId: string,
    payload: {
      occurredAt?: string;
      notes?: string;
      security?: CheckInSecurityProofDto;
      siteId?: string;
    },
    authentication?: AuthenticationContext,
  ) {
    return this.recordCheckIn(
      employeeId,
      payload,
      {
        enforceSecurity: true,
        serverAuthoritativeTimestamp: true,
      },
      authentication,
    );
  }

  async checkOutForEmployee(
    employeeId: string,
    payload: {
      occurredAt?: string;
      notes?: string;
      security?: CheckInSecurityProofDto;
      siteId?: string;
    },
    authentication?: AuthenticationContext,
  ) {
    return this.recordCheckOut(
      employeeId,
      payload,
      {
        enforceSecurity: true,
        serverAuthoritativeTimestamp: true,
      },
      authentication,
    );
  }

  async synchronizeOfflineAttendance(
    employeeId: string,
    dto: OfflineAttendanceSyncDto,
    authentication: AuthenticationContext,
  ) {
    if (
      authentication.generation === 'legacy' &&
      (!authentication.sessionBinding ||
        dto.sessionBinding !== authentication.sessionBinding)
    ) {
      throw new BadRequestException(
        'Offline attendance belongs to a different or expired session.',
      );
    }

    const receivedAt = new Date();
    const capturedAt = this.validateOfflineCapturedAt(dto.capturedAt, receivedAt);
    const offlineContextResult =
      authentication.generation === 'saas' && this.offlineContexts
        ? this.offlineContexts?.verify(
            dto.contextToken ?? '',
            employeeId,
            authentication,
            capturedAt,
            receivedAt,
          )
        : null;
    if (
      authentication.generation === 'saas' &&
      this.offlineContexts &&
      !offlineContextResult
    ) {
      throw new BadRequestException('A valid offline attendance context is required.');
    }
    const offlineContext = offlineContextResult?.context ?? null;
    if (offlineContext && dto.siteId && dto.siteId !== offlineContext.siteId) {
      throw new BadRequestException('Offline attendance site does not match its context.');
    }

    if (authentication.generation === 'legacy') {
      if (receivedAt.getTime() - capturedAt.getTime() > OFFLINE_ATTENDANCE_MAX_AGE_MS) {
        return {
          clientRequestId: dto.clientRequestId,
          state: 'expired' as const,
          idempotent: false,
          capturedAt: capturedAt.toISOString(),
          receivedAt: receivedAt.toISOString(),
        };
      }
      return this.synchronizeLegacyOfflineAttendance(
        employeeId,
        dto,
        authentication,
        capturedAt,
        receivedAt,
      );
    }

    const organizationId = this.tenantId(authentication);
    if (!organizationId) {
      throw new BadRequestException(
        'A valid organization context is required.',
      );
    }
    const payloadHash = this.getOfflineSyncPayloadHash(employeeId, dto);
    if (offlineContextResult?.expired) {
      try {
        await this.prisma.offlineAttendanceSyncRequest.create({
          data: {
            organizationId,
            employeeId,
            clientRequestId: dto.clientRequestId,
            action: dto.action,
            siteId: offlineContext?.siteId ?? dto.siteId ?? authentication.attendanceSiteId ?? null,
            payloadHash,
            capturedAt,
            receivedAt,
            status: 'EXPIRED',
            rejectionReason: 'Offline context or event exceeded the 24-hour validity window.',
            contextSnapshot: offlineContext as unknown as Prisma.InputJsonValue,
          },
        });
      } catch (error) {
        if (!this.isUniqueConstraintError(error)) throw error;
        await this.prisma.offlineAttendanceSyncRequest.updateMany({
          where: { organizationId, employeeId, clientRequestId: dto.clientRequestId, payloadHash,
            status: { in: ['PROCESSING', 'RECONCILIATION_REQUIRED'] }, attendanceId: null, reconciliation: { is: null } },
          data: { status: 'EXPIRED', rejectionReason: 'Offline event exceeded 24 hours before durable evidence intake.' },
        });
        return this.resolveExistingOfflineSyncRequest(
          employeeId,
          dto.clientRequestId,
          payloadHash,
          organizationId,
        );
      }
      return {
        clientRequestId: dto.clientRequestId,
        state: 'expired' as const,
        idempotent: false,
        capturedAt: dto.capturedAt,
        contextId: offlineContext?.contextId ?? null,
        receivedAt: receivedAt.toISOString(),
      };
    }
    if (offlineContext) {
      const site = await this.prisma.attendanceSite.findFirst({
        where: { id: offlineContext.siteId, organizationId },
        select: { id: true, isActive: true, statusChangedAt: true },
      });
      if (!site) {
        throw new ForbiddenException(
          'Offline attendance site is not owned by this organization.',
        );
      }
      const staleSiteContext =
        !offlineContext.siteStatusChangedAtAtIssue ||
        !Number.isFinite(Date.parse(offlineContext.siteStatusChangedAtAtIssue)) ||
        site.statusChangedAt.getTime() !==
          Date.parse(offlineContext.siteStatusChangedAtAtIssue);
      if (!site.isActive || staleSiteContext) {
        return this.recordOfflineReconciliationRequired(
          employeeId,
          dto,
          organizationId,
          payloadHash,
          capturedAt,
          receivedAt,
          offlineContext,
          authentication,
          !site.isActive
            ? 'Attendance site is inactive; this event requires reconciliation.'
            : 'Attendance site changed after context issuance; this event requires reconciliation.',
        );
      }
    }
    let requestId: string;

    try {
      const request = await this.prisma.offlineAttendanceSyncRequest.create({
        data: {
          organizationId,
          employeeId,
          clientRequestId: dto.clientRequestId,
          action: dto.action,
          siteId: dto.siteId ?? authentication.attendanceSiteId ?? null,
          payloadHash,
          capturedAt,
          receivedAt,
          contextSnapshot: offlineContext as unknown as Prisma.InputJsonValue,
        },
        select: { id: true },
      });
      requestId = request.id;
    } catch (error) {
      if (!this.isUniqueConstraintError(error)) throw error;
      if (offlineContext) {
        const existing = await this.prisma.offlineAttendanceSyncRequest.findUnique({
          where: { organizationId_clientRequestId: { organizationId, clientRequestId: dto.clientRequestId } },
          select: { id: true, status: true },
        });
        if (existing?.status === 'RECONCILIATION_REQUIRED') {
          await this.createOfflineReconciliationCaseForRequest({
            organizationId, employeeId, dto, payloadHash, capturedAt, receivedAt,
            context: offlineContext, reason: 'Previously classified offline attendance requires review.', authentication,
          });
        }
      }
      return this.resolveExistingOfflineSyncRequest(
        employeeId,
        dto.clientRequestId,
        payloadHash,
        organizationId,
      );
    }

    try {
      const attendance = await this.applyOfflineAttendance(
        employeeId,
        dto,
        authentication,
        capturedAt,
        offlineContext,
        { id: requestId, organizationId, employeeId, receivedAt },
      );

      return {
        clientRequestId: dto.clientRequestId,
        state: 'accepted' as const,
        idempotent: false,
        capturedAt: dto.capturedAt,
        contextId: offlineContext?.contextId ?? null,
        receivedAt: receivedAt.toISOString(),
        attendance,
      };
    } catch (error) {
      if (this.isPermanentOfflineSyncError(error)) {
        const requiresReconciliation =
          error instanceof Error &&
          error.message.toLowerCase().includes('reconciliation');
        if (requiresReconciliation && offlineContext) {
          await this.createOfflineReconciliationCaseForRequest({
            organizationId, employeeId, dto, payloadHash, capturedAt, receivedAt,
            context: offlineContext, reason: error instanceof Error ? error.message : 'Historical attendance requires review.',
            authentication,
          });
          return this.resolveExistingOfflineSyncRequest(employeeId, dto.clientRequestId, payloadHash, organizationId);
        } else {
          await this.prisma.offlineAttendanceSyncRequest.updateMany({
            where: { id: requestId, status: 'PROCESSING' },
            data: {
              status: 'REJECTED',
              rejectionReason: error instanceof Error ? error.message : 'Offline attendance was rejected.',
            },
          });
        }
      } else {
        await this.prisma.offlineAttendanceSyncRequest.deleteMany({
          where: { id: requestId, status: 'PROCESSING' },
        });
      }
      throw error;
    }
  }

  private async reconciliationEvidenceAcknowledged(syncRequestId: string) {
    const item = await this.prisma.offlineAttendanceReconciliation.findUnique({
      where: { syncRequestId },
      select: {
        selfiePublicId: true,
        selfieDeletedAt: true,
        syncRequest: { select: { contextSnapshot: true } },
      },
    });
    if (!item) return false;
    const context = item.syncRequest
      .contextSnapshot as unknown as VerifiedOfflineAttendanceContext | null;
    return Boolean(
      context?.attendancePolicy &&
      (!context.attendancePolicy.selfieRequired ||
        item.selfiePublicId ||
        item.selfieDeletedAt),
    );
  }

  private async uploadReconciliationEvidence(
    selfie: string,
    employeeId: string,
    occurredAt: Date,
    action: string,
  ) {
    const input = {
      employeeId,
      occurredAt,
      reason: `offline-reconciliation-${action}-${randomUUID()}`,
    };
    const publicId = this.photoStorage.plannedVerificationPhotoPublicId(
      selfie,
      input,
    );
    await this.prisma.reconciliationEvidenceUpload.create({
      data: { publicId },
    });
    try {
      const stored = await this.photoStorage.uploadVerificationPhoto(
        selfie,
        input,
      );
      if (stored.publicId !== publicId)
        throw new ServiceUnavailableException(
          'Evidence storage identity could not be verified.',
        );
      return stored;
    } catch (error) {
      await this.compensateReconciliationEvidence(publicId);
      throw error;
    }
  }

  private async compensateReconciliationEvidence(publicId: string) {
    // Never delete a winning intake's evidence. Intents survive failed deletion
    // and ambiguous uploads so the daily retention worker can recover them.
    try {
      const referenced =
        await this.prisma.offlineAttendanceReconciliation.count({
          where: { selfiePublicId: publicId },
        });
      if (referenced) return;
      await this.prisma.reconciliationEvidenceUpload.upsert({
        where: { publicId },
        create: { publicId },
        update: {},
      });
      await this.photoStorage.deleteVerificationPhoto(publicId);
      // Keep the intent for an additional sweep: timed-out provider uploads may
      // finish after immediate compensation has returned "not found".
    } catch {
      /* Durable intent is the retry authority. */
    }
  }

  private async recordOfflineReconciliationRequired(
    employeeId: string,
    dto: OfflineAttendanceSyncDto,
    organizationId: string,
    payloadHash: string,
    capturedAt: Date,
    receivedAt: Date,
    context: VerifiedOfflineAttendanceContext,
    authentication: AuthenticationContext,
    reason: string,
  ) {
    const existing = await this.prisma.offlineAttendanceSyncRequest.findUnique({
      where: { organizationId_clientRequestId: { organizationId, clientRequestId: dto.clientRequestId } },
      select: { id: true },
    });
    if (existing) {
      const request = await this.prisma.offlineAttendanceSyncRequest.findUnique({ where: { id: existing.id }, select: { status: true } });
      if (request?.status === 'RECONCILIATION_REQUIRED') {
        await this.createOfflineReconciliationCaseForRequest({ organizationId, employeeId, dto, payloadHash, capturedAt, receivedAt, context, reason, authentication });
      }
      return this.resolveExistingOfflineSyncRequest(employeeId, dto.clientRequestId, payloadHash, organizationId);
    }

    const policy = context.attendancePolicy;
    await this.attendanceSecurityService.validateEvidence(dto.security, {
      enforceSecurity: true,
      notes: dto.notes,
      requireFreshEvidence: true,
      evidenceReferenceTime: capturedAt,
      authentication,
      site: context.site,
      policyOverride: policy,
    });
    const selfie = dto.security?.verificationPhotoDataUrl;
    const selfieSha256 = selfie ? this.attendanceSecurityService.getPhotoEvidenceFingerprint(selfie) : null;
    if (selfie) {
      await this.assertAttendanceEvidenceNotReused(selfie, organizationId, authentication);
    }
    const storedPhoto = selfie ? await this.uploadReconciliationEvidence(selfie, employeeId, capturedAt, dto.action) : null;
    try {
      await this.prisma.$transaction(async (tx) => {
        await this.lockAttendanceEvidence(tx, selfie, organizationId);
        if (storedPhoto) {
          const intent = await tx.reconciliationEvidenceUpload.deleteMany({ where: { publicId: storedPhoto.publicId } });
          if (intent.count !== 1) throw new ServiceUnavailableException('Evidence upload expired before intake. Please retry.');
        }
        const request = await tx.offlineAttendanceSyncRequest.create({
          data: {
            organizationId, employeeId, clientRequestId: dto.clientRequestId,
            action: dto.action, siteId: context.siteId, payloadHash, capturedAt,
            receivedAt, status: 'RECONCILIATION_REQUIRED', rejectionReason: reason,
            contextSnapshot: context as unknown as Prisma.InputJsonValue,
          }, select: { id: true },
        });
        await tx.offlineAttendanceReconciliation.create({
          data: {
            organizationId, syncRequestId: request.id, employeeId, siteId: context.siteId,
            reasonCode: !context.siteActiveAtIssue || reason.toLowerCase().includes('inactive') ? 'SITE_INACTIVE' : 'HISTORICAL_CONTEXT_CHANGED',
            reason, comments: dto.notes,
            evidenceSnapshot: {
              evidenceCapturedAt: dto.security?.evidenceCapturedAt ?? null,
              latitude: dto.security?.latitude ?? null,
              longitude: dto.security?.longitude ?? null,
              accuracyMeters: dto.security?.accuracyMeters ?? null,
              site: context.site, attendancePolicy: policy,
              selfiePresent: Boolean(selfie), selfieSha256,
            } as Prisma.InputJsonValue,
            selfiePublicId: storedPhoto?.publicId ?? null,
            selfieMimeType: selfie ? (selfie.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,/)?.[1] ?? null) : null,
            selfieByteSize: selfie ? Buffer.byteLength(selfie.split(',')[1] ?? '', 'base64') : null,
            selfieSha256,
          },
        });
      });
    } catch (error) {
      if (storedPhoto) await this.compensateReconciliationEvidence(storedPhoto.publicId);
      const winner = await this.prisma.offlineAttendanceSyncRequest.findUnique({
        where: { organizationId_clientRequestId: { organizationId, clientRequestId: dto.clientRequestId } }, select: { id: true },
      });
      if (!winner) throw error;
      return this.resolveExistingOfflineSyncRequest(employeeId, dto.clientRequestId, payloadHash, organizationId);
    }
    return {
      clientRequestId: dto.clientRequestId,
      state: 'reconciliation_required' as const,
      evidenceAcknowledged: true,
      idempotent: false,
      capturedAt: capturedAt.toISOString(),
      contextId: context.contextId,
      receivedAt: receivedAt.toISOString(),
      error: reason,
    };
  }

  private async createOfflineReconciliationCaseForRequest(input: {
    organizationId: string;
    employeeId: string;
    dto: OfflineAttendanceSyncDto;
    payloadHash: string;
    capturedAt: Date;
    receivedAt: Date;
    context: VerifiedOfflineAttendanceContext;
    reason: string;
    authentication: AuthenticationContext;
  }) {
    const request = await this.prisma.offlineAttendanceSyncRequest.findUnique({
      where: { organizationId_clientRequestId: { organizationId: input.organizationId, clientRequestId: input.dto.clientRequestId } },
      select: { id: true, employeeId: true, payloadHash: true, status: true },
    });
    if (!request || request.employeeId !== input.employeeId || request.payloadHash !== input.payloadHash || !['PROCESSING', 'RECONCILIATION_REQUIRED'].includes(request.status)) {
      throw new ConflictException('Offline reconciliation request could not be verified.');
    }
    const existing = await this.prisma.offlineAttendanceReconciliation.findUnique({ where: { syncRequestId: request.id }, select: { id: true } });
    if (existing) return;

    const selfie = input.dto.security?.verificationPhotoDataUrl;
    const selfieSha256 = selfie ? this.attendanceSecurityService.getPhotoEvidenceFingerprint(selfie) : null;
    await this.attendanceSecurityService.validateEvidence(input.dto.security, {
      enforceSecurity: true, notes: input.dto.notes, requireFreshEvidence: true,
      evidenceReferenceTime: input.capturedAt, authentication: input.authentication,
      site: input.context.site, policyOverride: input.context.attendancePolicy,
    });
    if (selfie) await this.assertAttendanceEvidenceNotReused(selfie, input.organizationId, input.authentication);
    const selfieValid = Boolean(selfie);
    const storedPhoto = selfie ? await this.uploadReconciliationEvidence(selfie, input.employeeId, input.capturedAt, input.dto.action) : null;
    try {
      const created = await this.prisma.$transaction(async (tx) => {
        await this.lockAttendanceEvidence(tx, selfie, input.organizationId);
        await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "OfflineAttendanceSyncRequest" WHERE "id" = ${request.id} AND "organizationId" = ${input.organizationId} FOR UPDATE`);
        const current = await tx.offlineAttendanceSyncRequest.findUnique({ where: { id: request.id }, select: { status: true } });
        if (!current || !['PROCESSING', 'RECONCILIATION_REQUIRED'].includes(current.status)) return false;
        if (storedPhoto) {
          const intent = await tx.reconciliationEvidenceUpload.deleteMany({ where: { publicId: storedPhoto.publicId } });
          if (intent.count !== 1) throw new ServiceUnavailableException('Evidence upload expired before intake. Please retry.');
        }
        await tx.offlineAttendanceSyncRequest.updateMany({
          where: { id: request.id, status: 'PROCESSING' },
          data: { status: 'RECONCILIATION_REQUIRED', rejectionReason: input.reason },
        });
        await tx.offlineAttendanceReconciliation.create({ data: {
          organizationId: input.organizationId, syncRequestId: request.id,
          employeeId: input.employeeId, siteId: input.context.siteId,
          reasonCode: 'HISTORICAL_ATTENDANCE_REQUIRES_REVIEW', reason: input.reason,
          comments: input.dto.notes,
          evidenceSnapshot: {
            evidenceCapturedAt: input.dto.security?.evidenceCapturedAt ?? null,
            latitude: input.dto.security?.latitude ?? null,
            longitude: input.dto.security?.longitude ?? null,
            accuracyMeters: input.dto.security?.accuracyMeters ?? null,
            site: input.context.site, scheduleSnapshots: input.context.scheduleSnapshots,
            nonWorkingDates: input.context.nonWorkingDates,
            attendancePolicy: input.context.attendancePolicy,
            selfiePresent: Boolean(selfie), selfieSha256,
            selfieValidation: selfie ? (selfieValid ? (storedPhoto ? 'STORED' : 'UPLOAD_FAILED') : 'INVALID') : 'NOT_PROVIDED',
          } as Prisma.InputJsonValue,
          selfiePublicId: storedPhoto?.publicId ?? null,
          selfieMimeType: storedPhoto ? selfie?.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,/)?.[1] ?? null : null,
          selfieByteSize: storedPhoto && selfie ? Buffer.byteLength(selfie.split(',')[1] ?? '', 'base64') : null,
          selfieSha256: storedPhoto ? selfieSha256 : null,
        } });
        return true;
      });
      if (!created && storedPhoto) await this.compensateReconciliationEvidence(storedPhoto.publicId);
    } catch (error) {
      if (storedPhoto) await this.compensateReconciliationEvidence(storedPhoto.publicId);
      // A concurrent retry of this exact verified request may have won intake.
      if (await this.prisma.offlineAttendanceReconciliation.findUnique({ where: { syncRequestId: request.id }, select: { id: true } })) return;
      throw error;
    }
  }

  private async applyOfflineAttendance(
    employeeId: string,
    dto: OfflineAttendanceSyncDto,
    authentication: AuthenticationContext,
    eventTime: Date,
    offlineContext?: VerifiedOfflineAttendanceContext | null,
    syncRequest?: {
      id: string;
      organizationId: string;
      employeeId: string;
      receivedAt: Date;
    },
  ) {
    const site = offlineContext
      ? {
          ...offlineContext.site,
          isActive: true,
          organizationId: offlineContext.organizationId,
        }
      : await this.resolveAttendanceSite(authentication, dto.siteId);
    await this.attendanceSecurityService.validateEvidence(dto.security, {
      enforceSecurity: true,
      notes: dto.notes,
      requireFreshEvidence: authentication.generation !== 'legacy',
      evidenceReferenceTime: eventTime,
      authentication,
      site,
      policyOverride: offlineContext?.attendancePolicy,
    });
    await this.assertAttendanceEvidenceNotReused(
      dto.security?.verificationPhotoDataUrl,
      this.tenantId(authentication),
      authentication,
    );

    const payload = {
      notes: dto.notes,
      security: dto.security,
      siteId: site?.id,
    };

    // Keep offline authorization, site, schedule, security, and persistence on
    // the same attendance engine as online self-service. Only the trusted
    // timestamp source differs: this value was validated at sync ingress.
    return dto.action === OfflineAttendanceAction.CHECK_IN
      ? this.recordCheckIn(
          employeeId,
          payload,
          { enforceSecurity: true, eventTime, offlineContext, syncRequest },
          authentication,
        )
      : this.recordCheckOut(
          employeeId,
          payload,
          { enforceSecurity: true, eventTime, offlineContext, syncRequest },
          authentication,
        );
  }

  private async synchronizeLegacyOfflineAttendance(
    employeeId: string,
    dto: OfflineAttendanceSyncDto,
    authentication: AuthenticationContext,
    capturedAt: Date,
    receivedAt: Date,
  ) {
    const organizationId = this.tenantId(authentication);

    try {
      const attendance = await this.applyOfflineAttendance(
        employeeId,
        dto,
        authentication,
        capturedAt,
      );

      return {
        clientRequestId: dto.clientRequestId,
        state: 'accepted' as const,
        idempotent: false,
        capturedAt: dto.capturedAt,
        receivedAt: receivedAt.toISOString(),
        attendance,
      };
    } catch (error) {
      if (!(error instanceof ConflictException)) {
        throw error;
      }

      const attendance = await this.prisma.attendance.findFirst({
        where: {
          employeeId,
          date: getBusinessDate(
            receivedAt,
            await this.resolveTimezone(authentication),
          ),
          ...this.attendanceTenantWhere(organizationId),
        },
        select: attendanceWithEmployeeSelect,
      });
      const actionAlreadyApplied =
        dto.action === OfflineAttendanceAction.CHECK_IN
          ? Boolean(attendance?.clockInAt)
          : Boolean(attendance?.clockOutAt);

      if (!attendance || !actionAlreadyApplied) {
        throw error;
      }

      return {
        clientRequestId: dto.clientRequestId,
        state: 'accepted' as const,
        idempotent: true,
        capturedAt: dto.capturedAt,
        receivedAt: receivedAt.toISOString(),
        attendance,
      };
    }
  }

  private getOfflineSyncPayloadHash(
    employeeId: string,
    dto: OfflineAttendanceSyncDto,
  ) {
    return createHash('sha256')
      .update(
        JSON.stringify({
          employeeId,
          action: dto.action,
          siteId: dto.siteId ?? null,
          capturedAt: dto.capturedAt,
          notes: dto.notes ?? null,
          security: dto.security ?? null,
          contextToken: dto.contextToken ?? null,
        }),
      )
      .digest('hex');
  }

  private async resolveExistingOfflineSyncRequest(
    employeeId: string,
    clientRequestId: string,
    payloadHash: string,
    organizationId: string,
  ) {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const request = await this.prisma.offlineAttendanceSyncRequest.findUnique(
        {
          where: {
            organizationId_clientRequestId: {
              organizationId,
              clientRequestId,
            },
          },
        },
      );
      if (!request) {
        throw new ServiceUnavailableException(
          'Offline synchronization state is temporarily unavailable.',
        );
      }
      if (
        request.employeeId !== employeeId ||
        request.payloadHash !== payloadHash
      ) {
        throw new ConflictException(
          'clientRequestId was already used for another offline attendance payload.',
        );
      }
      if (request.status === 'EXPIRED') {
        return {
          clientRequestId,
          state: 'expired' as const,
          idempotent: true,
          capturedAt: request.capturedAt.toISOString(),
          receivedAt: request.receivedAt.toISOString(),
          contextId: request.contextSnapshot &&
              typeof request.contextSnapshot === 'object' &&
              !Array.isArray(request.contextSnapshot) &&
              'contextId' in request.contextSnapshot
            ? String(request.contextSnapshot.contextId)
            : null,
        };
      }
      if (request.status === 'RECONCILIATION_REQUIRED') {
        return {
          clientRequestId,
          state: 'reconciliation_required' as const,
          evidenceAcknowledged: await this.reconciliationEvidenceAcknowledged(request.id),
          idempotent: true,
          capturedAt: request.capturedAt.toISOString(),
          receivedAt: request.receivedAt.toISOString(),
        };
      }
      if (request.status === 'REJECTED') {
        throw new BadRequestException(
          request.rejectionReason ?? 'Offline attendance was rejected.',
        );
      }
      if (request.status === 'ACCEPTED' && request.attendanceId) {
        const attendance = await this.getAttendanceById(
          request.attendanceId,
          organizationId,
        );
        return {
          clientRequestId,
          state: 'accepted' as const,
          idempotent: true,
          capturedAt: request.capturedAt.toISOString(),
          receivedAt: request.receivedAt.toISOString(),
          attendance,
        };
      }
      if (Date.now() - request.updatedAt.getTime() > 2 * 60_000) {
        const staleTransition = await this.prisma.offlineAttendanceSyncRequest.updateMany({
          where: { id: request.id, status: 'PROCESSING' },
          data: {
            status: 'RECONCILIATION_REQUIRED',
            rejectionReason:
              'Synchronization was interrupted before the attendance result could be proven. Reconciliation is required.',
          },
        });
        if (staleTransition.count === 0) continue;
        throw new ConflictException(
          'Synchronization was interrupted; reconciliation is required.',
        );
      }
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    throw new ServiceUnavailableException(
      'Offline synchronization is still processing. Retry shortly.',
    );
  }

  private isPermanentOfflineSyncError(error: unknown) {
    if (!(error instanceof HttpException)) return false;
    const status = error.getStatus();
    return (
      status >= HttpStatus.BAD_REQUEST &&
      status < HttpStatus.INTERNAL_SERVER_ERROR &&
      status !== HttpStatus.TOO_MANY_REQUESTS
    );
  }

  private isUniqueConstraintError(error: unknown) {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    );
  }

  private async queryAttendanceHistory(
    query: AttendanceHistoryQueryDto,
    employeeId?: string,
    authentication?: AuthenticationContext,
    siteId?: string,
  ) {
    const organizationId = this.tenantId(authentication);
    const timezone = await this.resolveTimezone(authentication);
    const { start, end } = this.getHistoryRange(
      query,
      timezone,
      authentication?.generation === 'saas',
    );
    await this.entitlements.assertHistoryAllowed(organizationId, start);
    const scopedEmployeeId = employeeId ?? query.employeeId;
    if (query.employeeId && !employeeId) {
      const employee = await this.prisma.employee.findFirst({
        where: {
          id: query.employeeId,
          ...this.employeeScheduleTenantWhere(organizationId),
        },
        select: { id: true },
      });
      if (!employee) {
        throw new NotFoundException('Employee not found.');
      }
    }
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 50;
    const where: Prisma.AttendanceWhereInput = {
      date: { gte: start, lt: end },
      ...(siteId ? { attendanceSiteId: siteId } : {}),
      ...(scopedEmployeeId ? { employeeId: scopedEmployeeId } : {}),
      ...this.attendanceHistoryFilterWhere(query),
      ...this.attendanceTenantWhere(organizationId),
    };

    // Keep the established monthly endpoint contract for Legacy clients. New
    // clients opt into the bounded, counted response by sending page/pageSize.
    if (query.page === undefined && query.pageSize === undefined) {
      return this.prisma.attendance.findMany({
        where,
        select: attendanceWithEmployeeSelect,
        orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      });
    }
    const [items, total] = await this.prisma.$transaction([
      this.prisma.attendance.findMany({
        where: {
          ...where,
        },
        select: attendanceWithEmployeeSelect,
        orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.attendance.count({ where }),
    ]);

    return {
      items,
      organizationTimezone:
        authentication?.generation === 'saas' ? timezone : null,
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
      period: {
        startDate: start.toISOString(),
        endDate: addAttendanceDays(end, -1).toISOString(),
      },
    };
  }

  private getHistoryRange(
    query: AttendanceHistoryQueryDto,
    timezone = 'UTC',
    strictDateKeys = false,
  ) {
    if (query.startDate || query.endDate) {
      if (!query.startDate || !query.endDate) {
        throw new BadRequestException(
          'startDate and endDate must be provided together.',
        );
      }
      const start = strictDateKeys
        ? parseAttendanceDateKey(query.startDate)
        : normalizeAttendanceDate(new Date(query.startDate));
      const inclusiveEnd = strictDateKeys
        ? parseAttendanceDateKey(query.endDate)
        : normalizeAttendanceDate(new Date(query.endDate));
      if (
        !start ||
        !inclusiveEnd ||
        Number.isNaN(start.getTime()) ||
        Number.isNaN(inclusiveEnd.getTime()) ||
        inclusiveEnd < start
      ) {
        throw new BadRequestException(
          'The attendance history date range is invalid.',
        );
      }
      return { start, end: addAttendanceDays(inclusiveEnd, 1) };
    }
    return this.getMonthRange(query.month, timezone);
  }

  private attendanceHistoryFilterWhere(
    query: AttendanceHistoryQueryDto,
  ): Prisma.AttendanceWhereInput {
    const clauses: Prisma.AttendanceWhereInput[] = [];
    const filters = query.status ?? [];
    if (filters.length) {
      clauses.push({
        OR: filters.map((filter) => this.historyStatusWhere(filter)),
      });
    }
    if (query.attendance === 'checked-in')
      clauses.push({ clockInAt: { not: null } });
    if (query.attendance === 'checked-out')
      clauses.push({ clockOutAt: { not: null } });
    if (query.attendance === 'incomplete')
      clauses.push({ clockInAt: { not: null }, clockOutAt: null });
    return clauses.length ? { AND: clauses } : {};
  }

  private historyStatusWhere(
    filter: AttendanceHistoryStatusFilter,
  ): Prisma.AttendanceWhereInput {
    switch (filter) {
      case 'present':
        return {
          status: AttendanceStatus.PRESENT,
          minutesLate: 0,
          earlyExit: false,
          overtimeHours: 0,
          overtimeMinutes: 0,
        };
      case 'late':
        return { minutesLate: { gt: 0 } };
      case 'absent':
        return { status: AttendanceStatus.ABSENT };
      case 'non-working-day-work':
        return { status: AttendanceStatus.NON_WORKING_DAY_WORK };
      case 'early-exit':
        return { OR: [{ earlyExit: true }, { earlyExitMinutes: { gt: 0 } }] };
      case 'overtime':
        return {
          OR: [{ overtimeHours: { gt: 0 } }, { overtimeMinutes: { gt: 0 } }],
        };
      case 'incomplete':
        return {
          OR: [
            { status: AttendanceStatus.INCOMPLETE },
            { clockInAt: { not: null }, clockOutAt: null },
          ],
        };
    }
  }

  private async recordCheckIn(
    employeeId: string,
    payload: {
      occurredAt?: string;
      notes?: string;
      security?: CheckInSecurityProofDto;
      siteId?: string;
    },
    options: {
      enforceSecurity: boolean;
      serverAuthoritativeTimestamp?: boolean;
      /** Internal only. Never populated from public/admin attendance DTOs. */
      eventTime?: Date;
      offlineContext?: VerifiedOfflineAttendanceContext | null;
      reconciliationCorrection?: boolean;
      syncRequest?: { id: string; organizationId: string; employeeId: string; receivedAt: Date };
    },
    authentication?: AuthenticationContext,
  ) {
    const organizationId = this.tenantId(authentication);
    const timezone = options.offlineContext?.timeZone ?? await this.resolveTimezone(authentication);
    const site = authentication
      ? options.offlineContext
        ? await this.resolveContextSite(options.offlineContext, organizationId)
        : await this.resolveAttendanceSite(authentication, payload.siteId)
      : null;
    const employee = await this.getActiveEmployeeWithSchedule(
      employeeId,
      organizationId,
    );
    const occurredAt = this.resolveAttendanceEventTime(
      options,
      payload.occurredAt,
      authentication,
    );
    const date = getBusinessDate(occurredAt, timezone);
    const effectiveAssignment = options.reconciliationCorrection && options.offlineContext
      ? await this.prisma.employeeSiteAssignment.findFirst({ where: { id: options.offlineContext.scheduleSnapshots.find(entry => entry.businessDate === date.toISOString().slice(0, 10))?.siteAssignmentId ?? options.offlineContext.siteAssignmentId, organizationId, employeeId, siteId: site?.id }, select: { id: true, siteId: true } })
      : organizationId && site
      ? await this.prisma.employeeSiteAssignment.findFirst({
        where: {
          organizationId,
          employeeId: employee.id,
          ...(options.offlineContext ? { siteId: options.offlineContext.siteId } : {}),
          effectiveFrom: { lte: date },
          OR: [{ effectiveTo: null }, { effectiveTo: { gt: date } }],
        },
        select: { id: true, siteId: true },
      })
      : null;
    if (organizationId && site) {
      if (
        !effectiveAssignment ||
        effectiveAssignment.siteId !== site.id ||
        (options.offlineContext && !options.reconciliationCorrection &&
          effectiveAssignment.id !== options.offlineContext.siteAssignmentId)
      ) {
        if (options.reconciliationCorrection) throw new ConflictException('Original employee site assignment is unavailable.');
        throw new ForbiddenException('Employee is not assigned to this attendance site.');
      }
      if (
        !options.offlineContext &&
        date.getTime() === getBusinessDate(new Date(), timezone).getTime()
      ) {
        await this.prisma.employee.updateMany({
          where: { id: employee.id, organizationId, NOT: { primarySiteId: site.id } },
          data: { primarySiteId: site.id },
        });
      }
    }
    const existingAttendance = await this.prisma.attendance.findFirst({
      where: {
        employeeId: employee.id,
        date,
        ...this.attendanceTenantWhere(organizationId),
      },
      select: {
        id: true,
        date: true,
        clockInAt: true,
        clockOutAt: true,
        scheduledExitTime: true,
        notes: true,
        attendanceSiteId: true,
      },
    });
    if (options.reconciliationCorrection && existingAttendance) throw new ConflictException('Existing attendance requires an explicit administrative correction.');
    const historicalSnapshot = options.offlineContext?.scheduleSnapshots.find(entry => entry.businessDate === date.toISOString().slice(0, 10));
    const historicalSchedule = historicalSnapshot ? historicalSnapshot.schedule : options.offlineContext?.schedule;
    const effectiveSchedule = options.reconciliationCorrection
      ? historicalSchedule ? { ...historicalSchedule, isActive: true, workDays: historicalSchedule.workDays as Prisma.JsonValue } : null
      : options.offlineContext
      ? await this.resolveContextSchedule(options.offlineContext, date, effectiveAssignment?.id)
      : await this.resolveEffectiveSchedule(employee.id, organizationId, date, employee.schedule);
    const isNonWorkingDay = options.offlineContext
      ? options.offlineContext.nonWorkingDates.includes(date.toISOString().slice(0, 10))
      : await this.calendarService.isNonWorkingDay(date, authentication, site?.id);
    const { minutesLate, status } = this.getCheckInOutcome(
      effectiveSchedule,
      occurredAt,
      date,
      timezone,
      isNonWorkingDay,
    );
    const scheduledExitTime = this.getScheduledExitTime(
      effectiveSchedule,
      date,
      timezone,
      status === AttendanceStatus.NON_WORKING_DAY_WORK,
    );
    const scheduleSnapshot = buildAttendanceScheduleSnapshot(
      effectiveSchedule,
      occurredAt,
    );
    const absenceCount = await this.getMonthlyAbsenceCount(
      employee.id,
      occurredAt,
      date,
      organizationId,
      authentication,
      employee.schedule,
    );

    if (existingAttendance?.clockInAt) {
      throw new ConflictException(
        'A check-in has already been recorded for this attendance day.',
      );
    }

    if (existingAttendance?.clockOutAt) {
      throw new ConflictException(
        'Cannot record a new check-in after the attendance has been checked out.',
      );
    }

    await this.assertAttendanceEvidenceNotReused(
      payload.security?.verificationPhotoDataUrl,
      organizationId,
      authentication,
    );

    const securityMetadata =
      options.reconciliationCorrection ? {} : await this.attendanceSecurityService.evaluateCheckIn(payload.security, {
        ...options,
        employeeId: employee.id,
        occurredAt,
        notes: payload.notes,
        requireFreshEvidence: authentication?.generation !== 'legacy',
        evidenceReferenceTime: options.eventTime,
        authentication,
        site,
        policyOverride: options.offlineContext?.attendancePolicy,
      });

    if (existingAttendance) {
      const persist = async (tx: Prisma.TransactionClient) => {
        await this.lockAttendanceEvidence(tx, payload.security?.verificationPhotoDataUrl, organizationId);
        const updateResult = await tx.attendance.updateMany({
          where: {
            id: existingAttendance.id,
            clockInAt: null,
            clockOutAt: null,
            ...this.attendanceTenantWhere(organizationId),
          },
          data: {
            clockInAt: occurredAt,
            outsideScheduleWork: false,
            scheduledExitTime,
            earlyExit: false,
            earlyExitMinutes: 0,
            lateExit: false,
            overtimeHours: 0,
            overtimeMinutes: 0,
            absenceCount,
            minutesLate,
            status,
            calendarNonWorkingDaySnapshot: isNonWorkingDay,
            notes: payload.notes ?? existingAttendance.notes ?? null,
            attendanceSiteId: site?.id ?? null,
            employeeSiteAssignmentId: effectiveAssignment?.id ?? null,
            ...scheduleSnapshot,
            ...securityMetadata,
            checkInSelfieSha256: payload.security?.verificationPhotoDataUrl ? this.attendanceSecurityService.getPhotoEvidenceFingerprint(payload.security.verificationPhotoDataUrl) : undefined,
          },
        });
        if (updateResult.count === 0) {
          throw new ConflictException(
            'A check-in has already been recorded for this attendance day.',
          );
        }
        const updated = await tx.attendance.findFirst({
          where: { id: existingAttendance.id, ...this.attendanceTenantWhere(organizationId) },
          select: attendanceWithEmployeeSelect,
        });
        if (!updated) throw new NotFoundException('Attendance record not found.');
        return updated;
      };
      return options.syncRequest
        ? this.commitOfflineAttendanceWrite(options.syncRequest, options.offlineContext, persist)
        : options.reconciliationCorrection
          ? persist(this.prisma as unknown as Prisma.TransactionClient)
          : this.prisma.$transaction(persist);
    }

    const persist = async (tx: Prisma.TransactionClient) => {
        await this.lockAttendanceEvidence(tx, payload.security?.verificationPhotoDataUrl, organizationId);
      try {
        return await tx.attendance.create({
        data: {
          employeeId: employee.id,
          organizationId: organizationId ?? null,
          attendanceSiteId: site?.id ?? null,
          employeeSiteAssignmentId: effectiveAssignment?.id ?? null,
          ...operationalScopeCreateData(organizationId),
          date,
          clockInAt: occurredAt,
          outsideScheduleWork: false,
          scheduledExitTime,
          earlyExit: false,
          earlyExitMinutes: 0,
          lateExit: false,
          overtimeHours: 0,
          overtimeMinutes: 0,
          absenceCount,
          minutesLate,
          status,
          calendarNonWorkingDaySnapshot: isNonWorkingDay,
          notes: payload.notes ?? null,
          ...scheduleSnapshot,
          ...securityMetadata,
          checkInSelfieSha256: payload.security?.verificationPhotoDataUrl ? this.attendanceSecurityService.getPhotoEvidenceFingerprint(payload.security.verificationPhotoDataUrl) : undefined,
        },
        select: attendanceWithEmployeeSelect,
      });
      } catch (error) {
      if (this.isEmployeeDateConstraintError(error)) {
        throw new ConflictException(
          'A check-in has already been recorded for this attendance day.',
        );
      }

      throw error;
      }
    };
    return options.syncRequest
      ? this.commitOfflineAttendanceWrite(options.syncRequest, options.offlineContext, persist)
      : options.reconciliationCorrection
          ? persist(this.prisma as unknown as Prisma.TransactionClient)
          : this.prisma.$transaction(persist);
  }

  private async recordCheckOut(
    employeeId: string,
    payload: {
      occurredAt?: string;
      notes?: string;
      security?: CheckInSecurityProofDto;
      siteId?: string;
    },
    options: {
      enforceSecurity: boolean;
      serverAuthoritativeTimestamp?: boolean;
      /** Internal only. Never populated from public/admin attendance DTOs. */
      eventTime?: Date;
      offlineContext?: VerifiedOfflineAttendanceContext | null;
      reconciliationCorrection?: boolean;
      syncRequest?: { id: string; organizationId: string; employeeId: string; receivedAt: Date };
    },
    authentication?: AuthenticationContext,
  ) {
    const organizationId = this.tenantId(authentication);
    const timezone = options.offlineContext?.timeZone ?? await this.resolveTimezone(authentication);
    const site = authentication
      ? options.offlineContext
        ? await this.resolveContextSite(options.offlineContext, organizationId)
        : await this.resolveAttendanceSite(authentication, payload.siteId)
      : null;
    const occurredAt = this.resolveAttendanceEventTime(
      options,
      payload.occurredAt,
      authentication,
    );
    const date = getBusinessDate(occurredAt, timezone);
    const attendance = await this.prisma.attendance.findFirst({
      where: {
        employeeId,
        date: { in: [date, addAttendanceDays(date, -1)] },
        ...this.attendanceTenantWhere(organizationId),
        employee: {
          is: this.employeeScheduleTenantWhere(organizationId),
        },
      },
      orderBy: { date: 'desc' },
      select: {
        id: true,
        date: true,
        clockInAt: true,
        clockOutAt: true,
        outsideScheduleWork: true,
        calendarNonWorkingDaySnapshot: true,
        scheduledExitTime: true,
        minutesLate: true,
        attendanceSiteId: true,
        employeeSiteAssignmentId: true,
        scheduleIdSnapshot: true,
        scheduleNameSnapshot: true,
        scheduleStartTimeSnapshot: true,
        scheduleEndTimeSnapshot: true,
        scheduleWorkDaysSnapshot: true,
        scheduleLatenessMarginSnapshot: true,
        scheduleCapturedAt: true,
        employee: {
          select: {
            schedule: {
              select: scheduleSelect,
            },
          },
        },
      },
    });

    if (!attendance?.clockInAt) {
      throw new BadRequestException(
        'Cannot check out before a check-in has been recorded.',
      );
    }

    if (options.reconciliationCorrection && options.offlineContext) {
      const originalSchedule = options.offlineContext.scheduleSnapshots.find(entry => entry.businessDate === attendance.date.toISOString().slice(0, 10))?.schedule;
      const originalAssignmentId = options.offlineContext.scheduleSnapshots.find(entry => entry.businessDate === attendance.date.toISOString().slice(0, 10))?.siteAssignmentId;
      const originalCalendar = options.offlineContext.nonWorkingDates.includes(attendance.date.toISOString().slice(0, 10));
      if (!originalSchedule || !hasAttendanceScheduleSnapshot(attendance) || attendance.scheduleIdSnapshot !== originalSchedule.id ||
          attendance.employeeSiteAssignmentId !== originalAssignmentId || attendance.scheduleNameSnapshot !== originalSchedule.name ||
          attendance.scheduleStartTimeSnapshot !== originalSchedule.startTime || attendance.scheduleEndTimeSnapshot !== originalSchedule.endTime ||
          attendance.scheduleLatenessMarginSnapshot !== originalSchedule.latenessMarginMinutes ||
          JSON.stringify(attendance.scheduleWorkDaysSnapshot) !== JSON.stringify(originalSchedule.workDays) ||
          attendance.calendarNonWorkingDaySnapshot !== originalCalendar) {
        throw new ConflictException('Original schedule/calendar conflicts with the persisted attendance session.');
      }
    }

    const effectiveSchedule = hasAttendanceScheduleSnapshot(attendance)
      ? null
      : await this.resolveEffectiveSchedule(
          employeeId,
          organizationId,
          attendance.date,
          attendance.employee.schedule,
        );
    if (
      organizationId &&
      !hasAttendanceScheduleSnapshot(attendance) &&
      !effectiveSchedule
    ) {
      throw new BadRequestException(
        'The historical schedule assignment for this attendance record is unavailable.',
      );
    }
    const resolvedSchedule = resolveAttendanceSchedule(
      attendance,
      effectiveSchedule,
    );
    const isPreviousBusinessDay = attendance.date.getTime() !== date.getTime();
    const isOvernightSchedule = Boolean(
      resolvedSchedule.startTime &&
      resolvedSchedule.endTime &&
      resolvedSchedule.endTime <= resolvedSchedule.startTime,
    );
    if (isPreviousBusinessDay && !isOvernightSchedule) {
      throw new BadRequestException(
        'Cannot check out before a check-in has been recorded.',
      );
    }

    if (
      authentication?.generation === 'saas' &&
      attendance.attendanceSiteId !== site?.id
    ) {
      throw new BadRequestException(
        'Check-out must use the original attendance site.',
      );
    }

    if (attendance.clockOutAt) {
      throw new ConflictException(
        'A check-out has already been recorded for this attendance day.',
      );
    }

    if (occurredAt.getTime() < attendance.clockInAt.getTime()) {
      throw new BadRequestException(
        'Check-out time cannot be earlier than check-in time.',
      );
    }

    await this.assertAttendanceEvidenceNotReused(
      payload.security?.verificationPhotoDataUrl,
      organizationId,
      authentication,
    );

    const securityMetadata =
      options.reconciliationCorrection ? {} : await this.attendanceSecurityService.evaluateCheckOut(payload.security, {
        ...options,
        employeeId,
        occurredAt,
        notes: payload.notes,
        requireFreshEvidence: authentication?.generation !== 'legacy',
        evidenceReferenceTime: options.eventTime,
        authentication,
        site,
        policyOverride: options.offlineContext?.attendancePolicy,
      });
    const isNonWorkingDay = attendance.calendarNonWorkingDaySnapshot ?? (
      options.offlineContext
        ? options.offlineContext.nonWorkingDates.includes(attendance.date.toISOString().slice(0, 10))
        : await this.calendarService.isNonWorkingDay(
          attendance.date,
          authentication,
          attendance.attendanceSiteId ?? undefined,
        )
    );
    const isOutsideScheduleWork =
      Boolean(attendance.clockInAt) &&
      (isNonWorkingDay ||
        !isScheduledOnResolvedAttendanceDate(
          resolvedSchedule,
          attendance.date,
        ));
    const scheduledExitTime = isNonWorkingDay
      ? null
      : (attendance.scheduledExitTime ??
        this.getResolvedScheduledExitTime(
          resolvedSchedule,
          attendance.date,
          timezone,
        ));
    const exitOutcome = isOutsideScheduleWork
      ? getOutsideScheduleAttendanceOutcome(attendance.clockInAt, occurredAt)
      : getAttendanceCheckOutOutcome(scheduledExitTime, occurredAt);
    const absenceCount = await this.getMonthlyAbsenceCount(
      employeeId,
      occurredAt,
      attendance.date,
      organizationId,
      authentication,
      attendance.employee.schedule,
    );

    const persist = async (tx: Prisma.TransactionClient) => {
        await this.lockAttendanceEvidence(tx, payload.security?.verificationPhotoDataUrl, organizationId);
      const updateResult = await tx.attendance.updateMany({
        where: {
          id: attendance.id,
          clockInAt: { not: null },
          clockOutAt: null,
          ...this.attendanceTenantWhere(organizationId),
        },
        data: {
          clockOutAt: occurredAt,
          calendarNonWorkingDaySnapshot:
            attendance.calendarNonWorkingDaySnapshot ?? isNonWorkingDay,
          outsideScheduleWork: isOutsideScheduleWork,
          scheduledExitTime: exitOutcome.scheduledExitTime,
          earlyExit: exitOutcome.earlyExit,
          earlyExitMinutes: exitOutcome.earlyExitMinutes,
          lateExit: exitOutcome.lateExit,
          overtimeHours: exitOutcome.overtimeHours,
          overtimeMinutes: exitOutcome.overtimeMinutes,
          absenceCount,
          notes: payload.notes ?? undefined,
          status: isNonWorkingDay
            ? AttendanceStatus.NON_WORKING_DAY_WORK
            : isOutsideScheduleWork
              ? AttendanceStatus.PRESENT
              : this.getCompletedStatus(attendance.minutesLate),
          ...securityMetadata,
          checkOutSelfieSha256: payload.security?.verificationPhotoDataUrl ? this.attendanceSecurityService.getPhotoEvidenceFingerprint(payload.security.verificationPhotoDataUrl) : undefined,
        },
      });
      if (updateResult.count === 0) {
        throw new ConflictException(
          'A check-out has already been recorded for this attendance day.',
        );
      }
      const updated = await tx.attendance.findFirst({
        where: { id: attendance.id, ...this.attendanceTenantWhere(organizationId) },
        select: attendanceWithEmployeeSelect,
      });
      if (!updated) throw new NotFoundException('Attendance record not found.');
      return updated;
    };
    return options.syncRequest
      ? this.commitOfflineAttendanceWrite(options.syncRequest, options.offlineContext, persist)
      : options.reconciliationCorrection
          ? persist(this.prisma as unknown as Prisma.TransactionClient)
          : this.prisma.$transaction(persist);
  }

  private async getActiveEmployeeWithSchedule(
    employeeId: string,
    organizationId?: string,
  ) {
    const employee = await this.prisma.employee.findFirst({
      where: {
        id: employeeId,
        ...this.employeeScheduleTenantWhere(organizationId),
      },
      select: {
        id: true,
        isActive: true,
        schedule: {
          select: scheduleSelect,
        },
      },
    });

    if (!employee || !employee.isActive) {
      throw new NotFoundException('Employee not found.');
    }

    return employee;
  }

  private resolveAttendanceSite(
    authentication: AuthenticationContext,
    requestedSiteId?: string,
  ) {
    if (authentication.generation === 'legacy') return Promise.resolve(null);
    if (!this.attendanceSites) {
      throw new ServiceUnavailableException(
        'Attendance site resolution is unavailable.',
      );
    }
    return this.attendanceSites.resolveActiveAttendanceSite(
      authentication,
      requestedSiteId,
    );
  }

  private async commitOfflineAttendanceWrite<T extends { id: string }>(
    request: {
      id: string;
      organizationId: string;
      employeeId: string;
      receivedAt: Date;
    },
    context: VerifiedOfflineAttendanceContext | null | undefined,
    persist: (tx: Prisma.TransactionClient) => Promise<T>,
  ) {
    return this.prisma.$transaction(async (tx) => {
      if (context) {
        const sites = await tx.$queryRaw<Array<{
          id: string;
          isActive: boolean;
          statusChangedAt: Date;
        }>>(Prisma.sql`
          SELECT "id", "isActive", "statusChangedAt"
          FROM "AttendanceSite"
          WHERE "id" = ${context.siteId}
            AND "organizationId" = ${request.organizationId}
          FOR UPDATE
        `);
        const site = sites[0];
        if (!site) {
          throw new ForbiddenException(
            'Offline attendance site is not owned by this organization.',
          );
        }
        if (
          !site.isActive ||
          !context.siteStatusChangedAtAtIssue ||
          !Number.isFinite(Date.parse(context.siteStatusChangedAtAtIssue)) ||
          site.statusChangedAt.getTime() !== Date.parse(context.siteStatusChangedAtAtIssue)
        ) {
          throw new ConflictException(
            'Attendance site changed after context issuance; reconciliation is required.',
          );
        }
      }

      const attendance = await persist(tx);
      const finalized = await tx.offlineAttendanceSyncRequest.updateMany({
        where: {
          id: request.id,
          organizationId: request.organizationId,
          employeeId: request.employeeId,
          status: 'PROCESSING',
        },
        data: {
          status: 'ACCEPTED',
          attendanceId: attendance.id,
          receivedAt: request.receivedAt,
        },
      });
      if (finalized.count !== 1) {
        throw new ConflictException(
          'Offline synchronization state changed; reconciliation is required.',
        );
      }
      return attendance;
    });
  }

  private async resolveContextSite(
    context: VerifiedOfflineAttendanceContext,
    organizationId?: string,
  ) {
    if (!organizationId || context.organizationId !== organizationId) {
      throw new ForbiddenException('Offline attendance context tenant mismatch.');
    }
    const ownedSite = await this.prisma.attendanceSite.findFirst({
      where: { id: context.siteId, organizationId },
      select: { id: true },
    });
    if (!ownedSite) {
      throw new ForbiddenException('Offline attendance site is not owned by this organization.');
    }
    return { ...context.site, id: ownedSite.id };
  }

  private async resolveContextSchedule(
    context: VerifiedOfflineAttendanceContext,
    businessDate: Date,
    siteAssignmentId?: string,
  ) {
    const snapshot = context.scheduleSnapshots.find(
      (entry) => entry.businessDate === businessDate.toISOString().slice(0, 10),
    );
    const schedule = snapshot ? snapshot.schedule : context.schedule;
    const scheduleAssignmentId = snapshot
      ? snapshot.scheduleAssignmentId
      : context.scheduleAssignmentId;
    const expectedSiteAssignmentId = snapshot
      ? snapshot.siteAssignmentId
      : context.siteAssignmentId;
    if (!schedule || !scheduleAssignmentId || !siteAssignmentId) {
      return null;
    }
    if (siteAssignmentId !== expectedSiteAssignmentId) {
      throw new ConflictException('Offline site assignment requires reconciliation.');
    }
    const assignment = await this.prisma.employeeScheduleAssignment.findFirst({
      where: {
        id: scheduleAssignmentId,
        organizationId: context.organizationId,
        employeeId: context.employeeId,
        siteId: context.siteId,
        employeeSiteAssignmentId: siteAssignmentId,
        effectiveFrom: { lte: businessDate },
        OR: [{ effectiveTo: null }, { effectiveTo: { gt: businessDate } }],
      },
      select: { id: true },
    });
    if (!assignment) {
      throw new ConflictException('Offline schedule assignment requires reconciliation.');
    }
    return {
      ...schedule,
      isActive: true,
      workDays: schedule.workDays as Prisma.JsonValue,
    };
  }

  private resolveTimezone(authentication?: AuthenticationContext) {
    return (
      this.organizationTimezones ?? new OrganizationTimezoneService(this.prisma)
    ).resolve(authentication);
  }

  private validateOfflineCapturedAt(value: string, receivedAt: Date) {
    const capturedAt = new Date(value);
    if (!value || Number.isNaN(capturedAt.getTime())) {
      throw new BadRequestException(
        'capturedAt must be a valid ISO-8601 date-time string.',
      );
    }

    if (capturedAt.getTime() > receivedAt.getTime() + OFFLINE_ATTENDANCE_FUTURE_SKEW_MS) {
      throw new BadRequestException('capturedAt exceeds the allowed two-minute clock skew.');
    }
    return capturedAt;
  }

  private resolveAttendanceEventTime(
    options: {
      serverAuthoritativeTimestamp?: boolean;
      eventTime?: Date;
      offlineContext?: VerifiedOfflineAttendanceContext | null;
    },
    occurredAt: string | undefined,
    authentication?: AuthenticationContext,
  ) {
    if (options.eventTime) {
      if (
        Number.isNaN(options.eventTime.getTime()) ||
        options.eventTime.getTime() >
          Date.now() +
            (options.offlineContext ? OFFLINE_ATTENDANCE_FUTURE_SKEW_MS : 0)
      ) {
        throw new BadRequestException('Attendance event time is invalid.');
      }
      return options.eventTime;
    }

    if (
      options.serverAuthoritativeTimestamp &&
      authentication?.generation !== 'legacy'
    ) {
      return new Date();
    }

    return this.parseOccurredAt(occurredAt);
  }

  private async getAttendanceById(id: string, organizationId?: string) {
    const attendance = await this.prisma.attendance.findFirst({
      where: {
        id,
        ...this.attendanceTenantWhere(organizationId),
      },
      select: attendanceWithEmployeeSelect,
    });

    if (!attendance) {
      throw new NotFoundException('Attendance record not found.');
    }

    return attendance;
  }

  private parseOccurredAt(value?: string) {
    const occurredAt = value ? new Date(value) : new Date();

    if (Number.isNaN(occurredAt.getTime())) {
      throw new BadRequestException(
        'occurredAt must be a valid ISO-8601 date-time string.',
      );
    }

    if (occurredAt.getTime() > Date.now()) {
      throw new BadRequestException('occurredAt cannot be in the future.');
    }

    return occurredAt;
  }

  private async lockAttendanceEvidence(
    tx: Prisma.TransactionClient,
    selfie: string | undefined,
    organizationId: string | undefined,
  ) {
    if (!selfie || !organizationId) return;
    const fingerprint =
      this.attendanceSecurityService.getPhotoEvidenceFingerprint(selfie);
    await tx.$queryRaw(
      Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${organizationId + ':' + fingerprint}, 2))::text AS lock_result`,
    );
    const [attendance, reconciliation] = await Promise.all([
      tx.attendance.findFirst({
        where: {
          organizationId,
          OR: [
            { checkInSelfieSha256: fingerprint },
            { checkOutSelfieSha256: fingerprint },
            { checkInVerificationPhotoPublicId: { endsWith: fingerprint } },
            { checkOutVerificationPhotoPublicId: { endsWith: fingerprint } },
          ],
        },
        select: { id: true },
      }),
      tx.offlineAttendanceReconciliation.findFirst({
        where: { organizationId, selfieSha256: fingerprint },
        select: { id: true },
      }),
    ]);
    if (attendance || reconciliation)
      throw new BadRequestException(
        'Cette preuve de pointage a déjà été utilisée.',
      );
  }

  private async assertAttendanceEvidenceNotReused(
    photoDataUrl: string | undefined,
    organizationId: string | undefined,
    authentication?: AuthenticationContext,
  ) {
    if (
      !photoDataUrl ||
      authentication?.generation !== 'saas' ||
      !organizationId
    ) {
      return;
    }

    const fingerprint =
      this.attendanceSecurityService.getPhotoEvidenceFingerprint(photoDataUrl);
    const reusedEvidence = await this.prisma.attendance.findFirst({
      where: {
        organizationId,
        OR: [
          { checkInSelfieSha256: fingerprint }, { checkOutSelfieSha256: fingerprint },
          { checkInVerificationPhotoPublicId: { endsWith: fingerprint } },
          { checkOutVerificationPhotoPublicId: { endsWith: fingerprint } },
        ],
      },
      select: { id: true },
    });

    const reconciliationEvidence = await this.prisma.offlineAttendanceReconciliation.findFirst({
      where: { organizationId, selfieSha256: fingerprint }, select: { id: true },
    });
    if (reusedEvidence || reconciliationEvidence) {
      throw new BadRequestException(
        'Cette preuve de pointage a déjà été utilisée.',
      );
    }
  }

  private getMonthRange(month?: string, timezone = 'UTC') {
    const resolvedMonth = month ?? formatBusinessMonth(new Date(), timezone);

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

  private getCheckInOutcome(
    schedule: {
      isActive: boolean;
      startTime: string;
      latenessMarginMinutes: number;
      workDays: Prisma.JsonValue;
    } | null,
    occurredAt: Date,
    businessDate: Date,
    timezone: string,
    isNonWorkingDay: boolean,
  ) {
    if (isNonWorkingDay) {
      return {
        minutesLate: 0,
        status: AttendanceStatus.NON_WORKING_DAY_WORK,
      };
    }

    if (
      !schedule ||
      !schedule.isActive ||
      !isScheduledOnDate(schedule.workDays, businessDate)
    ) {
      return {
        minutesLate: 0,
        status: AttendanceStatus.INCOMPLETE,
      };
    }

    const minutesLate = this.getMinutesLate(
      schedule.startTime,
      occurredAt,
      businessDate,
      timezone,
      schedule.latenessMarginMinutes,
    );

    if (minutesLate > 0) {
      return {
        minutesLate,
        status: AttendanceStatus.LATE,
      };
    }

    return {
      minutesLate: 0,
      status: AttendanceStatus.INCOMPLETE,
    };
  }

  private getCompletedStatus(minutesLate: number) {
    return minutesLate > 0 ? AttendanceStatus.LATE : AttendanceStatus.PRESENT;
  }

  private getScheduledExitTime(
    schedule: {
      isActive: boolean;
      startTime: string;
      endTime: string;
      workDays: Prisma.JsonValue;
    } | null,
    businessDate: Date,
    timezone: string,
    isNonWorkingDay = false,
  ) {
    if (isNonWorkingDay) {
      return null;
    }

    if (
      !schedule ||
      !schedule.isActive ||
      !isScheduledOnDate(schedule.workDays, businessDate)
    ) {
      return null;
    }

    const overnight = schedule.endTime <= schedule.startTime;
    const exitDate = overnight
      ? addAttendanceDays(businessDate, 1)
      : businessDate;
    return localScheduleTimeToUtc(exitDate, schedule.endTime, timezone);
  }

  private getResolvedScheduledExitTime(
    schedule: ReturnType<typeof resolveAttendanceSchedule>,
    businessDate: Date,
    timezone: string,
  ) {
    if (
      !schedule.startTime ||
      !schedule.endTime ||
      !isScheduledOnResolvedAttendanceDate(schedule, businessDate)
    ) {
      return null;
    }
    const exitDate =
      schedule.endTime <= schedule.startTime
        ? addAttendanceDays(businessDate, 1)
        : businessDate;
    return localScheduleTimeToUtc(exitDate, schedule.endTime, timezone);
  }

  private isOutsideScheduledWorkday(
    schedule: {
      isActive: boolean;
      workDays: Prisma.JsonValue;
    } | null,
    occurredAt: Date,
  ) {
    if (!schedule?.isActive) {
      return false;
    }

    return !isScheduledOnDate(schedule.workDays, occurredAt);
  }

  private async getMonthlyAbsenceCount(
    employeeId: string,
    referenceDate: Date,
    attendedDate?: Date,
    organizationId?: string,
    authentication?: AuthenticationContext,
    legacySchedule?: {
      isActive: boolean;
      startTime: string;
      endTime: string;
      latenessMarginMinutes: number;
      workDays: Prisma.JsonValue;
    } | null,
  ) {
    const timezone = await this.resolveTimezone(authentication);
    const referenceBusinessDate = getBusinessDate(referenceDate, timezone);
    const { start, end } = this.getDateMonthRange(referenceBusinessDate);
    const workedAttendances = await this.prisma.attendance.findMany({
      where: {
        employeeId,
        ...this.attendanceTenantWhere(organizationId),
        date: {
          gte: start,
          lt: end,
        },
        clockInAt: {
          not: null,
        },
      },
      select: {
        date: true,
      },
    });
    const workedDateKeys = new Set(
      workedAttendances.map((attendance) =>
        normalizeAttendanceDate(attendance.date).getTime(),
      ),
    );

    if (attendedDate) {
      workedDateKeys.add(normalizeAttendanceDate(attendedDate).getTime());
    }

    const cursor = new Date(start);
    const endOfCountingWindow = this.getAbsenceCountingEnd(
      end,
      referenceBusinessDate,
    );
    const nonWorkingDateKeys = organizationId
      ? await this.calendarService.getNonWorkingDateKeysForEmployeeInOrganization(
          start, endOfCountingWindow, employeeId, organizationId,
        )
      : await this.calendarService.getNonWorkingDateKeys(
      start,
      endOfCountingWindow,
      authentication,
    );
    let absenceCount = 0;

    while (cursor < endOfCountingWindow) {
      const currentDate = normalizeAttendanceDate(cursor);
      const schedule = organizationId
        ? (await this.effectiveSchedules?.resolveOptional(
            employeeId,
            organizationId,
            currentDate,
          ))?.schedule ?? null
        : legacySchedule ?? null;

      if (
        schedule?.isActive &&
        isScheduledOnDate(schedule.workDays, currentDate) &&
        !nonWorkingDateKeys.has(currentDate.getTime()) &&
        !workedDateKeys.has(currentDate.getTime())
      ) {
        absenceCount += 1;
      }

      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }

    return absenceCount;
  }

  private getDateMonthRange(referenceDate: Date) {
    const { start, end } = getAttendanceMonthRangeFromDate(referenceDate);

    return {
      start,
      end,
    };
  }

  private getAbsenceCountingEnd(monthEnd: Date, referenceDate: Date) {
    const referenceDayEnd = addAttendanceDays(
      normalizeAttendanceDate(referenceDate),
      1,
    );

    return referenceDayEnd < monthEnd ? referenceDayEnd : monthEnd;
  }

  private getMinutesLate(
    startTime: string,
    occurredAt: Date,
    businessDate: Date,
    timezone: string,
    latenessMarginMinutes = 0,
  ) {
    const scheduledAt = localScheduleTimeToUtc(
      businessDate,
      startTime,
      timezone,
    );

    const delta =
      occurredAt.getTime() -
      scheduledAt.getTime() -
      latenessMarginMinutes * 60_000;

    return Math.max(0, Math.round(delta / 60000));
  }

  private isEmployeeDateConstraintError(error: unknown) {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    );
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

  private canReadAttendanceEvidence(
    user: AuthenticatedUser,
    authentication: AuthenticationContext | undefined,
    employeeId: string,
  ) {
    if (authentication?.generation === 'saas') {
      return (
        authentication.membershipRole === MembershipRole.ADMIN ||
        (authentication.membershipRole === MembershipRole.EMPLOYEE &&
          authentication.employeeId === employeeId &&
          user.id === employeeId)
      );
    }

    return user.accessRole === 'ADMIN' || user.id === employeeId;
  }

  private employeeScheduleTenantWhere(
    organizationId?: string,
  ): Prisma.EmployeeWhereInput {
    if (!organizationId) {
      return {
        organizationId: null,
        userId: null,
      };
    }

    return {
      organizationId,
      v1ScopeStatus: OPERATIONAL_SCOPE,
    };
  }

  /**
   * Employee.scheduleId is a current compatibility projection. Tenant work is
   * resolved from immutable assignment history; legacy records retain their
   * pre-SaaS behaviour until they are explicitly reviewed and migrated.
   */
  private async resolveEffectiveSchedule(
    employeeId: string,
    organizationId: string | undefined,
    businessDate: Date,
    legacySchedule: {
      id: string;
      name: string;
      isActive: boolean;
      startTime: string;
      endTime: string;
      latenessMarginMinutes: number;
      workDays: Prisma.JsonValue;
    } | null,
  ) {
    if (!organizationId) return legacySchedule;
    if (!this.effectiveSchedules) return null;

    return (
      await this.effectiveSchedules.resolveOptional(
        employeeId,
        organizationId,
        businessDate,
      )
    )?.schedule ?? null;
  }

  private attendanceTenantWhere(
    organizationId?: string,
  ): Prisma.AttendanceWhereInput {
    return {
      organizationId: organizationId ?? null,
      ...(organizationId ? { v1ScopeStatus: OPERATIONAL_SCOPE } : {}),
      employee: {
        is: this.employeeScheduleTenantWhere(organizationId),
      },
    };
  }
}
