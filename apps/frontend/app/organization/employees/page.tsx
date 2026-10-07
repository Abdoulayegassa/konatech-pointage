import type { Metadata } from 'next';
import EmployeesPage from '@/app/employees/page';
export const metadata: Metadata = { title: 'Employés' };

export default function OrganizationEmployeesPage() {
  return EmployeesPage({ searchParams: Promise.resolve({ view: 'employees' }) });
}
