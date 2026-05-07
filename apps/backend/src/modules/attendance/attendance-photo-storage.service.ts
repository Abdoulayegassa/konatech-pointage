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
    this.assertDataUrl(photoDataUrl);

    if (process.env.NODE_ENV === 'test') {
      const publicId = this.buildPublicId(input);

      return {
        publicId,
        secureUrl: `https://res.cloudinary.com/test/image/upload/${publicId}.jpg`,
      };
    }

    const config = this.getConfig();
    const publicId = this.buildPublicId(input);
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const tags = 'attendance,verification';
    const signature = this.sign(
      {
        folder: config.folder,
        public_id: publicId,
        tags,
        timestamp,
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
          publicId,
          attempt,
          nextAttempt: attempt + 1,
          statusCode: lastFailure.statusCode,
          timedOut: lastFailure.timedOut,
          message: lastFailure.message,
        }),
      );

      await this.delay(config.retryDelayMs * attempt);
    }

    this.logger.error(
      JSON.stringify({
        event: 'cloudinary_upload_failed',
        publicId,
        statusCode: lastFailure?.statusCode ?? null,
        timedOut: lastFailure?.timedOut ?? false,
        message:
          lastFailure?.message ??
          'Cloudinary upload failed for unknown reason.',
      }),
    );

    if (lastFailure?.timedOut) {
      throw new GatewayTimeoutException(
        'Cloudinary photo upload timed out. Please retry verification.',
      );
    }

    throw new BadGatewayException(
      lastFailure?.message ?? 'Cloudinary photo upload failed.',
    );
  }

  private assertDataUrl(photoDataUrl: string) {
    if (
      !/^data:image\/(jpeg|jpg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(
        photoDataUrl,
      )
    ) {
      throw new BadRequestException(
        'Verification photo must be a valid image.',
      );
    }
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

  private buildPublicId(input: {
    employeeId: string;
    occurredAt: Date;
    reason: string;
  }) {
    const dateKey = input.occurredAt.toISOString().slice(0, 10);
    const instantKey = input.occurredAt
      .toISOString()
      .replace(/[^0-9A-Za-z]/g, '');

    return `${dateKey}/${input.employeeId}/${input.reason.toLowerCase()}-${instantKey}`;
  }

  private sign(params: Record<string, string>, apiSecret: string) {
    const source = Object.entries(params)
      .sort(([first], [second]) => first.localeCompare(second))
      .map(([key, value]) => `${key}=${value}`)
      .join('&');

    return createHash('sha1').update(`${source}${apiSecret}`).digest('hex');
  }
}
