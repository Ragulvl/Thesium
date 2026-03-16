import { ReactNode, MouseEvent } from 'react';

interface CardProps {
  children: ReactNode;
  className?: string;
  hover?: boolean;
  glass?: boolean;
  glow?: boolean;
  onClick?: (e: MouseEvent<HTMLDivElement>) => void;
}

export default function Card({ children, className = '', hover = false, glass = false, glow = false, onClick }: CardProps) {
  // We keep the props for backward compatibility across the codebase,
  // but we enforce a stricter, modern enterprise styling here.

  const base = glass
    ? 'bg-background/80 backdrop-blur-md border border-border rounded-xl'
    : 'bg-card text-card-foreground border border-border rounded-xl shadow-sm';

  const hoverClass = hover
    ? 'hover:border-primary/50 hover:shadow-md transition-all duration-200 cursor-pointer'
    : 'transition-colors duration-200';

  const glowClass = glow ? 'shadow-lg shadow-primary/10' : '';

  return (
    <div
      className={`${base} ${hoverClass} ${glowClass} ${className}`}
      onClick={onClick}
    >
      {children}
    </div>
  );
}
