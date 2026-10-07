import type { Metadata } from 'next';
import EmployeesPage from '@/app/employees/page';
export const metadata: Metadata = { title: 'Membres' };

export default function OrganizationMembersPage() {
  return EmployeesPage({ searchParams: Promise.resolve({ view: 'members' }) });
}
