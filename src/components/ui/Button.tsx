import { forwardRef, type ButtonHTMLAttributes } from 'react';

type Variant = 'gold' | 'ghost' | 'quiet';

const VARIANTS: Record<Variant, string> = {
  gold:
    'bg-gold text-night font-semibold shadow-[0_8px_30px_-8px_rgb(245_199_106/0.6)] hover:bg-[#ffd788] active:translate-y-px disabled:bg-gold/40 disabled:shadow-none',
  ghost:
    'border border-ink/20 bg-night/40 text-ink backdrop-blur-sm hover:border-gold/60 hover:text-gold',
  quiet: 'text-mist hover:text-ink',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'gold', className = '', type = 'button', ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={`inline-flex min-h-12 items-center justify-center gap-2 rounded-full px-6 text-base transition-[background-color,color,border-color,transform] duration-200 disabled:cursor-not-allowed ${VARIANTS[variant]} ${className}`}
      {...props}
    />
  );
});
