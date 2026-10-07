import type { Metadata } from 'next';
import EmployeesPage from '@/app/employees/page';
export const metadata: Metadata = { title: 'Invitations' };

export default function OrganizationInvitationsPage() {
  return EmployeesPage({ searchParams: Promise.resolve({ view: 'invitations-page' }) });
}
