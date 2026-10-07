import { cva, type VariantProps } from 'class-variance-authority';
import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center rounded-full border px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] backdrop-blur-sm transition-colors duration-200',
  {
    variants: {
      variant: {
        neutral: 'border-border bg-slate-100 text-slate-700',
        default: 'border-transparent bg-primary text-primary-foreground',
        outline: 'border-border/80 bg-white/78 text-foreground',
        success: 'border-transparent bg-success/15 text-success',
        warning: 'border-transparent bg-accent/15 text-accent',
        danger: 'border-transparent bg-red-50 text-red-700',
        info: 'border-transparent bg-blue-50 text-blue-700',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

type BadgeProps = HTMLAttributes<HTMLSpanElement> &
  VariantProps<typeof badgeVariants>;

export function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <span data-variant={variant ?? 'default'} className={cn('admin-badge', badgeVariants({ variant }), className)} {...props} />
  );
}
