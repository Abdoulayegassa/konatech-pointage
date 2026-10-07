import { Prisma } from '@prisma/client';
import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { normalizeAttendanceDate } from '../../common/utils/attendance-date.util';
import { AttendancePhotoStorageService } from './attendance-photo-storage.service';

export const SELFIE_RETENTION_DAYS = 90;
const RETENTION_INTERVAL_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class SelfieRetentionService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SelfieRetentionService.name);
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly prisma: PrismaService,
    private readonly photoStorage: AttendancePhotoStorageService,
  ) {}

  onModuleInit() {
    void this.runDueRetention(new Date());
    this.timer = setInterval(() => {
      void this.runDueRetention(new Date());
    }, RETENTION_INTERVAL_MS);
    this.timer.unref?.();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async runDueRetention(referenceDate: Date) {
    const cutoff = normalizeAttendanceDate(referenceDate);
    cutoff.setUTCDate(cutoff.getUTCDate() - SELFIE_RETENTION_DAYS);
    const records = await this.prisma.attendance.findMany({
      where: {
        date: { lte: cutoff },
        OR: [
          { checkInVerificationPhotoPublicId: { not: null } },
          { checkOutVerificationPhotoPublicId: { not: null } },
        ],
      },
      select: {
        id: true,
        checkInVerificationPhotoPublicId: true,
        checkOutVerificationPhotoPublicId: true,
      },
    });

    for (const attendance of records) {
      await this.deleteEvidenceIfDue(
        attendance.id,
        'checkIn',
        attendance.checkInVerificationPhotoPublicId,
        referenceDate,
      );
      await this.deleteEvidenceIfDue(
        attendance.id,
        'checkOut',
        attendance.checkOutVerificationPhotoPublicId,
        referenceDate,
      );
    }

    const resolvedCutoff = new Date(referenceDate.getTime() - SELFIE_RETENTION_DAYS * 24 * 60 * 60 * 1000);
    const cases = await this.prisma.offlineAttendanceReconciliation.findMany({
      where: { status: { in: ['RESOLVED', 'APPROVED', 'REJECTED'] }, decidedAt: { lte: resolvedCutoff }, selfiePublicId: { not: null } },
      select: { id: true, selfiePublicId: true }, take: 100, orderBy: [{ decidedAt: 'asc' }, { id: 'asc' }],
    });
    for (const item of cases) {
      const protectedReference = await this.prisma.offlineAttendanceReconciliation.count({
        where: { selfiePublicId: item.selfiePublicId, OR: [{ status: 'PENDING_REVIEW' }, { decidedAt: null }, { decidedAt: { gt: resolvedCutoff } }] },
      });
      if (protectedReference) continue;
      try {
        await this.photoStorage.deleteVerificationPhoto(item.selfiePublicId!);
        await this.prisma.offlineAttendanceReconciliation.updateMany({
          where: { id: item.id, status: { in: ['RESOLVED', 'APPROVED', 'REJECTED'] }, selfiePublicId: item.selfiePublicId },
          data: { selfiePublicId: null, selfieDeletedAt: referenceDate, selfieDeletionFailedAt: null },
        });
      } catch {
        await this.prisma.offlineAttendanceReconciliation.updateMany({ where: { id: item.id }, data: { selfieDeletionFailedAt: referenceDate } });
        this.logger.error(JSON.stringify({ event: 'reconciliation_evidence_deletion_failed', reconciliationId: item.id }));
      }
    }
    const abandoned = await this.prisma.reconciliationEvidenceUpload.findMany({
      where: { createdAt: { lte: new Date(referenceDate.getTime() - RETENTION_INTERVAL_MS) } },
      take: 100, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    for (const intent of abandoned) {
      try {
        await this.prisma.$transaction(async (tx) => {
          // Serializes with the intake's intent deletion/commit.
          const locked = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`SELECT "id" FROM "ReconciliationEvidenceUpload" WHERE "id" = ${intent.id} FOR UPDATE`);
          if (!locked.length) return;
          const referenced = await tx.offlineAttendanceReconciliation.count({ where: { selfiePublicId: intent.publicId } });
          if (!referenced) await this.photoStorage.deleteVerificationPhoto(intent.publicId);
          await tx.reconciliationEvidenceUpload.delete({ where: { id: intent.id } });
        }, { timeout: 15000 });
      } catch {
        this.logger.error(JSON.stringify({ event: 'reconciliation_orphan_cleanup_failed', intentId: intent.id }));
      }
    }
    return { processed: records.length, reconciliationsProcessed: cases.length, orphansProcessed: abandoned.length };
  }

  private async deleteEvidenceIfDue(
    attendanceId: string,
    point: 'checkIn' | 'checkOut',
    publicId: string | null,
    referenceDate: Date,
  ) {
    if (!publicId) return;
    const protectedCase = await this.prisma.offlineAttendanceReconciliation.findFirst({
      where: { selfiePublicId: publicId, OR: [{ status: 'PENDING_REVIEW' }, { decidedAt: null }, { decidedAt: { gt: new Date(referenceDate.getTime() - SELFIE_RETENTION_DAYS * RETENTION_INTERVAL_MS) } }] }, select: { id: true },
    });
    if (protectedCase) return;

    try {
      await this.photoStorage.deleteVerificationPhoto(publicId);
      const now = new Date();
      const isCheckIn = point === 'checkIn';
      await this.prisma.attendance.updateMany({
        where: {
          id: attendanceId,
          ...(isCheckIn
            ? { checkInVerificationPhotoPublicId: publicId }
            : { checkOutVerificationPhotoPublicId: publicId }),
        },
        data: isCheckIn
          ? {
              checkInVerificationPhoto: null,
              checkInVerificationPhotoPublicId: null,
              checkInVerificationPhotoDeletedAt: now,
              checkInVerificationPhotoDeletionFailedAt: null,
            }
          : {
              checkOutVerificationPhoto: null,
              checkOutVerificationPhotoPublicId: null,
              checkOutVerificationPhotoDeletedAt: now,
              checkOutVerificationPhotoDeletionFailedAt: null,
            },
      });
    } catch {
      const isCheckIn = point === 'checkIn';
      await this.prisma.attendance.updateMany({
        where: {
          id: attendanceId,
          ...(isCheckIn
            ? { checkInVerificationPhotoPublicId: publicId }
            : { checkOutVerificationPhotoPublicId: publicId }),
        },
        data: isCheckIn
          ? { checkInVerificationPhotoDeletionFailedAt: new Date() }
          : { checkOutVerificationPhotoDeletionFailedAt: new Date() },
      });
      this.logger.error(
        JSON.stringify({
          event: 'attendance_selfie_retention_deletion_failed',
          attendanceId,
          point,
        }),
      );
    }
  }
}
