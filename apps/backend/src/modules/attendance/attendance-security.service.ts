import { Injectable } from '@nestjs/common';
import {
  AttendanceVerificationLevel,
  AttendanceVerificationMethod,
} from '@prisma/client';
import {
  AttendanceSecurityAccuracyTooLowException,
  AttendanceSecurityLocationRequiredException,
  AttendanceSecurityOutsideZoneException,
} from './attendance-security.exception';
import {
  AttendanceSecurityPolicyService,
  SecurityLocation,
} from './attendance-security-policy.service';
import { CheckInSecurityProofDto } from './dto/check-in-security.dto';

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
export class AttendanceSecurityService {
  constructor(private readonly policyService: AttendanceSecurityPolicyService) {}

  getPolicy() {
    return this.policyService.getPolicy();
  }

  async evaluateCheckIn(
    input: CheckInSecurityProofDto | undefined,
    options: {
      enforceSecurity: boolean;
    },
  ): Promise<AttendanceSecurityMetadata> {
    const evaluation = this.evaluateSecurity(input, options);

    return this.buildCheckInMetadata(evaluation);
  }

  async evaluateCheckOut(
    input: CheckInSecurityProofDto | undefined,
    options: {
      enforceSecurity: boolean;
    },
  ): Promise<AttendanceCheckOutSecurityMetadata> {
    const evaluation = this.evaluateSecurity(input, options);

    return this.buildCheckOutMetadata(evaluation);
  }

  private evaluateSecurity(
    input: CheckInSecurityProofDto | undefined,
    options: {
      enforceSecurity: boolean;
    },
  ): AttendanceSecurityEvaluation {
    const policy = this.getPolicy();
    const location = this.extractLocation(input);
    const distanceMeters = this.policyService.getDistanceMeters(
      policy,
      location,
    );
    const allowedRadiusMeters =
      policy.allowedRadiusMeters ??
      policy.warningRadiusMeters ??
      policy.trustedRadiusMeters;

    const metadata = this.buildEvaluation({
      location,
      distanceMeters,
      method: location
        ? AttendanceVerificationMethod.GPS
        : AttendanceVerificationMethod.NONE,
      level: AttendanceVerificationLevel.OK,
      reason: location ? 'PASSIVE_LOCATION_RECORDED' : null,
      photo: null,
    });

    if (!options.enforceSecurity || !policy.enabled) {
      return metadata;
    }

    if (!location) {
      throw new AttendanceSecurityLocationRequiredException();
    }

    if (
      location.accuracyMeters !== null &&
      policy.maxAccuracyMeters !== null &&
      location.accuracyMeters > policy.maxAccuracyMeters
    ) {
      throw new AttendanceSecurityAccuracyTooLowException();
    }

    if (
      distanceMeters === null ||
      allowedRadiusMeters === null ||
      distanceMeters > allowedRadiusMeters
    ) {
      throw new AttendanceSecurityOutsideZoneException();
    }

    return this.buildEvaluation({
      location,
      distanceMeters,
      method: AttendanceVerificationMethod.GPS,
      level: AttendanceVerificationLevel.OK,
      reason: 'WITHIN_ALLOWED_RADIUS',
      photo: null,
    });
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
