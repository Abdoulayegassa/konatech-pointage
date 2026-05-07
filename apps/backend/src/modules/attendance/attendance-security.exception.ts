import { BadRequestException } from '@nestjs/common';

export class AttendanceSecurityLocationRequiredException extends BadRequestException {
  constructor() {
    super('La geolocalisation est obligatoire pour pointer.');
  }
}

export class AttendanceSecurityOutsideZoneException extends BadRequestException {
  constructor() {
    super('Vous devez etre dans la zone autorisee pour pointer.');
  }
}

export class AttendanceSecurityAccuracyTooLowException extends BadRequestException {
  constructor() {
    super('La precision GPS est insuffisante pour valider ce pointage.');
  }
}
