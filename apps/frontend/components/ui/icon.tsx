import type { ReactNode, SVGProps } from 'react';

export type IconName =
  | 'activity' | 'arrow-left' | 'arrow-right' | 'building' | 'calendar'
  | 'chart' | 'check' | 'chevron-down' | 'clock' | 'credit-card'
  | 'dashboard' | 'edit' | 'filter' | 'globe' | 'inbox' | 'menu' | 'more'
  | 'pin' | 'plus' | 'qr' | 'search' | 'settings' | 'shield'
  | 'sliders' | 'users' | 'x';

type IconProps = SVGProps<SVGSVGElement> & { name: IconName };

export function Icon({ name, ...props }: IconProps) {
  const common = {
    fill: 'none',
    stroke: 'currentColor',
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    strokeWidth: 1.8,
  };

  const shapes: Record<IconName, ReactNode> = {
    activity: <><path d="M3 12h4l2.3-7 4.4 14 2.3-7H21" /></>,
    'arrow-left': <><path d="m14 18-6-6 6-6" /><path d="M8 12h12" /></>,
    'arrow-right': <><path d="M5 12h14" /><path d="m13 6 6 6-6 6" /></>,
    building: <><path d="M4 21V5l8-2v18" /><path d="M12 8h8v13" /><path d="M7 7h2M7 11h2M7 15h2M15 12h2M15 16h2M9 21v-3h2v3" /></>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 10h18" /></>,
    chart: <><path d="M4 19V5M4 19h17" /><path d="m7 15 4-4 3 2 6-7" /></>,
    check: <><path d="m5 12 4 4L19 6" /></>,
    'chevron-down': <><path d="m6 9 6 6 6-6" /></>,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    'credit-card': <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 10h18M7 15h3" /></>,
    dashboard: <><rect x="3" y="3" width="8" height="8" rx="1.5" /><rect x="13" y="3" width="8" height="5" rx="1.5" /><rect x="13" y="10" width="8" height="11" rx="1.5" /><rect x="3" y="13" width="8" height="8" rx="1.5" /></>,
    edit: <><path d="m15 5 4 4M4 20l4-.8L19 8a2.8 2.8 0 0 0-4-4L4 15z" /><path d="M13.5 6.5 17.5 10.5" /></>,
    filter: <><path d="M4 6h16M7 12h10M10 18h4" /></>,
    globe: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" /></>,
    inbox: <><path d="M4 4h16l2 11v5H2v-5L4 4Z" /><path d="M2 14h6l2 3h4l2-3h6" /></>,
    menu: <><path d="M4 6h16M4 12h16M4 18h16" /></>,
    more: <><circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /></>,
    pin: <><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z" /><circle cx="12" cy="10" r="2.5" /></>,
    plus: <><path d="M12 5v14M5 12h14" /></>,
    qr: <><path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2v2h-2zM18 14h2M14 18v2M18 18h2v2h-2z" /></>,
    search: <><circle cx="10.8" cy="10.8" r="6.8" /><path d="m16 16 4.5 4.5" /></>,
    settings: <><circle cx="12" cy="12" r="3" /><path d="m19.4 15 .1.1 1.2 1-.9 1.6-1.5-.5a8 8 0 0 1-1.8 1l-.3 1.6h-1.9l-.3-1.6a8 8 0 0 1-1.8-1l-1.5.5-.9-1.6 1.2-1a7 7 0 0 1 0-2l-1.2-1 .9-1.6 1.5.5a8 8 0 0 1 1.8-1l.3-1.6h1.9l.3 1.6a8 8 0 0 1 1.8 1l1.5-.5.9 1.6-1.2 1a7 7 0 0 1 0 2Z" transform="translate(-1 -1)" /></>,
    shield: <><path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11Z" /><path d="m9 12 2 2 4-4" /></>,
    sliders: <><path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h9M17 18h3" /><circle cx="15" cy="6" r="2" /><circle cx="9" cy="12" r="2" /><circle cx="15" cy="18" r="2" /></>,
    users: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8" /></>,
    x: <><path d="m18 6-12 12M6 6l12 12" /></>,
  };

  return <svg aria-hidden="true" viewBox="0 0 24 24" {...common} {...props}>{shapes[name]}</svg>;
}
