import { ReactNode, HTMLAttributes } from 'react';
import { cn } from './Button';

export function Card({ children, className, onClick, onKeyDown, tabIndex, role, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("bg-white border border-outline-variant shadow-sm hover:shadow-glass transition-all duration-300 rounded-xl overflow-hidden relative", onClick && "cursor-pointer hover:-translate-y-0.5", className)}
      onClick={onClick}
      onKeyDown={event => {
        onKeyDown?.(event);
        if (!event.defaultPrevented && onClick && event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) {
          event.preventDefault();
          event.currentTarget.click();
        }
      }}
      tabIndex={tabIndex ?? (onClick ? 0 : undefined)}
      role={role ?? (onClick ? 'button' : undefined)}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardHeader({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("table-section-title px-6 py-4 border-b border-brand-border bg-surface-container-lowest flex justify-between items-center", className)}>
      {children}
    </div>
  );
}

export function CardContent({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("p-6", className)}>
      {children}
    </div>
  );
}
