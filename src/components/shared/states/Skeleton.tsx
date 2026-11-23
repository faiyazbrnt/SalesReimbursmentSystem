import { HTMLAttributes } from 'react';
import { Card, CardContent, CardHeader } from '../../ui/Card';

export function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`animate-pulse rounded-md bg-surface-container-highest/50 ${className}`}
      {...props}
    />
  );
}

export function CardSkeleton() {
  return (
    <Card>
      <CardHeader className="gap-4 border-b border-brand-border">
        <Skeleton className="h-6 w-1/3" />
        <Skeleton className="h-4 w-1/4" />
      </CardHeader>
      <CardContent className="space-y-4 pt-4">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-[90%]" />
        <Skeleton className="h-4 w-[80%]" />
      </CardContent>
    </Card>
  );
}

export function PageHeaderSkeleton({ withAction = false }: { withAction?: boolean }) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="space-y-2">
        <Skeleton className="h-5 w-28" />
        <Skeleton className="h-8 w-64 max-w-full" />
      </div>
      {withAction && <Skeleton className="h-10 w-32" />}
    </div>
  );
}

export function MetricGridSkeleton({
  columns = 4,
}: {
  columns?: 2 | 3 | 4;
}) {
  const gridClass = columns === 2
    ? 'sm:grid-cols-2'
    : columns === 3
      ? 'sm:grid-cols-2 lg:grid-cols-3'
      : 'sm:grid-cols-2 xl:grid-cols-4';

  return (
    <div className={`grid grid-cols-1 ${gridClass} gap-4`}>
      {Array.from({ length: columns }).map((_, index) => (
        <Card key={index} className="p-6">
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="mt-4 h-8 w-2/3" />
        </Card>
      ))}
    </div>
  );
}

export function TwoColumnSkeleton({
  leftWidth = 'lg:grid-cols-[2fr_1fr]',
}: {
  leftWidth?: 'lg:grid-cols-2' | 'lg:grid-cols-[2fr_1fr]' | 'lg:grid-cols-[1fr_1fr]';
}) {
  return (
    <div className={`grid grid-cols-1 ${leftWidth} gap-6 lg:gap-8`}>
      <CardSkeleton />
      <CardSkeleton />
    </div>
  );
}

export function FormSkeleton({ sections = 3 }: { sections?: number }) {
  return (
    <div className="space-y-6">
      <PageHeaderSkeleton />
      {Array.from({ length: sections }).map((_, index) => (
        <Card key={index}>
          <CardHeader>
            <Skeleton className="h-5 w-40" />
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-10 w-full" />
              </div>
              <div className="space-y-2">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-10 w-full" />
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export function DetailPageSkeleton() {
  return (
    <div className="space-y-6">
      <PageHeaderSkeleton withAction />
      <Card>
        <CardContent>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
            {Array.from({ length: 3 }).map((_, index) => (
              <div key={index} className="space-y-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-6 w-40 max-w-full" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
      <TwoColumnSkeleton />
      <TableSkeleton rows={4} />
    </div>
  );
}

export function ChartSkeleton({ cards = 2 }: { cards?: number }) {
  return (
    <div className="space-y-6">
      <div className={`grid grid-cols-1 gap-6 ${cards === 1 ? '' : 'lg:grid-cols-2'}`}>
        {Array.from({ length: cards }).map((_, index) => (
          <Card key={index} className="p-6">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="mt-6 h-64 w-full" />
          </Card>
        ))}
      </div>
    </div>
  );
}

export function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="overflow-hidden rounded-lg border border-brand-border bg-surface-container-lowest">
      <div className="flex bg-surface-container-low px-6 py-3">
        <Skeleton className="h-4 w-1/4 mr-4" />
        <Skeleton className="h-4 w-1/4 mr-4" />
        <Skeleton className="h-4 w-1/4 mr-4" />
        <Skeleton className="h-4 w-1/4" />
      </div>
      <div className="divide-y divide-brand-border bg-surface-container-lowest">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex px-6 py-4">
            <Skeleton className="h-4 w-1/4 mr-4" />
            <Skeleton className="h-4 w-1/4 mr-4" />
            <Skeleton className="h-4 w-1/4 mr-4" />
            <Skeleton className="h-4 w-1/4" />
          </div>
        ))}
      </div>
    </div>
  );
}
