import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type SecurityLocation = {
  latitude: number;
  longitude: number;
  accuracyMeters: number | null;
};

export type AttendanceSecurityPolicy = {
  enabled: boolean;
  locationConfigured: boolean;
  trustedRadiusMeters: number | null;
  warningRadiusMeters: number | null;
  allowedRadiusMeters: number | null;
  maxAccuracyMeters: number | null;
  companyLatitude: number | null;
  companyLongitude: number | null;
};

@Injectable()
export class AttendanceSecurityPolicyService {
  private readonly defaultTrustedRadiusMeters = 100;
  private readonly defaultWarningRadiusMeters = 300;
  private readonly defaultMaxAccuracyMeters = 200;

  constructor(private readonly configService: ConfigService) {}

  getPolicy(): AttendanceSecurityPolicy {
    const companyLatitude = this.getNumber('COMPANY_LATITUDE');
    const companyLongitude = this.getNumber('COMPANY_LONGITUDE');
    const configuredAllowedRadiusMeters = this.getNumber(
      'ATTENDANCE_ALLOWED_RADIUS_METERS',
    );
    const configuredTrustedRadiusMeters = this.getNumber(
      'ATTENDANCE_TRUSTED_RADIUS_METERS',
    );
    const configuredWarningRadiusMeters = this.getNumber(
      'ATTENDANCE_WARNING_RADIUS_METERS',
    );
    const configuredMaxAccuracyMeters = this.getNumber(
      'ATTENDANCE_MAX_ACCURACY_METERS',
    );
    const locationConfigured =
      companyLatitude !== null && companyLongitude !== null;
    const enabled =
      this.getBoolean('ATTENDANCE_SECURITY_ENABLED', false) &&
      locationConfigured;
    const trustedRadiusMeters =
      configuredTrustedRadiusMeters ??
      configuredAllowedRadiusMeters ??
      this.defaultTrustedRadiusMeters;
    const warningRadiusBaseline =
      configuredWarningRadiusMeters ??
      configuredAllowedRadiusMeters ??
      this.defaultWarningRadiusMeters;
    const warningRadiusMeters = Math.max(
      trustedRadiusMeters,
      warningRadiusBaseline,
    );
    const allowedRadiusMeters =
      configuredAllowedRadiusMeters ?? warningRadiusMeters;

    return {
      enabled,
      locationConfigured,
      trustedRadiusMeters: enabled ? trustedRadiusMeters : null,
      warningRadiusMeters: enabled ? warningRadiusMeters : null,
      allowedRadiusMeters: enabled ? allowedRadiusMeters : null,
      maxAccuracyMeters: enabled
        ? configuredMaxAccuracyMeters ?? this.defaultMaxAccuracyMeters
        : null,
      companyLatitude: enabled ? companyLatitude : null,
      companyLongitude: enabled ? companyLongitude : null,
    };
  }

  getDistanceMeters(
    policy: AttendanceSecurityPolicy,
    location: SecurityLocation | null,
  ) {
    if (
      !location ||
      policy.companyLatitude === null ||
      policy.companyLongitude === null
    ) {
      return null;
    }

    return Math.round(
      this.calculateDistanceMeters(
        location.latitude,
        location.longitude,
        policy.companyLatitude,
        policy.companyLongitude,
      ),
    );
  }

  private calculateDistanceMeters(
    latitude: number,
    longitude: number,
    targetLatitude: number,
    targetLongitude: number,
  ) {
    const earthRadiusMeters = 6371000;
    const latitudeDelta = this.toRadians(targetLatitude - latitude);
    const longitudeDelta = this.toRadians(targetLongitude - longitude);
    const sourceLatitude = this.toRadians(latitude);
    const destinationLatitude = this.toRadians(targetLatitude);

    const haversine =
      Math.sin(latitudeDelta / 2) ** 2 +
      Math.cos(sourceLatitude) *
        Math.cos(destinationLatitude) *
        Math.sin(longitudeDelta / 2) ** 2;

    return (
      2 *
      earthRadiusMeters *
      Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine))
    );
  }

  private toRadians(value: number) {
    return (value * Math.PI) / 180;
  }

  private getConfigValue(name: string) {
    return (
      process.env[name] ??
      this.configService.get<string | number | boolean>(name)
    );
  }

  private getBoolean(name: string, defaultValue: boolean) {
    const value = this.getConfigValue(name);

    if (value === undefined || value === null || value === '') {
      return defaultValue;
    }

    if (typeof value === 'boolean') {
      return value;
    }

    return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
  }

  private getNumber(name: string) {
    const value = this.getConfigValue(name);

    if (value === undefined || value === null || value === '') {
      return null;
    }

    const parsed = Number(value);

    return Number.isFinite(parsed) ? parsed : null;
  }
}
