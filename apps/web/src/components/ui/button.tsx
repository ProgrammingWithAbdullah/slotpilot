import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/cn';
import { Spinner } from './spinner';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg font-medium transition-[color,background-color,box-shadow,scale,filter] duration-150 ease-out enabled:active:scale-[0.96] disabled:pointer-events-none disabled:opacity-50 cursor-pointer select-none',
  {
    variants: {
      variant: {
        primary: 'bg-primary text-primary-fg hover:bg-primary-hover shadow-[var(--shadow-button)]',
        secondary: 'bg-surface text-fg border border-border shadow-[var(--shadow-card)] hover:bg-surface-muted',
        ghost: 'text-fg-muted hover:bg-surface-muted hover:text-fg',
        soft: 'bg-primary-soft text-primary-soft-fg hover:brightness-95',
        danger: 'bg-danger text-white hover:brightness-110',
        link: 'text-primary underline decoration-primary/30 underline-offset-4 hover:decoration-primary px-0 h-auto enabled:active:scale-100',
      },
      size: {
        sm: 'h-8 px-3 text-sm',
        md: 'h-10 px-4 text-sm',
        lg: 'h-11 px-5 text-[15px]',
        icon: 'size-10',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
);

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, loading, disabled, children, type = 'button', ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      className={cn(buttonVariants({ variant, size }), className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading && <Spinner className="size-4" />}
      {children}
    </button>
  ),
);
Button.displayName = 'Button';
