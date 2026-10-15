import { cn } from '../ui/Button';

export function RecordCount({ count, label = 'record', className }: {
  count: number;
  total?: number;
  label?: string;
  className?: string;
}) {
  return (
    <span className={cn('inline-flex w-fit items-center gap-2 whitespace-nowrap rounded-full border border-primary/20 bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary', className)}>
      <span className="text-base font-bold leading-none">{count}</span>
      {label}{count === 1 ? '' : 's'}
    </span>
  );
}
