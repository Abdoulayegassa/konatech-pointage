import type { AccessRole, MembershipRole } from '@prisma/client';

export type AuthorizationActor = {
  actorType: 'USER' | 'EMPLOYEE';
  actorId: string;
  organizationId: string | null;
  role: MembershipRole | AccessRole | 'PLATFORM_ADMIN';
  employeeId: string | null;
};
