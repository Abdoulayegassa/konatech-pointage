'use client';

import { useState } from 'react';
import Link from 'next/link';
import { AttendanceEntryQrCard } from '@/components/dashboard/attendance-entry-qr-card';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

type QuickActionsSectionProps = {
  attendanceEntryPath: string;
  initialAttendanceEntryUrl: string;
};

type QuickActionTone = 'primary' | 'accent' | 'success' | 'info';

type QuickActionLink = {
  description: string;
  href: string;
  icon: string;
  title: string;
  tone: QuickActionTone;
};

type ExpandableAction = 'qr';

const toneClassNames: Record<
  QuickActionTone,
  {
    icon: string;
    link: string;
  }
> = {
  primary: {
    icon: 'border-primary/15 bg-primary/10 text-primary',
    link: 'hover:border-primary/20 hover:bg-primary/5',
  },
  accent: {
    icon: 'border-accent/15 bg-accent/10 text-accent',
    link: 'hover:border-accent/20 hover:bg-accent/5',
  },
  success: {
    icon: 'border-success/15 bg-success/10 text-success',
    link: 'hover:border-success/20 hover:bg-success/5',
  },
  info: {
    icon: 'border-blue-500/15 bg-blue-50 text-blue-700',
    link: 'hover:border-blue-500/20 hover:bg-blue-50/70',
  },
};

const adminLinks: QuickActionLink[] = [
  {
    description: 'Générer un rapport mensuel RH',
    href: '/exports',
    icon: 'PDF',
    title: 'Exporter un rapport',
    tone: 'accent',
  },
  {
    description: 'Ajouter un nouvel employé',
    href: '/employees',
    icon: '+U',
    title: 'Créer un employé',
    tone: 'success',
  },
  {
    description: 'Créer ou affecter un planning',
    href: '/schedules',
    icon: 'CAL',
    title: 'Créer un planning',
    tone: 'info',
  },
];

function QuickActionContent({
  description,
  icon,
  title,
  tone,
}: {
  description: string;
  icon: string;
  title: string;
  tone: QuickActionTone;
}) {
  const toneClassName = toneClassNames[tone];

  return (
    <>
      <span
        className={cn(
          'grid h-12 w-12 shrink-0 place-items-center rounded-[18px] border text-sm font-black',
          toneClassName.icon,
        )}
      >
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block text-base font-black text-slate-950">
          {title}
        </span>
        <span className="mt-1 block text-sm font-semibold leading-5 text-slate-500">
          {description}
        </span>
      </span>
    </>
  );
}

function ExpandableActionCard({
  action,
  description,
  icon,
  isActive,
  onSelect,
  title,
  tone,
}: {
  action: ExpandableAction;
  description: string;
  icon: string;
  isActive: boolean;
  onSelect: (action: ExpandableAction) => void;
  title: string;
  tone: QuickActionTone;
}) {
  const toneClassName = toneClassNames[tone];

  return (
    <button
      className={cn(
        'flex min-h-[112px] w-full items-center gap-3 rounded-[22px] border border-slate-200 bg-slate-50/80 p-4 text-left shadow-sm transition duration-200 hover:-translate-y-0.5 hover:bg-white hover:shadow-[0_14px_30px_rgba(15,45,58,0.08)]',
        toneClassName.link,
        isActive ? 'border-slate-300 bg-white shadow-[0_14px_30px_rgba(15,45,58,0.08)]' : null,
      )}
      onClick={() => onSelect(action)}
      type="button"
    >
      <QuickActionContent
        description={description}
        icon={icon}
        title={title}
        tone={tone}
      />
    </button>
  );
}

function QuickActionLinkCard({ action }: { action: QuickActionLink }) {
  const toneClassName = toneClassNames[action.tone];

  return (
    <Link
      className={cn(
        'flex min-h-[112px] items-center gap-3 rounded-[22px] border border-slate-200 bg-slate-50/80 p-4 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:bg-white hover:shadow-[0_14px_30px_rgba(15,45,58,0.08)]',
        toneClassName.link,
      )}
      href={action.href}
    >
      <QuickActionContent
        description={action.description}
        icon={action.icon}
        title={action.title}
        tone={action.tone}
      />
    </Link>
  );
}

export function QuickActionsSection({
  attendanceEntryPath,
  initialAttendanceEntryUrl,
}: QuickActionsSectionProps) {
  const [activeAction, setActiveAction] = useState<ExpandableAction | null>(
    null,
  );

  function toggleAction(action: ExpandableAction) {
    setActiveAction((currentAction) =>
      currentAction === action ? null : action,
    );
  }

  return (
    <section className="space-y-4" id="actions-rapides">
      <div>
        <Badge variant="outline">Administration</Badge>
        <h2 className="mt-2 text-xl font-black text-slate-950">
          Actions rapides
        </h2>
      </div>

      <Card className="overflow-hidden rounded-[28px] border-slate-200/80 bg-white/95 shadow-[0_18px_44px_rgba(15,45,58,0.07)]">
        <CardHeader className="border-b border-slate-200/70 pb-4">
          <CardTitle className="text-lg text-slate-950">
            Outils administratifs
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 p-4">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <ExpandableActionCard
              action="qr"
              description="Accéder au terminal de pointage"
              icon="QR"
              isActive={activeAction === 'qr'}
              onSelect={toggleAction}
              title="QR Pointage"
              tone="primary"
            />

            {adminLinks.map((action) => (
              <QuickActionLinkCard action={action} key={action.title} />
            ))}
          </div>

          {activeAction ? (
            <div className="rounded-[24px] border border-slate-200 bg-slate-50/80 p-3">
              <AttendanceEntryQrCard
                attendanceEntryPath={attendanceEntryPath}
                initialAttendanceEntryUrl={initialAttendanceEntryUrl}
              />
            </div>
          ) : null}
        </CardContent>
      </Card>
    </section>
  );
}
