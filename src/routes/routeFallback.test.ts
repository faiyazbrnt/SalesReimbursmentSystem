import { describe, expect, it } from 'vitest';
import { classifyRoute } from '../components/layout/RouteFallback';
import { UserRole } from '../types';

describe('classifyRoute', () => {
  it('returns role-specific dashboard fallbacks', () => {
    expect(classifyRoute('/', UserRole.REQUESTOR)).toBe('requestor-dashboard');
    expect(classifyRoute('/approver', UserRole.APPROVER)).toBe('approver-dashboard');
    expect(classifyRoute('/custodian', UserRole.CUSTODIAN)).toBe('custodian-dashboard');
    expect(classifyRoute('/finance', UserRole.FINANCE)).toBe('finance-dashboard');
    expect(classifyRoute('/admin', UserRole.ADMIN)).toBe('admin-dashboard');
  });

  it('classifies static and dynamic claim and MOM routes', () => {
    expect(classifyRoute('/claims', UserRole.REQUESTOR)).toBe('table');
    expect(classifyRoute('/claims/new', UserRole.REQUESTOR)).toBe('form');
    expect(classifyRoute('/claims/clm-123', UserRole.REQUESTOR)).toBe('detail');
    expect(classifyRoute('/moms/new', UserRole.REQUESTOR)).toBe('form');
    expect(classifyRoute('/moms/mom-123/edit', UserRole.REQUESTOR)).toBe('form');
    expect(classifyRoute('/moms/mom-123', UserRole.REQUESTOR)).toBe('detail');
  });

  it('classifies table, form, charts, and admin route families', () => {
    expect(classifyRoute('/approvals', UserRole.APPROVER)).toBe('approval-queue');
    expect(classifyRoute('/disbursements', UserRole.CUSTODIAN)).toBe('approval-queue');
    expect(classifyRoute('/transactions?status=approved', UserRole.FINANCE)).toBe('table');
    expect(classifyRoute('/settings#profile', UserRole.REQUESTOR)).toBe('settings');
    expect(classifyRoute('/finance/analytics', UserRole.FINANCE)).toBe('charts');
    expect(classifyRoute('/admin/reports', UserRole.ADMIN)).toBe('charts');
    expect(classifyRoute('/admin/users', UserRole.ADMIN)).toBe('admin-table');
    expect(classifyRoute('/admin/audit', UserRole.ADMIN)).toBe('admin-table');
  });

  it('returns the generic fallback for unknown paths', () => {
    expect(classifyRoute('/unknown', UserRole.REQUESTOR)).toBe('generic');
  });
});
