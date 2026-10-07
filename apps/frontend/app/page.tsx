import { redirect } from 'next/navigation';
import { requireCurrentUser } from '@/lib/auth';

export default async function HomePage() {
  const user = await requireCurrentUser();
  redirect(user.membership?.role === 'EMPLOYEE' || user.accessRole === 'EMPLOYEE'
    ? '/my-attendance'
    : '/dashboard');
}
