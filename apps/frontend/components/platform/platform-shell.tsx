import type { ReactNode } from 'react';
import { PageShell } from '@/components/layout/page-shell';
import { PlatformNav, type PlatformSection } from '@/components/platform/platform-nav';

export function PlatformShell({
  children,
  activeSection,
  maxWidthClassName = 'max-w-[1500px]',
}: {
  children: ReactNode;
  activeSection: PlatformSection;
  maxWidthClassName?: string;
}) {
  return (
    <PageShell
      as="div"
      className="inout-admin-foundation"
      maxWidthClassName={maxWidthClassName}
      platformNavigation
      showDecorativeBackground={false}
    >
      <PlatformNav activeSection={activeSection} />
      {children}
    </PageShell>
  );
}
