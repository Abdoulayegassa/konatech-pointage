import type { MembershipRole } from '@prisma/client';
import type { PublicEmployee } from '../../../common/prisma/selects';

export type AuthenticationPurpose = 'account' | 'attendance_entry';
export type AuthenticationGeneration = 'legacy' | 'saas';

export type AuthenticationContext = {
  generation: AuthenticationGeneration;
  purpose: AuthenticationPurpose;
  userId: string | null;
  membershipId: string | null;
  organizationId: string | null;
  membershipRole: MembershipRole | null;
  employeeId: string | null;
  attendanceSiteId: string | null;
};

export type OrganizationContext = AuthenticationContext & {
  generation: 'saas';
  purpose: 'account';
  userId: string;
  membershipId: string;
  organizationId: string;
  membershipRole: MembershipRole;
};

export type AuthenticationResult = {
  context: AuthenticationContext;
  employee: PublicEmployee | null;
};

export type ExpectedAuthenticationPurpose = AuthenticationPurpose | 'any';
