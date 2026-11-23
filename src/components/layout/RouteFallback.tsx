import type { ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { useAppContext } from '../AppContext';
import { UserRole } from '../../types';
import {
  CardSkeleton,
  ChartSkeleton,
  DetailPageSkeleton,
  FormSkeleton,
  MetricGridSkeleton,
  PageHeaderSkeleton,
  Skeleton,
  TableSkeleton,
  TwoColumnSkeleton,
} from '../shared/states/Skeleton';

export type SkeletonVariant =
  | 'requestor-dashboard'
  | 'approver-dashboard'
  | 'custodian-dashboard'
  | 'finance-dashboard'
  | 'admin-dashboard'
  | 'table'
  | 'approval-queue'
  | 'form'
  | 'detail'
  | 'calendar'
  | 'notifications'
  | 'support'
  | 'settings'
  | 'charts'
  | 'admin-table'
  | 'generic';

function normalizePath(pathname: string): string {
  const withoutQueryOrHash = pathname.split(/[?#]/, 1)[0];
  return withoutQueryOrHash.toLowerCase().replace(/\/+$/, '') || '/';
}

function stripLeadingRoleSlug(pathname: string): string {
  const segments = pathname.split('/').filter(Boolean);
  const roleSlugs = new Set(['requestor', 'approver', 'custodian', 'finance', 'admin']);

  if (segments.length > 0 && roleSlugs.has(segments[0])) {
    segments.shift();
  }

  return segments.length === 0 ? '/' : `/${segments.join('/')}`;
}

export function classifyRoute(pathname: string, role: UserRole): SkeletonVariant {
  const path = normalizePath(pathname);

  if (path === '/' || path === `/${role.toLowerCase()}`) {
    switch (role) {
      case UserRole.REQUESTOR:
        return 'requestor-dashboard';
      case UserRole.APPROVER:
        return 'approver-dashboard';
      case UserRole.CUSTODIAN:
        return 'custodian-dashboard';
      case UserRole.FINANCE:
        return 'finance-dashboard';
      case UserRole.ADMIN:
        return 'admin-dashboard';
    }
  }

  if (path === '/claims/new' || path === '/moms/new') return 'form';
  if (/^\/moms\/[^/]+\/edit$/.test(path)) return 'form';
  if (/^\/claims\/[^/]+$/.test(path)) return 'detail';
  if (/^\/moms\/[^/]+$/.test(path)) return 'detail';
  if (path === '/settings') return 'settings';
  if (path === '/calendar') return 'calendar';
  if (path === '/notifications') return 'notifications';
  if (path === '/support') return 'support';
  if (path === '/approvals' || path === '/disbursements') return 'approval-queue';

  if (
    path === '/custodian/analytics'
    || path === '/finance/analytics'
    || path === '/admin/reports'
  ) {
    return 'charts';
  }

  if (
    path === '/admin/users'
    || path === '/admin/companies'
    || path === '/admin/import'
    || path === '/admin/activity'
    || path === '/admin/audit'
    || path === '/admin/emails'
  ) {
    return 'admin-table';
  }

  if (
    path === '/claims'
    || path === '/payouts'
    || path === '/moms'
    || path === '/receipts'
    || path === '/ready-to-claim'
    || path === '/transactions'
  ) {
    return 'table';
  }

  const strippedPath = stripLeadingRoleSlug(path);
  if (strippedPath !== path) {
    return classifyRoute(strippedPath, role);
  }

  return 'generic';
}

function DashboardFallback({ role }: { role: UserRole }) {
  if (role === UserRole.REQUESTOR) {
    return (
      <div className="space-y-8" aria-hidden="true">
        <PageHeaderSkeleton withAction />
        <MetricGridSkeleton columns={3} />
        <TwoColumnSkeleton leftWidth="lg:grid-cols-[2fr_1fr]" />
      </div>
    );
  }

  if (role === UserRole.APPROVER) {
    return (
      <div className="space-y-8" aria-hidden="true">
        <PageHeaderSkeleton />
        <MetricGridSkeleton columns={4} />
        <TwoColumnSkeleton leftWidth="lg:grid-cols-2" />
      </div>
    );
  }

  if (role === UserRole.CUSTODIAN) {
    return (
      <div className="space-y-8" aria-hidden="true">
        <PageHeaderSkeleton withAction />
        <MetricGridSkeleton columns={2} />
        <TableSkeleton rows={6} />
        <TwoColumnSkeleton leftWidth="lg:grid-cols-2" />
      </div>
    );
  }

  if (role === UserRole.FINANCE) {
    return (
      <div className="space-y-8" aria-hidden="true">
        <PageHeaderSkeleton withAction />
        <MetricGridSkeleton columns={4} />
        <TableSkeleton rows={7} />
      </div>
    );
  }

  return (
    <div className="space-y-8" aria-hidden="true">
      <PageHeaderSkeleton withAction />
      <MetricGridSkeleton columns={4} />
      <TwoColumnSkeleton leftWidth="lg:grid-cols-2" />
    </div>
  );
}

export function RouteFallback() {
  const location = useLocation();
  const { currentUser } = useAppContext();
  const variant = classifyRoute(location.pathname, currentUser.role);

  const fallbackRegistry: Record<SkeletonVariant, ReactNode> = {
    'requestor-dashboard': <DashboardFallback role={UserRole.REQUESTOR} />,
    'approver-dashboard': <DashboardFallback role={UserRole.APPROVER} />,
    'custodian-dashboard': <DashboardFallback role={UserRole.CUSTODIAN} />,
    'finance-dashboard': <DashboardFallback role={UserRole.FINANCE} />,
    'admin-dashboard': <DashboardFallback role={UserRole.ADMIN} />,
    table: (
      <div className="space-y-6" aria-hidden="true">
        <PageHeaderSkeleton withAction />
        <CardSkeleton />
        <TableSkeleton rows={8} />
      </div>
    ),
    'approval-queue': (
      <div className="space-y-6" aria-hidden="true">
        <PageHeaderSkeleton withAction />
        <MetricGridSkeleton columns={3} />
        <TableSkeleton rows={8} />
      </div>
    ),
    form: <div aria-hidden="true"><FormSkeleton /></div>,
    detail: <div aria-hidden="true"><DetailPageSkeleton /></div>,
    calendar: (
      <div className="space-y-6" aria-hidden="true">
        <PageHeaderSkeleton withAction />
        <CardSkeleton />
      </div>
    ),
    notifications: (
      <div className="space-y-4" aria-hidden="true">
        <PageHeaderSkeleton />
        {Array.from({ length: 6 }).map((_, index) => (
          <CardSkeleton key={index} />
        ))}
      </div>
    ),
    support: (
      <div className="space-y-6" aria-hidden="true">
        <PageHeaderSkeleton withAction />
        <TwoColumnSkeleton leftWidth="lg:grid-cols-[1fr_1fr]" />
      </div>
    ),
    settings: (
      <div className="space-y-6" aria-hidden="true">
        <PageHeaderSkeleton />
        <div className="flex gap-4 border-b border-brand-border pb-3">
          <Skeleton className="h-8 w-24" />
          <Skeleton className="h-8 w-24" />
          <Skeleton className="h-8 w-24" />
        </div>
        <FormSkeleton sections={2} />
      </div>
    ),
    charts: (
      <div className="space-y-6" aria-hidden="true">
        <PageHeaderSkeleton withAction />
        <MetricGridSkeleton columns={4} />
        <ChartSkeleton cards={2} />
      </div>
    ),
    'admin-table': (
      <div className="space-y-6" aria-hidden="true">
        <PageHeaderSkeleton withAction />
        <CardSkeleton />
        <TableSkeleton rows={8} />
      </div>
    ),
    generic: (
      <div className="space-y-6" aria-hidden="true">
        <PageHeaderSkeleton />
        <CardSkeleton />
      </div>
    ),
  };

  return (
    <div>
      <span className="sr-only" role="status">Loading page</span>
      {fallbackRegistry[variant]}
    </div>
  );
}
