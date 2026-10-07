import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { MembershipRole, MembershipStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuthenticationContext } from '../auth/interfaces/authentication-context.interface';
import { requireOrganizationContext } from '../auth/interfaces/organization-context.helpers';
import { EntitlementsService } from '../subscriptions/entitlements.service';

const membershipSelect = {
  id: true,
  userId: true,
  role: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  user: {
    select: {
      id: true,
      normalizedEmail: true,
    },
  },
} satisfies Prisma.MembershipSelect;

type TransactionClient = Prisma.TransactionClient;

@Injectable()
export class MembershipsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly entitlements: EntitlementsService,
  ) {}

  list(authentication: AuthenticationContext) {
    const context = requireOrganizationContext(authentication);

    return this.prisma.membership.findMany({
      where: { organizationId: context.organizationId },
      select: membershipSelect,
      orderBy: [{ role: 'asc' }, { createdAt: 'asc' }],
    });
  }

  async findOne(membershipId: string, authentication: AuthenticationContext) {
    const context = requireOrganizationContext(authentication);
    const membership = await this.prisma.membership.findFirst({
      where: {
        id: membershipId,
        organizationId: context.organizationId,
      },
      select: membershipSelect,
    });

    if (!membership) {
      throw new NotFoundException('Membership not found.');
    }

    return membership;
  }

  changeRole(
    membershipId: string,
    role: MembershipRole,
    authentication: AuthenticationContext,
  ) {
    const context = requireOrganizationContext(authentication);

    return this.prisma.$transaction(async (transaction) => {
      await this.lockOrganization(transaction, context.organizationId);
      const membership = await this.findScopedForMutation(
        transaction,
        membershipId,
        context.organizationId,
      );
      this.assertActorMayChangeRole(
        context.membershipRole,
        membership.role,
        role,
      );

      if (membership.role === role) {
        throw new BadRequestException('Membership already has this role.');
      }
      if (
        membership.status === MembershipStatus.ACTIVE &&
        membership.role !== MembershipRole.ADMIN &&
        role === MembershipRole.ADMIN
      ) {
        await this.entitlements.assertMayIncrease(
          context.organizationId,
          'activeAdministrators',
          transaction,
        );
      }

      await this.protectLastAdmin(transaction, membership, {
        role,
        status: membership.status,
      });

      const updated = await transaction.membership.update({
        where: { id: membership.id },
        data: {
          role,
          membershipVersion: { increment: 1 },
        },
        select: membershipSelect,
      });

      return {
        membership: updated,
        previousRole: membership.role,
        previousStatus: membership.status,
      };
    });
  }

  changeStatus(
    membershipId: string,
    status: MembershipStatus,
    authentication: AuthenticationContext,
  ) {
    const context = requireOrganizationContext(authentication);

    return this.prisma.$transaction(async (transaction) => {
      await this.lockOrganization(transaction, context.organizationId);
      const membership = await this.findScopedForMutation(
        transaction,
        membershipId,
        context.organizationId,
      );
      this.assertActorMayChangeStatus(context.membershipRole, membership.role);

      this.assertStatusTransition(membership.status, status);
      if (
        membership.status !== MembershipStatus.ACTIVE &&
        status === MembershipStatus.ACTIVE &&
        membership.role === MembershipRole.ADMIN
      ) {
        await this.entitlements.assertMayIncrease(
          context.organizationId,
          'activeAdministrators',
          transaction,
        );
      }
      await this.protectLastAdmin(transaction, membership, {
        role: membership.role,
        status,
      });

      const updated = await transaction.membership.update({
        where: { id: membership.id },
        data: {
          status,
          membershipVersion: { increment: 1 },
        },
        select: membershipSelect,
      });

      return {
        membership: updated,
        previousRole: membership.role,
        previousStatus: membership.status,
      };
    });
  }

  private async lockOrganization(
    transaction: TransactionClient,
    organizationId: string,
  ) {
    await transaction.$queryRaw(
      Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${organizationId}, 0))::text AS lock_result`,
    );
  }

  private async findScopedForMutation(
    transaction: TransactionClient,
    membershipId: string,
    organizationId: string,
  ) {
    const membership = await transaction.membership.findFirst({
      where: { id: membershipId, organizationId },
      select: {
        id: true,
        organizationId: true,
        userId: true,
        role: true,
        status: true,
      },
    });

    if (!membership) {
      throw new NotFoundException('Membership not found.');
    }

    return membership;
  }

  private async protectLastAdmin(
    transaction: TransactionClient,
    current: {
      id: string;
      organizationId: string;
      role: MembershipRole;
      status: MembershipStatus;
    },
    next: { role: MembershipRole; status: MembershipStatus },
  ) {
    const isActiveAdmin =
      current.role === MembershipRole.ADMIN &&
      current.status === MembershipStatus.ACTIVE;
    const remainsActiveAdmin =
      next.role === MembershipRole.ADMIN &&
      next.status === MembershipStatus.ACTIVE;

    if (!isActiveAdmin || remainsActiveAdmin) {
      return;
    }

    const activeAdminCount = await transaction.membership.count({
      where: {
        organizationId: current.organizationId,
        role: MembershipRole.ADMIN,
        status: MembershipStatus.ACTIVE,
      },
    });

    if (activeAdminCount <= 1) {
      throw new ConflictException(
        'The organization must retain at least one active administrator.',
      );
    }
  }

  private assertActorMayChangeRole(
    _actorRole: MembershipRole,
    _currentRole: MembershipRole,
    _nextRole: MembershipRole,
  ) {}

  private assertActorMayChangeStatus(
    _actorRole: MembershipRole,
    _targetRole: MembershipRole,
  ) {}

  private assertStatusTransition(
    current: MembershipStatus,
    next: MembershipStatus,
  ) {
    if (current === next) {
      throw new BadRequestException('Membership already has this status.');
    }

    if (current === MembershipStatus.REVOKED) {
      throw new ConflictException(
        'A revoked Membership cannot be reactivated.',
      );
    }

    const allowed =
      (current === MembershipStatus.ACTIVE &&
        (next === MembershipStatus.SUSPENDED ||
          next === MembershipStatus.REVOKED)) ||
      (current === MembershipStatus.SUSPENDED &&
        (next === MembershipStatus.ACTIVE ||
          next === MembershipStatus.REVOKED));

    if (!allowed) {
      throw new BadRequestException('Invalid Membership status transition.');
    }
  }
}
