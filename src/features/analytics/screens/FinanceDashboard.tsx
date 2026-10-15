import { PaginatedTable } from '../../../components/ui/PaginatedTable';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardHeader } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { Input, Select } from '../../../components/ui/Input';
import { KPICard } from '../../../components/ui/KPICard';
import { StatusBadge } from '../../../components/ui/StatusBadge';
import { useAppContext } from '../../../components/AppContext';
import { ClaimStatus } from '../../../types';
import { formatMoney } from '../../../lib/money';
import { formatDate } from '../../../lib/date';
import { claimTypeIcon, isFinanceVisibleClaim } from '@/features/claims';

export function FinanceDashboard() {
  const navigate = useNavigate();
  const { claims, users } = useAppContext();
  const [recordSearch, setRecordSearch] = useState('');
  const [recordType, setRecordType] = useState('');
  const [recordStatus, setRecordStatus] = useState('');
  const [showRecordFilters, setShowRecordFilters] = useState(false);

  const financeClaims = useMemo(() => claims.filter(isFinanceVisibleClaim), [claims]);
  const inProcessing = financeClaims.filter(c =>
    c.status === ClaimStatus.APPROVED || c.status === ClaimStatus.PROCESSING
  );
  const readyForClaim = financeClaims.filter(c => c.status === ClaimStatus.READY_FOR_CLAIM);
  const completedThisMonth = useMemo(() => {
    const now = new Date();
    return financeClaims.filter(c => {
      if (![ClaimStatus.COMPLETED, ClaimStatus.RELEASED, ClaimStatus.CLOSED, ClaimStatus.LIQUIDATED].includes(c.status)) return false;
      const date = new Date(c.processingDate || c.releaseDate || c.createdAt);
      return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
    });
  }, [financeClaims]);

  const processingValue = inProcessing.reduce((sum, c) => sum + (c.approvedAmount || 0), 0);
  const readyValue = readyForClaim.reduce((sum, c) => sum + c.paidAmount, 0);
  const recordTypes = useMemo(
    () => Array.from(new Set(financeClaims.map(claim => claim.type))).sort(),
    [financeClaims]
  );
  const recent = useMemo(() => {
    const query = recordSearch.trim().toLowerCase();
    return financeClaims
      .filter(claim => {
        const requestor = users.find(user => user.id === claim.requestorId);
        const matchesSearch = !query || [claim.ref, claim.type, claim.client, requestor?.name]
          .some(value => value?.toLowerCase().includes(query));
        return matchesSearch && (!recordType || claim.type === recordType) && (!recordStatus || claim.status === recordStatus);
      })
      .sort((a, b) => new Date(b.submittedAt || b.createdAt).getTime() - new Date(a.submittedAt || a.createdAt).getTime());
  }, [financeClaims, recordSearch, recordStatus, recordType, users]);
  const hasRecordFilters = Boolean(recordType || recordStatus);

  const clearRecordFilters = () => {
    setRecordSearch('');
    setRecordType('');
    setRecordStatus('');
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <span className="font-label-sm text-primary font-bold tracking-wider uppercase">View-only</span>
          <h1 className="font-display text-display text-on-surface mt-1">Finance Overview</h1>
          <p className="text-body-md text-outline mt-1">Company-wide visibility from approval through payment and closure, without action controls.</p>
        </div>
        <Button variant="outline" className="gap-2" onClick={() => navigate('/finance/analytics')}>
          <span className="material-symbols-outlined text-[18px]">monitoring</span>
          Open Analytics
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <KPICard title="Approved Records" value={financeClaims.length.toString()} icon="fact_check" iconColorClass="bg-primary/5 text-primary" />
        <KPICard title="In Processing" value={formatMoney(processingValue)} icon="payments" iconColorClass="bg-primary/5 text-primary" trend={`${inProcessing.length} record${inProcessing.length === 1 ? '' : 's'}`} />
        <KPICard title="Ready for Claim" value={formatMoney(readyValue)} icon="key" iconColorClass="bg-primary/5 text-primary" trend={`${readyForClaim.length} awaiting confirmation`} />
        <KPICard title="Closed This Month" value={completedThisMonth.length.toString()} icon="task_alt" iconColorClass="bg-primary/5 text-primary" />
      </div>

      <div className="overflow-hidden rounded-xl border border-outline-variant bg-white">
        <CardHeader className="bg-white border-b border-outline-variant">
          <h2 className="font-headline-md text-slate-900 font-bold">Recent Financial Records</h2>
          <Button size="sm" variant="ghost" onClick={() => navigate('/claims')}>View all</Button>
        </CardHeader>
        <div className="border-b border-outline-variant bg-white p-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center">
            <div className="relative min-w-0 flex-1">
              <Input type="search"
                className="pl-10"
                value={recordSearch}
                onChange={event => setRecordSearch(event.target.value)}
                placeholder="Search reference, requestor, client, or type..."
                aria-label="Search recent financial records"
              />
            </div>
            <Button
              variant="outline"
              className="gap-2 md:flex-none"
              onClick={() => setShowRecordFilters(open => !open)}
              aria-expanded={showRecordFilters}
            >
              <span className="material-symbols-outlined text-[18px]">filter_list</span>
              Filters{hasRecordFilters ? ' (active)' : ''}
            </Button>
            {(recordSearch || hasRecordFilters) && (
              <button className="text-xs font-semibold text-primary hover:underline md:flex-none" onClick={clearRecordFilters}>Clear all</button>
            )}
          </div>
          {showRecordFilters && (
            <div className="mt-4 grid grid-cols-1 gap-3 border-t border-outline-variant pt-4 sm:grid-cols-2">
              <Select value={recordType} onChange={event => setRecordType(event.target.value)} aria-label="Filter recent financial records by type">
                <option value="">All types</option>
                {recordTypes.map(type => <option key={type} value={type}>{type}</option>)}
              </Select>
              <Select value={recordStatus} onChange={event => setRecordStatus(event.target.value)} aria-label="Filter recent financial records by status">
                <option value="">All statuses</option>
                {Array.from(new Set(financeClaims.map(claim => claim.status))).map(status => <option key={status} value={status}>{status}</option>)}
              </Select>
            </div>
          )}
        </div>
        <div className="overflow-x-auto">
          <PaginatedTable className="w-full text-left">
            <thead className="bg-slate-100 text-slate-600 font-label-sm uppercase font-semibold tracking-wider border-b border-outline-variant">
              <tr>
                <th className="px-6 py-4">Reference</th>
                <th className="px-6 py-4">Requestor</th>
                <th className="px-6 py-4">Type</th>
                <th className="px-6 py-4">Submitted</th>
                <th className="px-6 py-4 text-right">Amount</th>
                <th className="px-6 py-4 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-outline-variant">
              {recent.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-outline">
                    <span className="material-symbols-outlined text-4xl opacity-50">manage_search</span>
                    <p className="mt-2 font-label-md">No financial records match these filters.</p>
                  </td>
                </tr>
              ) : recent.map(claim => {
                const requestor = users.find(u => u.id === claim.requestorId);
                return (
                  <tr role="button" tabIndex={0} onKeyDown={event => { if (event.target === event.currentTarget && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); event.currentTarget.click(); } }}  key={claim.id} className="hover:bg-slate-50 cursor-pointer bg-white" onClick={() => navigate(`/claims/${claim.id}`)}>
                    <td className="px-6 py-4 font-mono-data font-bold text-primary">{claim.ref}</td>
                    <td className="px-6 py-4 text-sm text-on-surface">{requestor?.name || 'Unknown'}</td>
                    <td className="px-6 py-4">
                      <span className="inline-flex items-center gap-2 text-sm text-on-surface-variant">
                        <span className="material-symbols-outlined text-[18px] text-primary">{claimTypeIcon(claim.type)}</span>
                        {claim.type}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-on-surface-variant">{formatDate(claim.submittedAt || claim.createdAt)}</td>
                    <td className="px-6 py-4 text-right font-mono-data font-bold">{formatMoney(claim.total)}</td>
                    <td className="px-6 py-4 text-center"><StatusBadge status={claim.status} /></td>
                  </tr>
                );
              })}
            </tbody>
          </PaginatedTable>
        </div>
      </div>
    </div>
  );
}
