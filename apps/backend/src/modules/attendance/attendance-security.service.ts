import { BadRequestException, Injectable } from '@nestjs/common';
import {
  AttendanceVerificationLevel,
  AttendanceVerificationMethod,
} from '@prisma/client';
import { AttendancePhotoStorageService } from './attendance-photo-storage.service';
import {
  AttendanceSecurityPolicyService,
  SecurityLocation,
} from './attendance-security-policy.service';
import { CheckInSecurityProofDto } from './dto/check-in-security.dto';
import { AttendanceSettingsService } from './attendance-settings.service';
import type { AttendanceSiteSecurityContext } from './attendance-settings.service';
import { AuthenticationContext } from '../auth/interfaces/authentication-context.interface';
import type { AttendanceSecurityPolicy } from './attendance-security-policy.service';

export type AttendanceSecurityMetadata = {
  checkInLatitude: number | null;
  checkInLongitude: number | null;
  checkInAccuracyMeters: number | null;
  checkInDistanceMeters: number | null;
  checkInVerificationMethod: AttendanceVerificationMethod;
  checkInVerificationLevel: AttendanceVerificationLevel;
  checkInVerificationReason: string | null;
  checkInVerificationPhoto: string | null;
  checkInVerificationPhotoPublicId: string | null;
};

export type AttendanceCheckOutSecurityMetadata = {
  checkOutLatitude: number | null;
  checkOutLongitude: number | null;
  checkOutAccuracyMeters: number | null;
  checkOutDistanceMeters: number | null;
  checkOutVerificationMethod: AttendanceVerificationMethod;
  checkOutVerificationLevel: AttendanceVerificationLevel;
  checkOutVerificationReason: string | null;
  checkOutVerificationPhoto: string | null;
  checkOutVerificationPhotoPublicId: string | null;
};

type AttendanceSecurityEvaluation = {
  latitude: number | null;
  longitude: number | null;
  accuracyMeters: number | null;
  distanceMeters: number | null;
  method: AttendanceVerificationMethod;
  level: AttendanceVerificationLevel;
  reason: string | null;
  photoUrl: string | null;
  photoPublicId: string | null;
};

@Injectable()
/**
 * SOURCE OF TRUTH
 * GPS/selfie attendance security evaluation.
 *
 * Frontend capture helpers collect proof only. Backend validation and upload
 * handling remain authoritative and must not silently downgrade security.
 */
export class AttendanceSecurityService {
  private readonly evidenceFreshnessToleranceMs = 2 * 60 * 1000;

  constructor(
    private readonly policyService: AttendanceSecurityPolicyService,
    private readonly photoStorageService: AttendancePhotoStorageService,
    private readonly settingsService: AttendanceSettingsService,
  ) {}

  getPolicy() {
    return this.policyService.getPolicy();
  }

  getEffectivePolicy(
    authentication?: AuthenticationContext,
    site?: AttendanceSiteSecurityContext | null,
  ) {
    return authentication
      ? this.settingsService.resolveSecurityPolicy(authentication, site)
      : Promise.resolve(this.getPolicy());
  }

  getPhotoEvidenceFingerprint(photoDataUrl: string) {
    return this.photoStorageService.getEvidenceFingerprint(photoDataUrl);
  }

  validateEvidence(
    input: CheckInSecurityProofDto | undefined,
    options: {
      enforceSecurity: boolean;
      notes?: string;
      requireFreshEvidence?: boolean;
      /** Offline evidence is compared with the validated attendance event time. */
      evidenceReferenceTime?: Date;
      authentication?: AuthenticationContext;
      site?: AttendanceSiteSecurityContext | null;
      policyOverride?: AttendanceSecurityPolicy;
    },
  ) {
    const policyPromise = options.policyOverride
      ? Promise.resolve(options.policyOverride)
      : options.authentication
      ? this.settingsService.resolveSecurityPolicy(
          options.authentication,
          options.site,
        )
      : Promise.resolve(this.getPolicy());
    return policyPromise.then((policy) => {
      const location = this.extractLocation(input);
      const distanceMeters = this.policyService.getDistanceMeters(
        policy,
        location,
      );

      this.assertSecurityRequirements({
        input,
        location,
        distanceMeters,
        policy,
        enforceSecurity: options.enforceSecurity,
        notes: options.notes,
        requireFreshEvidence: options.requireFreshEvidence,
        evidenceReferenceTime: options.evidenceReferenceTime,
      });
    });
  }

  async evaluateCheckIn(
    input: CheckInSecurityProofDto | undefined,
    options: {
      enforceSecurity: boolean;
      employeeId: string;
      occurredAt: Date;
      notes?: string;
      requireFreshEvidence?: boolean;
      /** Offline evidence is compared with the validated attendance event time. */
      evidenceReferenceTime?: Date;
      authentication?: AuthenticationContext;
      site?: AttendanceSiteSecurityContext | null;
      policyOverride?: AttendanceSecurityPolicy;
    },
  ): Promise<AttendanceSecurityMetadata> {
    const evaluation = await this.evaluateSecurity(input, {
      enforceSecurity: options.enforceSecurity,
      employeeId: options.employeeId,
      occurredAt: options.occurredAt,
      notes: options.notes,
      requireFreshEvidence: options.requireFreshEvidence,
      evidenceReferenceTime: options.evidenceReferenceTime,
      reason: 'CHECK_IN',
      authentication: options.authentication,
      site: options.site,
      policyOverride: options.policyOverride,
    });

    return this.buildCheckInMetadata(evaluation);
  }

  async evaluateCheckOut(
    input: CheckInSecurityProofDto | undefined,
    options: {
      enforceSecurity: boolean;
      employeeId: string;
      occurredAt: Date;
      notes?: string;
      requireFreshEvidence?: boolean;
      /** Offline evidence is compared with the validated attendance event time. */
      evidenceReferenceTime?: Date;
      authentication?: AuthenticationContext;
      site?: AttendanceSiteSecurityContext | null;
      policyOverride?: AttendanceSecurityPolicy;
    },
  ): Promise<AttendanceCheckOutSecurityMetadata> {
    const evaluation = await this.evaluateSecurity(input, {
      enforceSecurity: options.enforceSecurity,
      employeeId: options.employeeId,
      occurredAt: options.occurredAt,
      notes: options.notes,
      requireFreshEvidence: options.requireFreshEvidence,
      reason: 'CHECK_OUT',
      authentication: options.authentication,
      site: options.site,
      evidenceReferenceTime: options.evidenceReferenceTime,
      policyOverride: options.policyOverride,
    });

    return this.buildCheckOutMetadata(evaluation);
  }

  private async evaluateSecurity(
    input: CheckInSecurityProofDto | undefined,
    context: {
      enforceSecurity: boolean;
      employeeId: string;
      occurredAt: Date;
      notes?: string;
      reason: 'CHECK_IN' | 'CHECK_OUT';
      requireFreshEvidence?: boolean;
      evidenceReferenceTime?: Date;
      authentication?: AuthenticationContext;
      site?: AttendanceSiteSecurityContext | null;
      policyOverride?: AttendanceSecurityPolicy;
    },
  ): Promise<AttendanceSecurityEvaluation> {
    const policy = context.policyOverride ?? (context.authentication
      ? await this.settingsService.resolveSecurityPolicy(
          context.authentication,
          context.site,
        )
      : this.getPolicy());
    const location = this.extractLocation(input);
    const distanceMeters = this.policyService.getDistanceMeters(
      policy,
      location,
    );

    this.assertSecurityRequirements({
      input,
      location,
      distanceMeters,
      policy,
      enforceSecurity: context.enforceSecurity,
      notes: context.notes,
      requireFreshEvidence: context.requireFreshEvidence,
      evidenceReferenceTime: context.evidenceReferenceTime,
    });
    const isOffsiteJustified =
      context.enforceSecurity &&
      policy.gpsRequired &&
      policy.allowedRadiusMeters !== null &&
      distanceMeters !== null &&
      distanceMeters > policy.allowedRadiusMeters &&
      Boolean(context.notes?.trim());

    const photo = input?.verificationPhotoDataUrl
      ? await this.photoStorageService.uploadVerificationPhoto(
          input.verificationPhotoDataUrl,
          {
            employeeId: context.employeeId,
            occurredAt: context.occurredAt,
            reason: context.reason,
          },
        )
      : null;

    return this.buildEvaluation({
      location,
      distanceMeters,
      method: photo
        ? AttendanceVerificationMethod.PHOTO
        : location
          ? AttendanceVerificationMethod.GPS
          : AttendanceVerificationMethod.NONE,
      level: AttendanceVerificationLevel.OK,
      reason: photo
        ? location
          ? isOffsiteJustified
            ? 'OFFSITE_LOCATION_JUSTIFIED'
            : 'SELFIE_AND_LOCATION_RECORDED'
          : 'SELFIE_RECORDED'
        : location
          ? isOffsiteJustified
            ? 'OFFSITE_LOCATION_JUSTIFIED'
            : 'PASSIVE_LOCATION_RECORDED'
          : null,
      photo,
    });
  }

  private assertSecurityRequirements(input: {
    input: CheckInSecurityProofDto | undefined;
    location: SecurityLocation | null;
    distanceMeters: number | null;
    policy: ReturnType<AttendanceSecurityPolicyService['getPolicy']>;
    enforceSecurity: boolean;
    notes?: string;
    requireFreshEvidence?: boolean;
    evidenceReferenceTime?: Date;
  }) {
    if (!input.enforceSecurity) {
      return;
    }

    if (
      input.policy.selfieRequired &&
      !input.input?.verificationPhotoDataUrl?.trim()
    ) {
      throw new BadRequestException('Selfie requis pour valider le pointage.');
    }

    if (!input.policy.enabled) {
      return;
    }

    const evidenceCapturedAt = input.input?.evidenceCapturedAt
      ? new Date(input.input.evidenceCapturedAt)
      : null;
    const evidenceReferenceTime = input.evidenceReferenceTime?.getTime() ?? Date.now();
    const evidenceDeltaMs = evidenceCapturedAt
      ? evidenceReferenceTime - evidenceCapturedAt.getTime()
      : null;
    const evidenceOutsideTolerance = evidenceDeltaMs === null || (
      input.evidenceReferenceTime
        ? Math.abs(evidenceDeltaMs) > this.evidenceFreshnessToleranceMs
        : evidenceDeltaMs < -5_000 || evidenceDeltaMs > this.evidenceFreshnessToleranceMs
    );
    if (
      (input.requireFreshEvidence || evidenceCapturedAt) &&
      evidenceOutsideTolerance
    ) {
      throw new BadRequestException(
        'Preuve de pointage absente ou expirée. Recommencez la validation.',
      );
    }

    if (!input.policy.gpsRequired) {
      return;
    }

    if (!input.location) {
      throw new BadRequestException(
        'Géolocalisation requise pour valider le pointage.',
      );
    }

    if (input.location.latitude === 0 && input.location.longitude === 0) {
      throw new BadRequestException('Coordonnées GPS suspectes.');
    }

    if (
      input.policy.maxAccuracyMeters !== null &&
      (input.location.accuracyMeters === null ||
        input.location.accuracyMeters > input.policy.maxAccuracyMeters)
    ) {
      throw new BadRequestException('Précision GPS insuffisante.');
    }

    if (
      input.policy.allowedRadiusMeters !== null &&
      input.distanceMeters !== null &&
      input.distanceMeters > input.policy.allowedRadiusMeters
    ) {
      if (!input.notes?.trim()) {
        throw new BadRequestException(
          'Ajoutez un commentaire pour justifier ce pointage hors bureau.',
        );
      }
    }
  }

  private extractLocation(
    input: CheckInSecurityProofDto | undefined,
  ): SecurityLocation | null {
    if (
      typeof input?.latitude !== 'number' ||
      typeof input.longitude !== 'number'
    ) {
      return null;
    }

    return {
      latitude: input.latitude,
      longitude: input.longitude,
      accuracyMeters:
        typeof input.accuracyMeters === 'number' ? input.accuracyMeters : null,
    };
  }

  private buildEvaluation(input: {
    location: SecurityLocation | null;
    distanceMeters: number | null;
    method: AttendanceVerificationMethod;
    level: AttendanceVerificationLevel;
    reason: string | null;
    photo: {
      secureUrl: string;
      publicId: string;
    } | null;
  }): AttendanceSecurityEvaluation {
    return {
      latitude: input.location?.latitude ?? null,
      longitude: input.location?.longitude ?? null,
      accuracyMeters: input.location?.accuracyMeters ?? null,
      distanceMeters: input.distanceMeters,
      method: input.method,
      level: input.level,
      reason: input.reason,
      photoUrl: input.photo?.secureUrl ?? null,
      photoPublicId: input.photo?.publicId ?? null,
    };
  }

  private buildCheckInMetadata(
    input: AttendanceSecurityEvaluation,
  ): AttendanceSecurityMetadata {
    return {
      checkInLatitude: input.latitude,
      checkInLongitude: input.longitude,
      checkInAccuracyMeters: input.accuracyMeters,
      checkInDistanceMeters: input.distanceMeters,
      checkInVerificationMethod: input.method,
      checkInVerificationLevel: input.level,
      checkInVerificationReason: input.reason,
      checkInVerificationPhoto: input.photoUrl,
      checkInVerificationPhotoPublicId: input.photoPublicId,
    };
  }

  private buildCheckOutMetadata(
    input: AttendanceSecurityEvaluation,
  ): AttendanceCheckOutSecurityMetadata {
    return {
      checkOutLatitude: input.latitude,
      checkOutLongitude: input.longitude,
      checkOutAccuracyMeters: input.accuracyMeters,
      checkOutDistanceMeters: input.distanceMeters,
      checkOutVerificationMethod: input.method,
      checkOutVerificationLevel: input.level,
      checkOutVerificationReason: input.reason,
      checkOutVerificationPhoto: input.photoUrl,
      checkOutVerificationPhotoPublicId: input.photoPublicId,
    };
  }
}
