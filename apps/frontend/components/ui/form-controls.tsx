import type { HTMLAttributes, InputHTMLAttributes, LabelHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

const controlClass = 'admin-control block min-h-10 w-full rounded-control border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none transition-colors duration-150 placeholder:text-slate-400 focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-focus-ring/20 disabled:cursor-not-allowed disabled:bg-surface-subtle disabled:text-slate-500 aria-[invalid=true]:border-danger aria-[invalid=true]:focus-visible:ring-danger/20';

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  const { className, ...rest } = props;
  return <input className={cn(controlClass, className)} {...rest} />;
}
export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  const { className, ...rest } = props;
  return <select className={cn(controlClass, className)} {...rest} />;
}
export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const { className, ...rest } = props;
  return <textarea className={cn(controlClass, 'min-h-24', className)} {...rest} />;
}
export function FieldLabel(props: LabelHTMLAttributes<HTMLLabelElement>) {
  const { className, ...rest } = props;
  return <label className={cn('mb-1.5 block text-sm font-medium text-slate-700', className)} {...rest} />;
}
export function FieldHint({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn('mt-1 text-xs leading-5 text-slate-500', className)} {...props} />;
}
export function FieldError({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p role="alert" className={cn('mt-1 text-xs leading-5 text-danger', className)} {...props} />;
}
