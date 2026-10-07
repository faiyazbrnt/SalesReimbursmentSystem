import { RecordCount } from '../../../components/shared/RecordCount';
import { PaginatedTable } from '../../../components/ui/PaginatedTable';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardHeader } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { Input, Select } from '../../../components/ui/Input';
import { StatusBadge } from '../../../components/ui/StatusBadge';
import { KPICard } from '../../../components/ui/KPICard';
import { useAppContext } from '../../../components/AppContext';
import { ClaimStatus } from '../../../types';
import { formatMoney } from '../../../lib/money';
import { claimTypeIcon, getClaimAgingInfo, isCustodianProcessingClaim } from '@/features/claims';

export function CustodianDashboard() {
  const navigate = useNavigate();
  const { claims, users } = useAppContext();
  const [queueSearch, setQueueSearch] = useState('');
  const [queueType, setQueueType] = useState('');
  const [queueStatus, setQueueStatus] = useState('');
  const [showQueueFilters, setShowQueueFilters] = useState(false);

  const processingClaims = useMemo(
    () => claims
      .filter(isCustodianProcessingClaim)
      .sort((a, b) =>
        new Date(a.approvedAt || a.submittedAt || a.createdAt).getTime() -
        new Date(b.approvedAt || b.submittedAt || b.createdAt).getTime()
      ),
    [claims]
  );
  const readyForPickup = claims.filter(c => c.status === ClaimStatus.READY_FOR_CLAIM).length;
  const queueTypes = useMemo(
    () => Array.from(new Set(processingClaims.map(claim => claim.type))).sort(),
    [processingClaims]
  );
  const visibleProcessingClaims = useMemo(() => {
    const query = queueSearch.trim().toLowerCase();
    return processingClaims.filter(claim => {
      const requestor = users.find(user => user.id === claim.requestorId);
      const matchesSearch = !query || [claim.ref, claim.type, claim.client, requestor?.name]
        .some(value => value?.toLowerCase().includes(query));
      return matchesSearch && (!queueType || claim.type === queueType) && (!queueStatus || claim.status === queueStatus);
    });
  }, [processingClaims, queueSearch, queueStatus, queueType, users]);
  const hasQueueFilters = Boolean(queueType || queueStatus);

  const clearQueueFilters = () => {
    setQueueSearch('');
    setQueueType('');
    setQueueStatus('');
  };

  const oldestItem = processingClaims[0];
  const oldestRequestor = oldestItem
    ? users.find(user => user.id === oldestItem.requestorId)
    : undefined;
  const oldestAging = oldestItem
    ? getClaimAgingInfo(oldestItem.approvedAt || oldestItem.submittedAt, oldestItem.createdAt)
    : null;

  const byType = useMemo(() => {
    const counts: Record<string, number> = { Reimbursement: 0, 'Cash Advance': 0, Liquidation: 0 };
    processingClaims.forEach(c => { counts[c.type] = (counts[c.type] || 0) + 1; });
    return counts;
  }, [processingClaims]);

  // Distinct requestors actually in the queue, not a fixed decorative stack.
  const queueRequestors = useMemo(() => {
    const seen = new Set<string>();
    const list: typeof users = [];
    for (const c of processingClaims) {
      if (seen.has(c.requestorId)) continue;
      const u = users.find(u => u.id === c.requestorId);
      if (u) { seen.add(u.id); list.push(u); }
    }
    return list;
  }, [processingClaims, users]);

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex justify-between items-end">
        <div>
          <span className="font-label-sm text-primary font-bold tracking-wider uppercase">Custodian Queue</span>
          <h1 className="font-display text-display text-on-surface mt-1">Pending Disbursements</h1>
        </div>
        <div className="flex gap-3">
          <Button className="gap-2 focus:ring-2 focus:ring-primary outline-none" onClick={() => {
            const rows = [
              ['Ref', 'Requestor', 'Type', 'Amount', 'Status'],
              ...processingClaims.map(c => {
                const req = users.find(u => u.id === c.requestorId);
                return [c.ref, req?.name || '', c.type, c.total.toFixed(2), c.status];
              }),
            ];
            const csv = rows.map(r => r.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
            const blob = new Blob([csv], { type: 'text/csv' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `custodian-queue-${new Date().toISOString().slice(0, 10)}.csv`;
            a.click();
            URL.revokeObjectURL(url);
          }}><span className="material-symbols-outlined">download</span> Export Queue</Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <KPICard
          title="Total Pending"
          value={processingClaims.length.toString()}
          icon="pending_actions"
          iconColorClass="bg-primary-fixed text-on-primary-fixed-variant"
          trend="Active Queue"
          trendColorClass="text-primary bg-primary-fixed px-2 py-1 rounded-full"
        />
        <Card
          className={`p-5 ${oldestItem ? 'cursor-pointer hover:border-tertiary transition-colors' : ''}`}
          onClick={oldestItem ? () => navigate(`/claims/${oldestItem.id}`) : undefined}
        >
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="font-label-sm text-outline uppercase tracking-wider">Oldest Item in Queue</p>
              <p className="font-headline-md text-on-surface mt-2">{oldestAging?.text || '—'}</p>
              <p className="font-mono-data text-xs text-primary mt-2 truncate">{oldestItem?.ref || 'Queue is empty'}</p>
              <p className="text-xs text-outline mt-1 truncate">{oldestRequestor?.name || 'No requestor waiting'}</p>
            </div>
            <div className="w-11 h-11 rounded-full bg-tertiary-fixed text-on-tertiary-fixed-variant flex items-center justify-center">
              <span className="material-symbols-outlined">schedule</span>
            </div>
          </div>
        </Card>
      </div>

      <Card className="bg-white">
        <CardHeader className="bg-white">
          <div className="flex items-center gap-4">
            <h3 className="font-headline-sm uppercase tracking-wider text-slate-900 font-bold">Claims Awaiting Processing</h3>
            {queueRequestors.length > 0 && (
              <div className="flex -space-x-2">
                {queueRequestors.slice(0, 3).map(u => (
                  u.avatarUrl ? (
                    <img key={u.id} src={u.avatarUrl} alt={u.name} title={u.name} className="w-8 h-8 rounded-full border-2 border-surface-container-lowest object-cover" />
                  ) : (
                    <div key={u.id} title={u.name} className="w-8 h-8 rounded-full border-2 border-surface-container-lowest bg-primary-fixed flex items-center justify-center text-[12px] font-bold">
                      {u.name.split(' ').map(n => n[0]).join('')}
                    </div>
                  )
                ))}
                {queueRequestors.length > 3 && (
                  <div className="w-8 h-8 rounded-full border-2 border-surface-container-lowest bg-tertiary-fixed flex items-center justify-center text-[12px] font-bold">
                    +{queueRequestors.length - 3}
                  </div>
                )}
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            <RecordCount count={visibleProcessingClaims.length} total={processingClaims.length} />
          </div>
        </CardHeader>
        <div className="border-b border-outline-variant bg-white p-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center">
            <div className="relative min-w-0 flex-1">
              <Input type="search"
                className="pl-10"
                value={queueSearch}
                onChange={event => setQueueSearch(event.target.value)}
                placeholder="Search reference, requestor, client, or type..."
                aria-label="Search claims awaiting processing"
              />
            </div>
            <Button
              variant="outline"
              className="gap-2 md:flex-none"
              onClick={() => setShowQueueFilters(open => !open)}
              aria-expanded={showQueueFilters}
            >
              <span className="material-symbols-outlined text-[18px]">filter_list</span>
              Filters{hasQueueFilters ? ' (active)' : ''}
            </Button>
            {(queueSearch || hasQueueFilters) && (
              <button className="text-xs font-semibold text-primary hover:underline md:flex-none" onClick={clearQueueFilters}>Clear all</button>
            )}
          </div>
          {showQueueFilters && (
            <div className="mt-4 grid grid-cols-1 gap-3 border-t border-outline-variant pt-4 sm:grid-cols-2">
              <Select value={queueType} onChange={event => setQueueType(event.target.value)} aria-label="Filter claims awaiting processing by type">
                <option value="">All types</option>
                {queueTypes.map(type => <option key={type} value={type}>{type}</option>)}
              </Select>
              <Select value={queueStatus} onChange={event => setQueueStatus(event.target.value)} aria-label="Filter claims awaiting processing by status">
                <option value="">All statuses</option>
                {Array.from(new Set(processingClaims.map(claim => claim.status))).map(status => <option key={status} value={status}>{status}</option>)}
              </Select>
            </div>
          )}
        </div>
        <div className="overflow-x-auto">
          <PaginatedTable className="w-full text-left">
            <thead className="bg-slate-100 text-slate-600 font-label-sm uppercase font-semibold tracking-wider border-b border-outline-variant">
              <tr>
                <th className="px-6 py-4">Ref &amp; Type</th>
                <th className="px-6 py-4">Requestor</th>
                <th className="px-6 py-4">In Queue</th>
                <th className="px-6 py-4">Amount</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-outline-variant">
              {visibleProcessingClaims.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-outline">
                    <span className="material-symbols-outlined text-4xl mb-2 opacity-50">task_alt</span>
                    <p className="font-label-md">{processingClaims.length === 0 ? 'Queue is empty!' : 'No claims match these filters.'}</p>
                  </td>
                </tr>
              ) : visibleProcessingClaims.map(claim => {
                const req = users.find(u => u.id === claim.requestorId) || users[0];
                const aging = getClaimAgingInfo(claim.approvedAt || claim.submittedAt, claim.createdAt);
                return (
                  <tr role="button" tabIndex={0} onKeyDown={event => { if (event.target === event.currentTarget && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); event.currentTarget.click(); } }}  key={claim.id} className="hover:bg-slate-50 transition-colors group cursor-pointer bg-white" onClick={(e) => {
                    if (!(e.target as HTMLElement).closest('button')) {
                      navigate(`/claims/${claim.id}`);
                    }
                  }}>
                    <td className="px-6 py-5">
                      <p className="font-mono-data text-primary font-bold">{claim.ref}</p>
                      <p className="text-xs text-outline mt-0.5 inline-flex items-center gap-1">
                        <span className="material-symbols-outlined text-[14px]">{claimTypeIcon(claim.type)}</span>
                        {claim.type}
                      </p>
                    </td>
                    <td className="px-6 py-5">
                      <div className="flex items-center gap-3">
                        {req.avatarUrl ? (
                          <img src={req.avatarUrl} alt="" className="w-8 h-8 rounded-full object-cover" />
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-surface-container-high flex items-center justify-center text-xs font-semibold">{req.name.split(' ').map(n=>n[0]).join('')}</div>
                        )}
                        <div>
                          <p className="text-sm font-bold">{req.name}</p>
                          <p className="text-xs text-outline">{req.department}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-5">
                      <span className={`inline-flex px-2 py-1 rounded-md text-xs font-bold whitespace-nowrap ${aging.color}`}>{aging.text}</span>
                    </td>
                    <td className="px-6 py-5 font-mono-data text-sm font-bold">{formatMoney(claim.total)}</td>
                    <td className="px-6 py-5">
                      <StatusBadge status={claim.status} />
                    </td>
                    <td className="px-6 py-5 text-right">
                      <Button size="sm" className="gap-2 ml-auto" onClick={() => navigate(`/claims/${claim.id}`)}>
                        <span className="material-symbols-outlined text-[16px]">fact_check</span>
                        Review
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </PaginatedTable>
        </div>
      </Card>
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="p-6">
          <h4 className="font-label-md text-on-surface mb-4">Queue by Type</h4>
          <div className="space-y-4">
            {(Object.entries(byType) as [string, number][]).map(([type, count]) => (
              <div key={type}>
                <div className="flex justify-between mb-1">
                  <span className="font-label-sm text-on-surface-variant">{type}</span>
                  <span className="font-label-sm text-primary">{count}</span>
                </div>
                <div className="h-1.5 w-full bg-surface-container-high rounded-full">
                  <div
                    className="h-full bg-primary rounded-full transition-all"
                    style={{ width: processingClaims.length > 0 ? `${(count / processingClaims.length) * 100}%` : '0%' }}
                  ></div>
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card className="bg-primary-container text-on-primary-container p-6 relative flex flex-col justify-center overflow-hidden">
          <div className="z-10">
            <h4 className="font-headline-md mb-2">Ready for Pickup</h4>
            <p className="text-body-base opacity-80 mb-6">
              {readyForPickup === 0
                ? 'No claims are currently awaiting requestor confirmation.'
                : `${readyForPickup} claim${readyForPickup === 1 ? '' : 's'} ${readyForPickup === 1 ? 'has' : 'have'} a release code out and ${readyForPickup === 1 ? 'is' : 'are'} awaiting requestor confirmation.`}
            </p>
            <Button variant="secondary" className="gap-2 text-primary font-bold" onClick={() => navigate('/ready-to-claim')}>
              <span className="material-symbols-outlined">key</span> View Ready to Claim
            </Button>
          </div>
          <div className="absolute top-0 right-0 -mr-12 -mt-12 w-64 h-64 bg-white/10 rounded-full blur-3xl"></div>
          <div className="absolute bottom-0 right-0 p-4 opacity-20">
            <span className="material-symbols-outlined text-[120px]">inventory_2</span>
          </div>
        </Card>
      </div>
    </div>
  );
}
