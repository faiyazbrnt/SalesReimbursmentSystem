import { PaginatedTable } from '../../../components/ui/PaginatedTable';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card } from '../../../components/ui/Card';
import { Input } from '../../../components/ui/Input';
import { Button, cn } from '../../../components/ui/Button';
import { StatusBadge } from '../../../components/ui/StatusBadge';
import { useAppContext } from '../../../components/AppContext';
import { ClaimStatus, DelegationStatus } from '../../../types';
import { formatMoney } from '../../../lib/money';
import { formatDate, formatDateTime, formatLongDate } from '../../../lib/date';
import { claimTypeIcon, getClaimAgingInfo } from '@/features/claims';
import { TeamMemberSpending } from '@/features/analytics';
import {
  filterClaimsApprovedByApprover,
  calculateApproverApprovedSpend,
  getApproverRelevantMembers,
  formatWeekLabel,
  formatMonthLabel,
  getIsoWeekString,
  getRecentWeeks,
  getRecentMonths,
} from '../domain/approverAnalytics';

const DECISION_STATUSES: string[] = [ClaimStatus.APPROVED, ClaimStatus.PROCESSING, ClaimStatus.REJECTED, ClaimStatus.RETURNED];
const PENDING_STATUSES: string[] = [ClaimStatus.PENDING_APPROVAL, ClaimStatus.SUBMITTED];
const TEAM_SPEND_STATUSES: string[] = [ClaimStatus.APPROVED, ClaimStatus.PROCESSING, ClaimStatus.READY_FOR_CLAIM, ClaimStatus.RELEASED, ClaimStatus.COMPLETED];

function currentMonthValue() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function getPreviousMonthValue(monthStr: string) {
  const [year, month] = monthStr.split('-').map(Number);
  const d = new Date(year, month - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function ApproverDashboard() {
  const navigate = useNavigate();
  const { currentUser, claims, users, lineItems, statusHistory, delegations } = useAppContext();
  const [typeFilter, setTypeFilter] = useState<'All' | 'Reimbursement' | 'Cash Advance' | 'Liquidation'>('All');
  const currentMonth = useMemo(currentMonthValue, []);
  const prevMonth = useMemo(() => getPreviousMonthValue(currentMonth), [currentMonth]);
  const currentWeek = useMemo(() => getIsoWeekString(new Date()), []);
  const lastWeek = useMemo(() => getIsoWeekString(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)), []);
  const recentWeeks = useMemo(() => getRecentWeeks(4), []);
  const recentMonths = useMemo(() => getRecentMonths(4), []);

  const [approvedTimeframe, setApprovedTimeframe] = useState<'week' | 'month'>('month');
  const [selectedMonth, setSelectedMonth] = useState(currentMonth);
  const [selectedWeek, setSelectedWeek] = useState(currentWeek);
  const [periodMenuOpen, setPeriodMenuOpen] = useState(false);
  const periodMenuRef = useRef<HTMLDivElement>(null);
  const [worklistSearch, setWorklistSearch] = useState('');

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (periodMenuRef.current && !periodMenuRef.current.contains(event.target as Node)) {
        setPeriodMenuOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setPeriodMenuOpen(false);
      }
    };
    if (periodMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [periodMenuOpen]);

  const nameOf = (id: string) => users.find(u => u.id === id)?.name || 'someone';

  // Active delegations touching this approver, in both directions:
  //  - outgoing: I've handed my approvals to someone while I'm out
  //  - covering: someone handed theirs to me
  const outgoingDelegation = useMemo(
    () => delegations.find(d => d.approver_id === currentUser.id && d.status === DelegationStatus.ACTIVE),
    [delegations, currentUser.id]
  );
  const coveringDelegations = useMemo(
    () => delegations.filter(d => d.delegate_id === currentUser.id && d.status === DelegationStatus.ACTIVE),
    [delegations, currentUser.id]
  );

  // Mirrors ApprovalQueue.tsx's own scoping: claims actually assigned to this
  // approver and still awaiting their decision.
  const myPending = useMemo(() => claims
    .filter(claim => {
      if (!PENDING_STATUSES.includes(claim.status) || claim.requestorId === currentUser.id) return false;
      const requestor = users.find(user => user.id === claim.requestorId);
      const isDelegate = coveringDelegations.some(delegation =>
        delegation.approver_id === requestor?.reportsTo
      );
      return claim.approverId === currentUser.id || requestor?.reportsTo === currentUser.id || isDelegate;
    })
    .sort((a, b) =>
      new Date(a.submittedAt || a.createdAt).getTime() -
      new Date(b.submittedAt || b.createdAt).getTime()
    ),
    [claims, currentUser.id, users, coveringDelegations]
  );

  const displayedClaims = myPending.filter(claim => {
    if (typeFilter !== 'All' && claim.type !== typeFilter) return false;
    const query = worklistSearch.trim().toLowerCase();
    const requestor = users.find(user => user.id === claim.requestorId);
    return !query || [claim.ref, claim.type, claim.purpose, requestor?.name]
      .some(value => value?.toLowerCase().includes(query));
  });

  const totalPendingAmount = useMemo(
    () => myPending.reduce((acc, c) => acc + c.total, 0),
    [myPending]
  );

  // This approver's own decisions, most recent first.
  const myDecisions = useMemo(
    () => statusHistory
      .filter(h => h.changedBy === currentUser.id && DECISION_STATUSES.includes(h.newStatus))
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()),
    [statusHistory, currentUser.id]
  );

  const myApprovedClaims = useMemo(
    () => filterClaimsApprovedByApprover(claims, currentUser.id, statusHistory),
    [claims, currentUser.id, statusHistory]
  );

  const relevantMembers = useMemo(
    () => getApproverRelevantMembers(users, currentUser.id, myApprovedClaims),
    [users, currentUser.id, myApprovedClaims]
  );

  const approvedSpend = useMemo(
    () => calculateApproverApprovedSpend(myApprovedClaims, {
      timeframe: approvedTimeframe,
      weekValue: selectedWeek,
      monthValue: selectedMonth,
    }),
    [myApprovedClaims, approvedTimeframe, selectedWeek, selectedMonth]
  );
  const oldestPending = myPending[0];
  const oldestPendingAging = oldestPending
    ? getClaimAgingInfo(oldestPending.submittedAt, oldestPending.createdAt)
    : null;

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="mb-8">
        <h3 className="font-display text-display text-on-surface">Welcome back, {currentUser.name.split(' ')[0]}</h3>
        <div className="flex items-center text-outline mt-1">
          <span className="material-symbols-outlined text-[18px] mr-2">calendar_today</span>
          <p className="font-label-md text-label-md">{formatLongDate(new Date())}</p>
        </div>
      </div>

      {/* Delegation status — surfaces active hand-offs in both directions so an
          approver always knows their approvals are being routed elsewhere (or
          that they're currently receiving someone else's). */}
      {outgoingDelegation && (
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 p-4 rounded-card border border-tertiary/40 bg-tertiary-container/30">
          <span className="material-symbols-outlined text-tertiary flex-shrink-0">forward_to_inbox</span>
          <p className="flex-1 font-label-md text-on-surface">
            You're delegating your approvals to <strong>{nameOf(outgoingDelegation.delegate_id)}</strong>
            {' '}until <strong>{outgoingDelegation.end_date}</strong>. New claims route to them automatically.
          </p>
          <Button size="sm" variant="outline" className="flex-shrink-0" onClick={() => navigate('/settings?tab=delegation')}>Manage</Button>
        </div>
      )}
      {coveringDelegations.length > 0 && (
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 p-4 rounded-card border border-primary/30 bg-primary-container/20">
          <span className="material-symbols-outlined text-primary flex-shrink-0">supervisor_account</span>
          <p className="flex-1 font-label-md text-on-surface">
            You're currently covering approvals for{' '}
            <strong>{coveringDelegations.map(d => nameOf(d.approver_id)).join(', ')}</strong>. Their claims appear in your queue.
          </p>
          <Button size="sm" variant="outline" className="flex-shrink-0" onClick={() => navigate('/settings?tab=delegation')}>Manage</Button>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <Card className="p-6 transition-all hover:shadow-md group">
          <h4 className="font-headline-md text-on-surface mb-2">Awaiting Approval</h4>
          <p className="font-headline-lg text-on-surface group-hover:text-primary transition-colors">{myPending.length}</p>
        </Card>
        <Card className="p-6 transition-all hover:shadow-md group">
          <h4 className="font-headline-md text-on-surface mb-2">Total Pending Amount</h4>
          <p className="font-headline-lg text-on-surface group-hover:text-primary transition-colors">{formatMoney(totalPendingAmount)}</p>
        </Card>
        <Card className="p-6 transition-all hover:shadow-md group">
          <h4 className="font-headline-md text-on-surface mb-2">Oldest Waiting</h4>
          <p className="font-headline-lg text-on-surface group-hover:text-primary transition-colors">{oldestPendingAging?.text || '—'}</p>
          <p className="text-xs text-outline mt-1">{oldestPending?.ref || 'Queue is clear'}</p>
        </Card>
        <Card className="p-6 transition-all hover:shadow-md group relative overflow-visible z-20">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <h4 className="font-headline-md text-on-surface mb-2">Total Approved Spend</h4>
              <p className="font-headline-lg text-on-surface truncate group-hover:text-primary transition-colors">{formatMoney(approvedSpend)}</p>
            </div>
            <div className="relative shrink-0" ref={periodMenuRef}>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setPeriodMenuOpen(!periodMenuOpen)}
                className="h-8 gap-1.5 px-3 text-xs font-semibold rounded-btn border-outline-variant bg-surface-container-lowest text-on-surface hover:text-primary hover:border-primary transition-all shadow-xs"
                title={`Currently showing ${approvedTimeframe === 'week' ? formatWeekLabel(selectedWeek) : formatMonthLabel(selectedMonth)}. Click to choose week or month.`}
                aria-haspopup="dialog"
                aria-expanded={periodMenuOpen}
              >
                <span>{approvedTimeframe === 'week' ? formatWeekLabel(selectedWeek) : formatMonthLabel(selectedMonth)}</span>
                <span className="material-symbols-outlined text-[16px] text-outline">
                  {periodMenuOpen ? 'expand_less' : 'expand_more'}
                </span>
              </Button>
              {periodMenuOpen && (
                <div
                  role="dialog"
                  aria-label="Choose spend timeframe"
                  className="absolute right-0 top-full mt-2 w-80 rounded-card border border-outline-variant bg-white p-4 shadow-glass z-50 animate-in fade-in zoom-in-95 duration-150"
                >
                  <div className="mb-3.5 flex rounded-lg border border-outline-variant bg-surface-container-high/40 p-0.5 text-xs">
                    <button
                      type="button"
                      onClick={() => setApprovedTimeframe('week')}
                      aria-pressed={approvedTimeframe === 'week'}
                      className={cn(
                        "flex-1 py-1.5 rounded-md font-semibold transition-all text-xs",
                        approvedTimeframe === 'week' ? "bg-white text-primary shadow-xs" : "text-outline hover:text-on-surface"
                      )}
                    >
                      Week
                    </button>
                    <button
                      type="button"
                      onClick={() => setApprovedTimeframe('month')}
                      aria-pressed={approvedTimeframe === 'month'}
                      className={cn(
                        "flex-1 py-1.5 rounded-md font-semibold transition-all text-xs",
                        approvedTimeframe === 'month' ? "bg-white text-primary shadow-xs" : "text-outline hover:text-on-surface"
                      )}
                    >
                      Month
                    </button>
                  </div>

                  {approvedTimeframe === 'week' ? (
                    <div className="space-y-3.5">
                      <div>
                        <p className="text-[11px] font-bold text-outline uppercase tracking-wider mb-2">Select a Week</p>
                        <div className="space-y-1.5">
                          {recentWeeks.map(w => (
                            <button
                              key={w.value}
                              type="button"
                              onClick={() => {
                                setSelectedWeek(w.value);
                                setPeriodMenuOpen(false);
                              }}
                              className={cn(
                                "w-full flex items-center justify-between px-3 py-2 text-xs rounded-lg border text-left transition-all",
                                selectedWeek === w.value
                                  ? "border-primary bg-primary/10 text-primary font-semibold shadow-xs"
                                  : "border-outline-variant/60 hover:bg-surface-container-low text-on-surface hover:border-outline-variant"
                              )}
                            >
                              <span>{w.label}</span>
                              {selectedWeek === w.value && (
                                <span className="material-symbols-outlined text-[16px] text-primary">check</span>
                              )}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="pt-2 border-t border-outline-variant/60">
                        <label htmlFor="approver-week-picker" className="block text-[11px] font-bold text-outline uppercase tracking-wider mb-1.5">
                          Or Pick Any Custom Week
                        </label>
                        <Input
                          id="approver-week-picker"
                          type="week"
                          value={selectedWeek}
                          onChange={e => {
                            if (e.target.value) {
                              setSelectedWeek(e.target.value);
                              setPeriodMenuOpen(false);
                            }
                          }}
                          className="h-9 text-xs w-full bg-surface-container-lowest"
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3.5">
                      <div>
                        <p className="text-[11px] font-bold text-outline uppercase tracking-wider mb-2">Select a Month</p>
                        <div className="space-y-1.5">
                          {recentMonths.map(m => (
                            <button
                              key={m.value}
                              type="button"
                              onClick={() => {
                                setSelectedMonth(m.value);
                                setPeriodMenuOpen(false);
                              }}
                              className={cn(
                                "w-full flex items-center justify-between px-3 py-2 text-xs rounded-lg border text-left transition-all",
                                selectedMonth === m.value
                                  ? "border-primary bg-primary/10 text-primary font-semibold shadow-xs"
                                  : "border-outline-variant/60 hover:bg-surface-container-low text-on-surface hover:border-outline-variant"
                              )}
                            >
                              <span>{m.label}</span>
                              {selectedMonth === m.value && (
                                <span className="material-symbols-outlined text-[16px] text-primary">check</span>
                              )}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="pt-2 border-t border-outline-variant/60">
                        <label htmlFor="approver-month-picker" className="block text-[11px] font-bold text-outline uppercase tracking-wider mb-1.5">
                          Or Pick Any Custom Month
                        </label>
                        <Input
                          id="approver-month-picker"
                          type="month"
                          value={selectedMonth}
                          onChange={e => {
                            if (e.target.value) {
                              setSelectedMonth(e.target.value);
                              setPeriodMenuOpen(false);
                            }
                          }}
                          className="h-9 text-xs w-full bg-surface-container-lowest"
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
          <p className="text-xs text-outline mt-3">
            {approvedTimeframe === 'week'
              ? `Claims approved by you in ${formatWeekLabel(selectedWeek)}.`
              : `Claims approved by you in ${formatMonthLabel(selectedMonth)}.`}
          </p>
        </Card>
      </div>

      <Card className="unified-worklist bg-white">
        <div className="p-4">
        <div className="table-section-title mb-4 border-b border-outline-variant pb-4">
          <div>
            <h4 className="font-headline-md text-slate-900">Unified Worklist</h4>
            <p className="text-xs text-outline mt-1">Oldest requests are shown first.</p>
          </div>
        </div>
        <div className="mb-4 flex flex-wrap items-center gap-3">
          {(['All', 'Reimbursement', 'Cash Advance', 'Liquidation'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTypeFilter(t)}
              className={`px-5 py-2 rounded-full font-label-md transition-colors shadow-sm focus:ring-2 focus:ring-primary outline-none whitespace-nowrap ${typeFilter === t ? 'bg-primary text-white' : 'bg-surface-container-high text-on-surface-variant hover:bg-outline-variant'}`}
            >
              {t === 'All' ? 'All Requests' : t === 'Reimbursement' ? 'Claims' : t === 'Cash Advance' ? 'Cash Advances' : 'Liquidations'}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-[240px] flex-1 max-w-xl">
            <Input type="search" value={worklistSearch} onChange={event => setWorklistSearch(event.target.value)} placeholder="Search reference, requestor, or purpose..." aria-label="Search worklist" />
          </div>
          {(worklistSearch || typeFilter !== 'All') && <button className="text-xs font-semibold text-primary hover:underline" onClick={() => { setWorklistSearch(''); setTypeFilter('All'); }}>Clear all</button>}
          <p className="ml-auto shrink-0 text-right text-xs text-outline">Showing {Math.min(displayedClaims.length, 8)} of {myPending.length} pending requests.</p>
          <Button size="sm" variant="outline" className="gap-1" onClick={() => navigate('/approvals')}>
            View All <span aria-hidden="true" className="material-symbols-outlined text-[16px]">arrow_forward</span>
          </Button>
        </div>
        </div>
        <div className="overflow-x-auto">
          <PaginatedTable className="w-full min-w-[1000px] text-left">
            <thead className="bg-slate-100 text-slate-600 font-label-sm uppercase font-semibold tracking-wider border-b border-outline-variant">
              <tr>
                <th className="px-6 py-4">Requestor</th>
                <th className="px-6 py-4">Ref &amp; Type</th>
                <th className="px-6 py-4">Submitted</th>
                <th className="px-6 py-4">Aging</th>
                <th className="px-6 py-4">Amount</th>
                <th className="px-6 py-4 text-center">Status</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-outline-variant">
              {displayedClaims.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-outline">
                    <div className="flex min-h-36 flex-col items-center justify-center">
                      <span aria-hidden="true" className="material-symbols-outlined text-4xl mb-2 opacity-50">task_alt</span>
                      <p className="font-label-md">{worklistSearch || typeFilter !== 'All' ? 'No requests match your filters.' : "You're all caught up!"}</p>
                    </div>
                  </td>
                </tr>
              ) : displayedClaims.map(claim => {
                const req = users.find(u => u.id === claim.requestorId) || users[0];
                const aging = getClaimAgingInfo(claim.submittedAt, claim.createdAt);
                return (
                  <tr role="button" tabIndex={0} onKeyDown={event => { if (event.target === event.currentTarget && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); event.currentTarget.click(); } }}  key={claim.id} className="hover:bg-primary-fixed/20 transition-colors group cursor-pointer" onClick={(e) => {
                    if (!(e.target as HTMLElement).closest('button')) {
                      navigate(`/claims/${claim.id}`);
                    }
                  }}>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        {req.avatarUrl ? (
                          <img src={req.avatarUrl} alt="" className="w-10 h-10 rounded-full object-cover" loading="lazy" width="40" height="40" />
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-secondary-container flex items-center justify-center font-bold text-on-secondary-container">{req.name.split(' ').map(n=>n[0]).join('')}</div>
                        )}
                        <div>
                          <p className="font-label-md text-on-surface">{req.name}</p>
                          <p className="text-body-sm text-outline">{req.department}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div>
                        <p className="font-mono-data font-bold text-on-surface">{claim.ref}</p>
                        <div className="flex items-center text-on-surface-variant font-body-sm mt-0.5">
                          <span className="material-symbols-outlined text-[18px] mr-2 text-primary">{claimTypeIcon(claim.type)}</span>
                          {claim.type}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-on-surface-variant whitespace-nowrap">
                      {formatDate(claim.submittedAt || claim.createdAt)}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex px-2 py-1 rounded-md text-xs font-bold whitespace-nowrap ${aging.color}`}>{aging.text}</span>
                    </td>
                    <td className="px-6 py-4 font-mono-data text-on-surface font-bold">{formatMoney(claim.total)}</td>
                    <td className="px-6 py-4 text-center">
                      <StatusBadge status={claim.status} />
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex justify-end gap-2">
                        <Button size="sm" onClick={() => navigate('/approvals')}>Review</Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </PaginatedTable>
        </div>
      </Card>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-8 items-start">
        <Card className="p-6">
          <div className="flex justify-between items-center mb-6">
            <h4 className="font-headline-md text-on-surface">Recent Decisions</h4>
            <span className="material-symbols-outlined text-outline">history</span>
          </div>
          {myDecisions.length === 0 ? (
            <p className="text-body-sm text-outline">No decisions recorded yet.</p>
          ) : (
            <div className="space-y-6">
              {myDecisions.slice(0, 4).map((h, i) => {
                const claim = claims.find(c => c.id === h.claimId);
                const dotColor = (h.newStatus === ClaimStatus.APPROVED || h.newStatus === ClaimStatus.PROCESSING) ? 'bg-primary' : h.newStatus === ClaimStatus.REJECTED ? 'bg-error' : 'bg-tertiary';
                const displayStatus = h.newStatus === ClaimStatus.PROCESSING ? ClaimStatus.APPROVED : h.newStatus;
                return (
                  <div key={h.id} className="flex gap-4">
                    <div className="flex flex-col items-center">
                      <div className={`w-2 h-2 rounded-full ${dotColor}`}></div>
                      {i < Math.min(myDecisions.length, 4) - 1 && <div className="w-[1px] flex-1 bg-outline-variant my-1"></div>}
                    </div>
                    <div className="pb-2">
                      <p className="font-label-md text-on-surface">{claim ? `${claim.ref} — ${displayStatus}` : displayStatus}</p>
                      {h.comment && <p className="text-body-sm text-outline">{h.comment}</p>}
                      <p className="text-[12px] text-outline mt-1">{formatDateTime(h.timestamp)}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
        <TeamMemberSpending
          members={relevantMembers}
          claims={myApprovedClaims}
          lineItems={lineItems}
          title="Approved Spending by Member"
          description="Receipt-supported spend approved by you."
        />
      </div>
    </div>
  );
}
