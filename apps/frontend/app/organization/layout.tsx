import { requireOrganizationAdmin } from '@/lib/admin-site-context';

export default async function OrganizationLayout({ children }: { children: React.ReactNode }) {
  await requireOrganizationAdmin();
  return children;
}
