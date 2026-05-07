import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class AttendanceEntryService {
  constructor(private readonly configService: ConfigService) {}

  getFixedEntryUrl() {
    const frontendUrl = this.configService
      .getOrThrow<string>('FRONTEND_URL')
      .replace(/\/$/, '');

    return `${frontendUrl}/attendance-entry`;
  }
}
