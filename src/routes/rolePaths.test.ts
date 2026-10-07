import { describe, expect, it } from 'vitest';
import { UserRole } from '../types';
import { canonicalRoleUrl, rolePath, roleToSlug } from './rolePaths';

describe('role URL helpers', () => {
  it('derives lowercase slugs from the existing role values', () => {
    expect(Object.values(UserRole).map(roleToSlug)).toEqual([
      'requestor', 'approver', 'custodian', 'finance', 'admin',
    ]);
  });

  it('builds role roots and module paths', () => {
    expect(rolePath(UserRole.REQUESTOR)).toBe('/requestor');
    expect(rolePath(UserRole.APPROVER, '/claims')).toBe('/approver/claims');
  });

  it('redirects legacy paths to the signed-in role and preserves nested paths and query strings', () => {
    expect(canonicalRoleUrl('/claims/CLM-AbC', '?status=Draft', '#details', UserRole.REQUESTOR))
      .toBe('/requestor/claims/clm-abc?status=Draft#details');
  });

  it('maps another role’s equivalent route to the current role', () => {
    expect(canonicalRoleUrl('/approver/claims', '?status=Pending', '', UserRole.REQUESTOR))
      .toBe('/requestor/claims?status=Pending');
  });

  it('keeps a restricted cross-role route scoped so its role guard can send the user home', () => {
    expect(canonicalRoleUrl('/approver/approvals', '?tab=mine', '', UserRole.REQUESTOR))
      .toBe('/requestor/approvals?tab=mine');
  });

  it('disambiguates legacy role-named modules from role-prefixed URLs', () => {
    expect(canonicalRoleUrl('/admin/users', '', '', UserRole.ADMIN))
      .toBe('/admin/admin/users');
    expect(canonicalRoleUrl('/finance/analytics', '', '', UserRole.FINANCE))
      .toBe('/finance/finance/analytics');
    expect(canonicalRoleUrl('/custodian/custodian/analytics', '', '', UserRole.CUSTODIAN))
      .toBe('/custodian/custodian/analytics');
  });

  it('sends a new login to the role dashboard and leaves public paths unprefixed', () => {
    expect(canonicalRoleUrl('/claims', '?type=transport', '', UserRole.REQUESTOR, true))
      .toBe('/requestor?type=transport');
    expect(canonicalRoleUrl('/api/claims', '', '', UserRole.REQUESTOR)).toBeNull();
    expect(canonicalRoleUrl('/auth/callback', '', '', UserRole.REQUESTOR)).toBeNull();
    expect(canonicalRoleUrl('/favicon.ico', '', '', UserRole.REQUESTOR)).toBeNull();
  });
});
