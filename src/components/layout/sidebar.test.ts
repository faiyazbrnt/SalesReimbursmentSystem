import { describe, it, expect } from 'vitest';
import { getNavItems } from './Sidebar';
import { UserRole } from '../../types';

describe('Sidebar Navigation - Ticket 3: Relocate Approvals Menu Item', () => {
  it('places Approvals directly below Dashboard in the top section (Overview) for Approvers', () => {
    const items = getNavItems(UserRole.APPROVER);

    expect(items[0]).toEqual({
      label: 'Dashboard',
      icon: 'dashboard',
      path: '/',
      section: 'Overview',
    });

    expect(items[1]).toEqual({
      label: 'Approvals',
      icon: 'assignment_turned_in',
      path: '/approvals',
      section: 'Overview',
      badgeKey: 'approvals',
    });
  });

  it('keeps remaining items grouped into Claims and Meetings sections for Approver', () => {
    const items = getNavItems(UserRole.APPROVER);
    const labels = items.map(item => item.label);

    expect(labels).toEqual([
      'Dashboard',
      'Approvals',
      'My Requests',
      'Payouts',
      'Expenses & Receipts',
      'Minutes & Agreements',
      'Calendar',
    ]);

    expect(items.find(i => i.label === 'My Requests')?.section).toBe('Claims');
    expect(items.find(i => i.label === 'Minutes & Agreements')?.section).toBe('Meetings');
  });

  it('does not show Approvals in Requestor navigation', () => {
    const items = getNavItems(UserRole.REQUESTOR);
    expect(items.some(item => item.label === 'Approvals')).toBe(false);
  });
});
