import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  MembershipRole,
  MembershipStatus,
  OrganizationStatus,
  Prisma,
  UserStatus,
} from '@prisma/client';
import { createHash, randomBytes } from 'node:crypto';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  hashPassword,
  verifyPassword,
} from '../../common/security/password.util';
import { AuthenticationContext } from '../auth/interfaces/authentication-context.interface';
import { requireOrganizationContext } from '../auth/interfaces/organization-context.helpers';
import { EntitlementsService } from '../subscriptions/entitlements.service';

const INVITATION_LIFETIME_MS = 7 * 24 * 60 * 60 * 1_000;
const INVALID_INVITATION_MESSAGE = 'Invitation is invalid or unavailable.';

const invitationSelect = {
  id: true,
  invitedByUserId: true,
  email: true,
  role: true,
  expiresAt: true,
  acceptedAt: true,
  revokedAt: true,
  createdAt: true,
} satisfies Prisma.InvitationSelect;

type TransactionClient = Prisma.TransactionClient;

@Injectable()
export class InvitationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly entitlements: EntitlementsService,
  ) {}

  async create(
    email: string,
    authentication: AuthenticationContext,
    role: MembershipRole = MembershipRole.EMPLOYEE,
  ) {
    const context = requireOrganizationContext(authentication);
    return this.createForOrganization(
      email,
      context.organizationId,
      context.userId,
      role,
    );
  }

  async createForOrganization(
    email: string,
    organizationId: string,
    invitedByUserId: string,
    role: MembershipRole,
    transaction?: TransactionClient,
  ) {
    if (transaction) {
      return this.createInTransaction(
        email,
        organizationId,
        invitedByUserId,
        role,
        transaction,
      );
    }
    return this.prisma.$transaction((tx) =>
      this.createInTransaction(
        email,
        organizationId,
        invitedByUserId,
        role,
        tx,
      ),
    );
  }

  async provisionOrganizationWithFirstAdmin(input: {
    name: string;
    slug: string;
    timezone: string;
    firstAdminEmail: string;
    invitedByUserId: string;
  }) {
    return this.prisma.$transaction(async (transaction) => {
      const organization = await transaction.organization.create({
        data: { name: input.name, slug: input.slug, timezone: input.timezone },
        select: {
          id: true,
          name: true,
          slug: true,
          status: true,
          timezone: true,
          createdAt: true,
        },
      });
      const firstAdminInvitation = await this.createInTransaction(
        input.firstAdminEmail,
        organization.id,
        input.invitedByUserId,
        MembershipRole.ADMIN,
        transaction,
      );
      return { organization, firstAdminInvitation };
    });
  }

  private async createInTransaction(
    email: string,
    organizationId: string,
    invitedByUserId: string,
    role: MembershipRole,
    transaction: TransactionClient,
  ) {
    const normalizedEmail = this.normalizeEmail(email);

    await this.lockOrganization(transaction, organizationId);
    if (role === MembershipRole.ADMIN) {
      await this.entitlements.assertMayIncrease(
        organizationId,
        'activeAdministrators',
        transaction,
      );
    }
    const existingUser = await transaction.user.findUnique({
      where: { normalizedEmail },
      select: { id: true },
    });

    if (existingUser) {
      const existingMembership = await transaction.membership.findUnique({
        where: {
          organizationId_userId: {
            organizationId,
            userId: existingUser.id,
          },
        },
        select: { id: true },
      });

      if (existingMembership) {
        throw new ConflictException(
          'This account already has an organization Membership.',
        );
      }
    }

    const pendingInvitation = await transaction.invitation.findFirst({
      where: {
        organizationId,
        email: normalizedEmail,
        acceptedAt: null,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      select: { id: true },
    });

    if (pendingInvitation) {
      throw new ConflictException(
        'An active invitation already exists for this email.',
      );
    }

    const token = randomBytes(32).toString('base64url');
    const invitation = await transaction.invitation.create({
      data: {
        organizationId,
        invitedByUserId,
        email: normalizedEmail,
        role,
        tokenHash: this.hashToken(token),
        expiresAt: new Date(Date.now() + INVITATION_LIFETIME_MS),
      },
      select: invitationSelect,
    });

    return { invitation, token };
  }

  list(authentication: AuthenticationContext) {
    const context = requireOrganizationContext(authentication);

    return this.prisma.invitation.findMany({
      where: { organizationId: context.organizationId },
      select: invitationSelect,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(invitationId: string, authentication: AuthenticationContext) {
    const context = requireOrganizationContext(authentication);
    const invitation = await this.prisma.invitation.findFirst({
      where: {
        id: invitationId,
        organizationId: context.organizationId,
      },
      select: invitationSelect,
    });

    if (!invitation) {
      throw new NotFoundException('Invitation not found.');
    }

    return invitation;
  }

  revoke(invitationId: string, authentication: AuthenticationContext) {
    const context = requireOrganizationContext(authentication);

    return this.prisma.$transaction(async (transaction) => {
      await this.lockOrganization(transaction, context.organizationId);
      const locked = await transaction.$queryRaw<Array<{ id: string }>>(
        Prisma.sql`SELECT id FROM "Invitation" WHERE id = ${invitationId} AND "organizationId" = ${context.organizationId} FOR UPDATE`,
      );
      const lockedInvitationId = locked[0]?.id;

      if (!lockedInvitationId) {
        throw new NotFoundException('Invitation not found.');
      }

      const invitation = await transaction.invitation.findUnique({
        where: {
          id: lockedInvitationId,
        },
        select: {
          ...invitationSelect,
          organizationId: true,
        },
      });

      if (!invitation || invitation.organizationId !== context.organizationId) {
        throw new NotFoundException('Invitation not found.');
      }
      if (invitation.acceptedAt || invitation.revokedAt) {
        throw new ConflictException('Invitation can no longer be revoked.');
      }

      return transaction.invitation.update({
        where: { id: invitation.id },
        data: { revokedAt: new Date() },
        select: invitationSelect,
      });
    });
  }

  accept(token: string, password: string) {
    const tokenHash = this.hashToken(token);

    return this.prisma.$transaction(async (transaction) => {
      const candidate = await transaction.invitation.findUnique({
        where: { tokenHash },
        select: { id: true, organizationId: true },
      });

      if (!candidate) {
        throw new BadRequestException(INVALID_INVITATION_MESSAGE);
      }

      await this.lockOrganization(transaction, candidate.organizationId);
      await this.entitlements.assertOperationalWriteAllowed(
        candidate.organizationId,
        transaction,
      );
      const locked = await transaction.$queryRaw<Array<{ id: string }>>(
        Prisma.sql`SELECT id FROM "Invitation" WHERE "tokenHash" = ${tokenHash} FOR UPDATE`,
      );
      const invitationId = locked[0]?.id;

      if (!invitationId) {
        throw new BadRequestException(INVALID_INVITATION_MESSAGE);
      }

      const invitation = await transaction.invitation.findUnique({
        where: { id: invitationId },
        select: {
          id: true,
          organizationId: true,
          email: true,
          role: true,
          expiresAt: true,
          acceptedAt: true,
          revokedAt: true,
          organization: {
            select: {
              id: true,
              name: true,
              slug: true,
              status: true,
            },
          },
        },
      });

      if (
        !invitation ||
        invitation.acceptedAt ||
        invitation.revokedAt ||
        invitation.expiresAt.getTime() <= Date.now() ||
        invitation.organization.status !== OrganizationStatus.ACTIVE
      ) {
        throw new BadRequestException(INVALID_INVITATION_MESSAGE);
      }

      const normalizedEmail = this.normalizeEmail(invitation.email);
      let user = await transaction.user.findUnique({
        where: { normalizedEmail },
        select: {
          id: true,
          normalizedEmail: true,
          passwordHash: true,
          status: true,
        },
      });

      if (user) {
        if (
          user.status !== UserStatus.ACTIVE ||
          !(await verifyPassword(password, user.passwordHash))
        ) {
          throw new UnauthorizedException('Invalid invitation credentials.');
        }
      } else {
        user = await transaction.user.create({
          data: {
            normalizedEmail,
            passwordHash: await hashPassword(password),
          },
          select: {
            id: true,
            normalizedEmail: true,
            passwordHash: true,
            status: true,
          },
        });
      }

      const existingMembership = await transaction.membership.findUnique({
        where: {
          organizationId_userId: {
            organizationId: invitation.organizationId,
            userId: user.id,
          },
        },
        select: {
          id: true,
          role: true,
          status: true,
        },
      });

      let membership;
      if (invitation.role === MembershipRole.ADMIN) {
        await this.entitlements.assertMayIncrease(
          invitation.organizationId,
          'activeAdministrators',
          transaction,
          invitation.id,
        );
      }
      if (!existingMembership) {
        membership = await transaction.membership.create({
          data: {
            organizationId: invitation.organizationId,
            userId: user.id,
            role: invitation.role,
          },
          select: {
            id: true,
            userId: true,
            role: true,
            status: true,
            createdAt: true,
            updatedAt: true,
          },
        });
      } else if (
        existingMembership.status === MembershipStatus.SUSPENDED &&
        existingMembership.role !== MembershipRole.ADMIN
      ) {
        membership = await transaction.membership.update({
          where: { id: existingMembership.id },
          data: {
            role: invitation.role,
            status: MembershipStatus.ACTIVE,
            membershipVersion: { increment: 1 },
          },
          select: {
            id: true,
            userId: true,
            role: true,
            status: true,
            createdAt: true,
            updatedAt: true,
          },
        });
      } else {
        throw new ConflictException(
          'Invitation cannot change the existing Membership.',
        );
      }

      await this.linkMatchingEmployee(
        transaction,
        invitation.organizationId,
        normalizedEmail,
        user.id,
      );

      await transaction.invitation.update({
        where: { id: invitation.id },
        data: { acceptedAt: new Date() },
        select: { id: true },
      });

      return {
        invitationId: invitation.id,
        user: { id: user.id, normalizedEmail: user.normalizedEmail },
        membership,
        organization: {
          id: invitation.organization.id,
          name: invitation.organization.name,
          slug: invitation.organization.slug,
        },
      };
    });
  }

  private normalizeEmail(email: string) {
    return email.trim().toLowerCase();
  }

  private hashToken(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }

  /**
   * An invitation grants SaaS account access; it does not create an Employee.
   * If HR has already created exactly one unlinked Employee with the invited
   * email in this organization, bind that operational identity to the account
   * in the same transaction.  Ambiguous legacy data must be repaired instead
   * of silently choosing an employee.
   */
  private async linkMatchingEmployee(
    transaction: TransactionClient,
    organizationId: string,
    normalizedEmail: string,
    userId: string,
  ) {
    const employees = await transaction.employee.findMany({
      where: {
        organizationId,
        email: { equals: normalizedEmail, mode: 'insensitive' },
      },
      select: { id: true, userId: true },
    });

    if (employees.length > 1) {
      throw new ConflictException(
        'Multiple employee profiles match this invitation email.',
      );
    }

    const employee = employees[0];
    if (!employee || employee.userId === userId) {
      return;
    }

    if (employee.userId) {
      throw new ConflictException(
        'The matching employee profile is already linked to another account.',
      );
    }

    await transaction.employee.update({
      where: { id: employee.id },
      data: { userId },
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
}
