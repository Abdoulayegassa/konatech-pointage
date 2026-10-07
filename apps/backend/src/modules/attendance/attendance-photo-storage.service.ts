import { createHash } from 'crypto';
import {
  BadRequestException,
  BadGatewayException,
  GatewayTimeoutException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type StoredAttendancePhoto = {
  secureUrl: string;
  publicId: string;
};

export type StoredAttendancePhotoContent = {
  content: Buffer;
  contentType: string;
};

type CloudinaryUploadResponse = {
  public_id?: string;
  secure_url?: string;
  error?: {
    message?: string;
  };
};

type CloudinaryUploadConfig = {
  cloudName: string;
  apiKey: string;
  apiSecret: string;
  folder: string;
  timeoutMs: number;
  maxRetries: number;
  retryDelayMs: number;
};

type CloudinaryUploadFailure = {
  statusCode: number | null;
  message: string;
  retryable: boolean;
  timedOut: boolean;
};

@Injectable()
export class AttendancePhotoStorageService {
  private readonly logger = new Logger(AttendancePhotoStorageService.name);

  constructor(private readonly configService: ConfigService) {}

  async uploadVerificationPhoto(
    photoDataUrl: string,
    input: {
      employeeId: string;
      occurredAt: Date;
      reason: string;
    },
  ): Promise<StoredAttendancePhoto> {
    const evidenceFingerprint = this.getEvidenceFingerprint(photoDataUrl);

    if (process.env.NODE_ENV === 'test') {
      const publicId = this.buildPublicId(input, evidenceFingerprint);

      return {
        publicId,
        secureUrl: `https://res.cloudinary.com/test/image/upload/${publicId}.jpg`,
      };
    }

    const config = this.getConfig();
    const publicId = this.buildPublicId(input, evidenceFingerprint);
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const tags = 'attendance,verification';
    const signature = this.sign(
      {
        folder: config.folder,
        public_id: publicId,
        tags,
        timestamp,
        type: 'private',
      },
      config.apiSecret,
    );
    const uploadUrl = `https://api.cloudinary.com/v1_1/${config.cloudName}/image/upload`;
    const maxAttempts = config.maxRetries + 1;
    let lastFailure: CloudinaryUploadFailure | null = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const form = this.buildUploadForm(photoDataUrl, {
        apiKey: config.apiKey,
        folder: config.folder,
        publicId,
        signature,
        tags,
        timestamp,
        type: 'private',
      });

      const result = await this.uploadOnce(uploadUrl, form, config.timeoutMs);

      if ('photo' in result) {
        return result.photo;
      }

      lastFailure = result.failure;

      if (!lastFailure.retryable || attempt === maxAttempts) {
        break;
      }

      this.logger.warn(
        JSON.stringify({
          event: 'cloudinary_upload_retry',
          attempt,
          nextAttempt: attempt + 1,
          statusCode: lastFailure.statusCode,
          timedOut: lastFailure.timedOut,
          failureType: lastFailure.timedOut ? 'timeout' : 'upstream_error',
        }),
      );

      await this.delay(config.retryDelayMs * attempt);
    }

    this.logger.error(
      JSON.stringify({
        event: 'cloudinary_upload_failed',
        statusCode: lastFailure?.statusCode ?? null,
        timedOut: lastFailure?.timedOut ?? false,
      }),
    );

    if (lastFailure?.timedOut) {
      throw new GatewayTimeoutException(
        'Cloudinary photo upload timed out. Please retry verification.',
      );
    }

    throw new BadGatewayException('Photo storage is temporarily unavailable.');
  }

  plannedVerificationPhotoPublicId(photoDataUrl: string, input: { employeeId: string; occurredAt: Date; reason: string }) {
    const relative = this.buildPublicId(input, this.getEvidenceFingerprint(photoDataUrl));
    return process.env.NODE_ENV === 'test' ? relative : `${this.getConfig().folder}/${relative}`;
  }

  getEvidenceFingerprint(photoDataUrl: string) {
    const bytes = this.assertDataUrl(photoDataUrl);

    return createHash('sha256').update(bytes).digest('hex');
  }

  async getVerificationPhoto(
    publicId: string,
  ): Promise<StoredAttendancePhotoContent> {
    if (process.env.NODE_ENV === 'test') {
      return {
        content: Buffer.from([0xff, 0xd8, 0xff, 0xd9]),
        contentType: 'image/jpeg',
      };
    }

    const config = this.getConfig();
    const signature = createHash('sha1')
      .update(`${publicId}${config.apiSecret}`)
      .digest('base64url')
      .slice(0, 8);
    const deliveryUrl = `https://res.cloudinary.com/${config.cloudName}/image/private/s--${signature}--/${publicId}.jpg`;
    const response = await fetch(deliveryUrl);

    if (!response.ok) {
      this.logger.error(
        JSON.stringify({
          event: 'cloudinary_photo_delivery_failed',
          statusCode: response.status,
        }),
      );
      throw new BadGatewayException('Verification photo is unavailable.');
    }

    return {
      content: Buffer.from(await response.arrayBuffer()),
      contentType: response.headers.get('content-type') ?? 'image/jpeg',
    };
  }

  async deleteVerificationPhoto(publicId: string): Promise<void> {
    if (process.env.NODE_ENV === 'test') {
      return;
    }

    const config = this.getConfig();
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const signature = this.sign(
      { invalidate: 'true', public_id: publicId, timestamp, type: 'private' },
      config.apiSecret,
    );
    const form = new FormData();
    form.set('public_id', publicId);
    form.set('timestamp', timestamp);
    form.set('api_key', config.apiKey);
    form.set('signature', signature);
    form.set('invalidate', 'true');
    form.set('type', 'private');
    const response = await fetch(
      `https://api.cloudinary.com/v1_1/${config.cloudName}/image/destroy`,
      { method: 'POST', body: form, signal: AbortSignal.timeout(config.timeoutMs) },
    );
    const payload = (await response.json().catch(() => ({}))) as {
      result?: string;
    };

    if (!response.ok || !['ok', 'not found'].includes(payload.result ?? '')) {
      this.logger.error(
        JSON.stringify({
          event: 'cloudinary_photo_deletion_failed',
          statusCode: response.status,
        }),
      );
      throw new BadGatewayException('Verification photo deletion failed.');
    }
  }

  private assertDataUrl(photoDataUrl: string) {
    const match = photoDataUrl.match(
      /^data:image\/(jpeg|jpg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/,
    );
    if (!match) {
      throw new BadRequestException(
        'Verification photo must be a valid image.',
      );
    }

    const bytes = Buffer.from(match[2], 'base64');
    const mimeType = match[1] === 'jpg' ? 'jpeg' : match[1];
    if (!this.hasExpectedImageSignature(bytes, mimeType)) {
      throw new BadRequestException(
        'Verification photo content does not match its image type.',
      );
    }

    return bytes;
  }

  private hasExpectedImageSignature(bytes: Buffer, mimeType: string) {
    if (mimeType === 'jpeg') {
      return bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8;
    }
    if (mimeType === 'png') {
      return (
        bytes.length >= 8 &&
        bytes.subarray(0, 8).equals(
          Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        )
      );
    }

    return (
      bytes.length >= 12 &&
      bytes.subarray(0, 4).toString('ascii') === 'RIFF' &&
      bytes.subarray(8, 12).toString('ascii') === 'WEBP'
    );
  }

  private getConfig(): CloudinaryUploadConfig {
    const cloudName = this.getRequiredString('CLOUDINARY_CLOUD_NAME');
    const apiKey = this.getRequiredString('CLOUDINARY_API_KEY');
    const apiSecret = this.getRequiredString('CLOUDINARY_API_SECRET');
    const folder =
      this.configService.get<string>('CLOUDINARY_ATTENDANCE_FOLDER')?.trim() ||
      'konatech/attendance-verifications';

    return {
      cloudName,
      apiKey,
      apiSecret,
      folder,
      timeoutMs: this.configService.get<number>(
        'CLOUDINARY_UPLOAD_TIMEOUT_MS',
        10000,
      ),
      maxRetries: this.configService.get<number>(
        'CLOUDINARY_UPLOAD_MAX_RETRIES',
        2,
      ),
      retryDelayMs: this.configService.get<number>(
        'CLOUDINARY_UPLOAD_RETRY_DELAY_MS',
        300,
      ),
    };
  }

  private buildUploadForm(
    photoDataUrl: string,
    input: {
      apiKey: string;
      folder: string;
      publicId: string;
      signature: string;
      tags: string;
      timestamp: string;
      type: 'private';
    },
  ) {
    const form = new FormData();

    form.set('file', photoDataUrl);
    form.set('api_key', input.apiKey);
    form.set('folder', input.folder);
    form.set('public_id', input.publicId);
    form.set('tags', input.tags);
    form.set('timestamp', input.timestamp);
    form.set('signature', input.signature);
    form.set('type', input.type);

    return form;
  }

  private async uploadOnce(
    uploadUrl: string,
    form: FormData,
    timeoutMs: number,
  ): Promise<
    | { photo: StoredAttendancePhoto }
    | {
        failure: CloudinaryUploadFailure;
      }
  > {
    const abortController = new AbortController();
    const timeout = setTimeout(() => abortController.abort(), timeoutMs);

    try {
      const response = await fetch(uploadUrl, {
        method: 'POST',
        body: form,
        signal: abortController.signal,
      });
      const payload = (await response
        .json()
        .catch(() => ({}))) as CloudinaryUploadResponse;

      if (response.ok && payload.secure_url && payload.public_id) {
        return {
          photo: {
            publicId: payload.public_id,
            secureUrl: payload.secure_url,
          },
        };
      }

      return {
        failure: {
          statusCode: response.status,
          message:
            payload.error?.message ??
            `Cloudinary upload failed with HTTP ${response.status}.`,
          retryable: this.isRetryableStatus(response.status),
          timedOut: false,
        },
      };
    } catch (error) {
      const timedOut = this.isAbortError(error);

      return {
        failure: {
          statusCode: null,
          message: timedOut
            ? 'Cloudinary upload request timed out.'
            : 'Cloudinary upload request failed before a response was received.',
          retryable: true,
          timedOut,
        },
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  private isRetryableStatus(statusCode: number) {
    return statusCode === 408 || statusCode === 429 || statusCode >= 500;
  }

  private isAbortError(error: unknown) {
    return (
      error instanceof Error &&
      (error.name === 'AbortError' || error.message.includes('aborted'))
    );
  }

  private delay(delayMs: number) {
    return new Promise((resolve) => setTimeout(resolve, delayMs));
  }

  private getRequiredString(name: string) {
    const value = this.configService.get<string>(name)?.trim();

    if (!value) {
      throw new InternalServerErrorException(
        `${name} must be configured to store verification photos.`,
      );
    }

    return value;
  }

  private buildPublicId(
    input: {
      employeeId: string;
      occurredAt: Date;
      reason: string;
    },
    evidenceFingerprint: string,
  ) {
    const dateKey = input.occurredAt.toISOString().slice(0, 10);
    const instantKey = input.occurredAt
      .toISOString()
      .replace(/[^0-9A-Za-z]/g, '');

    return `${dateKey}/${input.employeeId}/${input.reason.toLowerCase()}-${instantKey}-${evidenceFingerprint}`;
  }

  private sign(params: Record<string, string>, apiSecret: string) {
    const source = Object.entries(params)
      .sort(([first], [second]) => first.localeCompare(second))
      .map(([key, value]) => `${key}=${value}`)
      .join('&');

    return createHash('sha1').update(`${source}${apiSecret}`).digest('hex');
  }
}
