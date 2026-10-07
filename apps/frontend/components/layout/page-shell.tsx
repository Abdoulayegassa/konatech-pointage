import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

type PageShellProps = {
  children: ReactNode;
  className?: string;
  contentClassName?: string;
  maxWidthClassName?: string;
  as?: 'main' | 'div';
  adminNavigation?: boolean;
  adminNavLayout?: boolean;
  platformNavigation?: boolean;
  showDecorativeBackground?: boolean;
};

export function PageShell({
  children,
  className,
  contentClassName,
  maxWidthClassName = 'max-w-7xl',
  as = 'main',
  adminNavigation = false,
  adminNavLayout = false,
  platformNavigation = false,
  showDecorativeBackground = true,
}: PageShellProps) {
  const Root = as;
  const hasAdminNavigation = adminNavigation || adminNavLayout;
  const platformShellPadding =
    'px-4 py-4 sm:px-6 lg:py-6 lg:pl-[17rem] lg:pr-8';
  const defaultShellPadding =
    'px-4 py-4 sm:px-6 lg:px-8 lg:py-6';
  return (
    <Root
      className={cn(
        'relative min-h-screen',
        platformNavigation ? platformShellPadding : defaultShellPadding,
        (hasAdminNavigation || platformNavigation) ? 'admin-surface font-sans' : 'overflow-hidden',
        hasAdminNavigation && 'min-w-0 lg:pl-[17rem] lg:pr-8',
        className,
      )}
    >
      {showDecorativeBackground && !hasAdminNavigation && !platformNavigation ? <div className="pointer-events-none absolute inset-x-0 top-0 h-[420px] bg-[radial-gradient(circle_at_top_left,rgba(244,110,40,0.16),transparent_34%),radial-gradient(circle_at_top_right,rgba(16,50,60,0.11),transparent_36%)]" /> : null}

      <div
        className={cn(
          cn('flex w-full min-w-0 flex-col gap-5 lg:gap-6', adminNavigation && 'gap-4 lg:gap-5'),
          (adminNavigation || platformNavigation) ? 'max-w-none' : 'mx-auto',
          !(adminNavigation || platformNavigation) && maxWidthClassName,
          contentClassName,
        )}
      >
        {children}
      </div>
    </Root>
  );
}

export function AdminPageHeader({ title, description, context, actions, primaryAction, secondaryActions, heading = 'h1', id, className }: {
  title: string;
  description?: string;
  context?: string;
  actions?: ReactNode;
  primaryAction?: ReactNode;
  secondaryActions?: ReactNode;
  heading?: 'h1' | 'h2';
  id?: string;
  className?: string;
}) {
  const Heading = heading;
  return <header className={cn('admin-page-header flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between', className)}>
    <div className="min-w-0 space-y-1">
      {context ? <p className="text-sm font-medium text-slate-600">{context}</p> : null}
      <Heading className="text-[1.75rem] font-semibold leading-tight tracking-tight text-slate-950 sm:text-[2rem]" id={id}>{title}</Heading>
      {description ? <p className="max-w-3xl text-sm leading-5 text-slate-600">{description}</p> : null}
    </div>
    {actions || secondaryActions || primaryAction ? <div className="flex min-w-0 shrink-0 flex-wrap gap-2 sm:justify-end">
      {secondaryActions}
      {actions}
      {primaryAction}
    </div> : null}
  </header>;
}
