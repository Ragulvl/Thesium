import { ButtonHTMLAttributes, ReactNode } from 'react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'gradient' | 'danger';
  size?: 'icon' | 'sm' | 'md' | 'lg' | 'xl';
  children?: ReactNode;
}

export default function Button({
  variant = 'primary',
  size = 'md',
  className = '',
  children,
  ...props
}: ButtonProps) {
  const base =
    'inline-flex items-center justify-center font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 active:scale-[0.98] select-none';

  const variants: Record<string, string> = {
    primary:
      'bg-primary text-primary-foreground shadow hover:bg-primary/90 rounded-md',
    secondary:
      'bg-secondary text-secondary-foreground shadow-sm hover:bg-secondary/80 rounded-md border border-border/50',
    outline:
      'border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground rounded-md text-foreground',
    ghost:
      'hover:bg-accent hover:text-accent-foreground text-muted-foreground rounded-md',
    gradient:
      'bg-gradient-to-r from-indigo-500 to-violet-500 text-white shadow hover:opacity-90 rounded-md border-none', // Retained for specific Landing Page CTA
    danger:
      'bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90 rounded-md',
  };

  const sizes: Record<string, string> = {
    icon: 'h-9 w-9',
    sm: 'h-8 px-3 text-xs gap-1.5',
    md: 'h-9 px-4 py-2 text-sm gap-2',
    lg: 'h-10 px-8 text-sm gap-2',
    xl: 'h-12 px-8 text-base gap-3',
  };

  return (
    <button
      className={`${base} ${variants[variant]} ${sizes[size]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
