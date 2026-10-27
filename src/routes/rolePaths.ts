import { UserRole } from '../types';

const routePatterns = [
  '/',
  '/claims', '/claims/new', '/claims/:id',
  '/payouts',
  '/moms', '/moms/new', '/moms/:id', '/moms/:id/edit',
  '/receipts', '/calendar', '/support', '/notifications', '/settings',
  '/approvals', '/disbursements', '/ready-to-claim', '/transactions',
  '/custodian/analytics',
  '/financials', '/financials/records', '/financials/receipts', '/financials/analytics',
  '/admin/users', '/admin/companies', '/admin/import', '/admin/reports',
  '/admin/activity', '/admin/audit', '/admin/emails',
];

const publicPathPrefixes = ['/api', '/_next', '/auth', '/uploads'];
const publicPaths = new Set([
  '/login', '/healthz', '/readyz', '/favicon.ico', '/robots.txt', '/sitemap.xml',
]);

export function roleToSlug(role: UserRole | string): string {
  return role === 'Finance' ? 'approver' : role.toLowerCase();
}

export function rolePath(role: UserRole | string, pathname = '/') {
  const slug = roleToSlug(role);
  const path = pathname.startsWith('/') ? pathname : `/${pathname}`;
  return `/${slug}${path === '/' ? '' : path}`;
}

function isUnprefixedPath(pathname: string) {
  const path = pathname.toLowerCase();
  const firstSegment = path.split('/').filter(Boolean)[0] ?? '';
  return publicPaths.has(path)
    || publicPathPrefixes.some(prefix => path === prefix || path.startsWith(`${prefix}/`))
    || firstSegment.startsWith('_')
    || (!isKnownRoute(path) && /\.[a-z0-9]{1,10}$/i.test(path));
}

function isKnownRoute(pathname: string) {
  const path = pathname.toLowerCase().replace(/\/+$/, '') || '/';
  const segments = path.split('/').filter(Boolean);

  return routePatterns.some(pattern => {
    const patternSegments = pattern.split('/').filter(Boolean);
    return patternSegments.length === segments.length
      && patternSegments.every((segment, index) => segment.startsWith(':') || segment === segments[index]);
  });
}

/** Returns the role-scoped browser URL, or null for public/technical URLs. */
export function canonicalRoleUrl(
  pathname: string,
  search: string,
  hash: string,
  role: UserRole | string,
  landOnDashboard = false,
): string | null {
  if (isUnprefixedPath(pathname)) return null;

  const slug = roleToSlug(role);
  const ownPrefix = `/${slug}`;
  const normalizedPath = pathname.toLowerCase().replace(/\/+$/, '') || '/';
  // Retired Finance URLs remain bookmarks, never an active role namespace.
  const legacyPath = normalizedPath.startsWith('/approver/finance/')
    ? normalizedPath.slice('/approver'.length)
    : normalizedPath;
  if (!landOnDashboard && (legacyPath === '/finance' || legacyPath.startsWith('/finance/'))) {
    const remainder = legacyPath.slice('/finance'.length) || '/';
    const destination = remainder === '/' ? '/financials'
      : remainder === '/claims' ? '/financials/records'
      : remainder === '/receipts' ? '/financials/receipts'
      : remainder === '/analytics' || remainder === '/finance/analytics' ? '/financials/analytics'
      : isKnownRoute(remainder) ? remainder : '/financials';
    return `${rolePath(role, destination)}${search}${hash}`;
  }

  let destination: string;

  if (landOnDashboard || normalizedPath === '/') {
    destination = ownPrefix;
  } else {
    const segments = normalizedPath.split('/').filter(Boolean);
    const firstSegment = segments[0];
    const knownRoleSlugs = new Set(Object.values(UserRole).map(roleToSlug));

    if (knownRoleSlugs.has(firstSegment)) {
      const remainder = segments.length > 1 ? `/${segments.slice(1).join('/')}` : '/';

      if (firstSegment !== slug) {
        destination = isKnownRoute(remainder) && remainder !== '/'
          ? rolePath(role, remainder)
          : ownPrefix;
      } else if (remainder === '/' || isKnownRoute(remainder)) {
        destination = rolePath(role, remainder);
      } else {
        // Existing modules such as /admin/users start with a role slug too.
        destination = rolePath(role, normalizedPath);
      }
    } else {
      destination = rolePath(role, normalizedPath);
    }
  }

  return `${destination}${search}${hash}`;
}
