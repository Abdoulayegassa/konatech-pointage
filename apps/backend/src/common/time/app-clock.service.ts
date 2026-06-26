import { Injectable } from '@nestjs/common';

@Injectable()
export class AppClockService {
  now() {
    return new Date();
  }
}
