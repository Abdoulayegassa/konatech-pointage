import { cva, type VariantProps } from 'class-variance-authority';
import type { ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center rounded-2xl text-sm font-semibold transition-all duration-300 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/20 focus-visible:ring-offset-2 active:scale-[0.985] disabled:pointer-events-none disabled:opacity-55 motion-reduce:transform-none motion-reduce:transition-none',
  {
    variants: {
      variant: {
        default:
          'bg-primary text-primary-foreground shadow-[0_14px_30px_rgba(16,50,60,0.18)] hover:-translate-y-0.5 hover:bg-primary/95 hover:shadow-[0_18px_36px_rgba(16,50,60,0.22)]',
        secondary:
          'border border-border bg-white/92 text-foreground shadow-[0_10px_24px_rgba(15,45,58,0.07)] hover:-translate-y-0.5 hover:bg-white hover:shadow-[0_16px_30px_rgba(15,45,58,0.12)]',
        ghost:
          'border border-transparent bg-transparent text-slate-600 shadow-none hover:-translate-y-0.5 hover:bg-white/80 hover:text-slate-950 hover:shadow-[0_10px_24px_rgba(15,45,58,0.08)]',
      },
      size: {
        default: 'px-5 py-3',
        sm: 'px-3.5 py-2.5 text-xs',
        lg: 'px-5 py-4 text-base',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants>;

function Button({ className, size, variant, ...props }: ButtonProps) {
  return (
    <button
      className={cn(buttonVariants({ size, variant }), className)}
      {...props}
    />
  );
}

export { Button, buttonVariants };
