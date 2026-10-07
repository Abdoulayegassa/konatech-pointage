import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { isValidTimeZone } from '../utils/attendance-date.util';
import { AuthenticationContext } from '../../modules/auth/interfaces/authentication-context.interface';

@Injectable()
export class OrganizationTimezoneService {
  constructor(private readonly prisma: PrismaService) {}

  async resolve(authentication?: AuthenticationContext) {
    if (!authentication || authentication.generation === 'legacy') return 'UTC';
    if (!authentication.organizationId) {
      throw new BadRequestException(
        'A valid organization context is required.',
      );
    }
    return this.resolveForOrganization(authentication.organizationId);
  }

  async resolveForOrganization(organizationId: string) {
    const organization = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { timezone: true },
    });
    if (!organization || !isValidTimeZone(organization.timezone)) {
      throw new ServiceUnavailableException(
        'Organization timezone is unavailable or invalid.',
      );
    }
    return organization.timezone;
  }
}
