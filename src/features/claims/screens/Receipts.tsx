import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Modal } from '../../../components/shared/Modal';

import { Card, CardContent } from '../../../components/ui/Card';
import { formatMoney } from '../../../lib/money';
import { Button } from '../../../components/ui/Button';
import { Label, Select } from '../../../components/ui/Input';
import { Pagination } from '../../../components/ui/Pagination';
import { StatusBadge } from '../../../components/ui/StatusBadge';
import { useAppContext } from '../../../components/AppContext';
import { GroupByControl, TeamAnalytics } from '@/features/analytics';
import { FilterBar, type SelectFilterSpec } from '../../../components/shared/FilterBar';
import { ExportDropdown } from '../../../components/shared/ExportDropdown';
import { uploadUrl } from '../../../lib/api';
import { ClaimStatus, UserRole } from '../../../types';
import { FINANCE_VISIBLE_STATUSES, isFinanceVisibleClaim } from '../domain/claimWorkflow';

interface ReceiptRecord {
  id: string;
  fileName: string;
  fileUrl?: string;
  category: string;
  vendor: string;
  businessPurpose?: string;
  amount: number;
  date: string;
  claimRef?: string;
  claimId?: string;
  claimStatus?: ClaimStatus;
  claimType?: string;
  client?: string;
  requestorId?: string;
  orNumber?: string;
}

export function Receipts() {
  const navigate = useNavigate();
  const { lineItems, claims, currentUser, users } = useAppContext();

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [selectedMember, setSelectedMember] = useState('');
  const [receiptStatus, setReceiptStatus] = useState<'all' | 'attached' | 'missing'>('all');
  const [claimStatusFilter, setClaimStatusFilter] = useState('');
  const [claimTypeFilter, setClaimTypeFilter] = useState('');
  const [clientFilter, setClientFilter] = useState('');
  const [amountMin, setAmountMin] = useState('');
  const [amountMax, setAmountMax] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'highest' | 'lowest' | 'missing'>('newest');
  const [selectedReceipt, setSelectedReceipt] = useState<ReceiptRecord | null>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('list');
  const [groupBy, setGroupBy] = useState<'none' | 'member' | 'client'>('none');
  const [currentPage, setCurrentPage] = useState(1);

  // Approvers manage their own submissions plus whatever's routed through
  // them; split the archive so "my receipts" isn't buried in the team's.
  const isApprover = currentUser.role === UserRole.APPROVER;
  const isFinance = currentUser.role === UserRole.FINANCE;
  const compactToolbar = isApprover || isFinance || currentUser.role === UserRole.CUSTODIAN;
  const reporteeIds = new Set(users.filter(u => u.reportsTo === currentUser.id).map(u => u.id));
  const teamMembers = users
    .filter(user => user.reportsTo === currentUser.id)
    .sort((a, b) => a.name.localeCompare(b.name));
  const [scope, setScope] = useState<'mine' | 'team'>(isApprover ? 'team' : 'mine');
  const itemsPerPage = isApprover && scope === 'team' ? 5 : 8;

  // Every line item belongs here, including expenses whose receipt is missing.
  const derivedReceipts: ReceiptRecord[] = lineItems
    .map(item => {
      const parentClaim = claims.find(c => c.id === item.claimId);
      return {
        id: item.id,
        fileName: item.receiptFileName || (item.receiptUrl ? `Receipt_${item.vendor || item.category}.pdf` : 'No receipt attached'),
        fileUrl: item.receiptUrl,
        category: item.category,
        vendor: item.vendor || 'Vendor N/A',
        businessPurpose: item.businessPurpose,
        amount: item.amount,
        date: item.expenseDate,
        claimRef: parentClaim?.ref,
        claimId: item.claimId,
        claimStatus: parentClaim?.status,
        claimType: parentClaim?.type,
        client: parentClaim?.client,
        requestorId: parentClaim?.requestorId,
        orNumber: item.orNumber,
      };
    });

  const isRequestorInScope = (requestorId?: string) => {
    if (isFinance || !isApprover) return true;
    return scope === 'mine'
      ? requestorId === currentUser.id
      : Boolean(requestorId && reporteeIds.has(requestorId));
  };

  const scopedReceipts = isFinance
    ? derivedReceipts.filter(receipt => {
      const parentClaim = claims.find(claim => claim.id === receipt.claimId);
      return Boolean(parentClaim && isFinanceVisibleClaim(parentClaim));
    })
    : !isApprover
      ? derivedReceipts
      : derivedReceipts.filter(receipt => {
        if (!isRequestorInScope(receipt.requestorId)) return false;
        if (scope !== 'team') return true;
        return claims.find(claim => claim.id === receipt.claimId)?.status !== ClaimStatus.DRAFT;
      });
  const scopedLineItems = lineItems.filter(item => {
    const parentClaim = claims.find(c => c.id === item.claimId);
    if (isFinance) return Boolean(parentClaim && isFinanceVisibleClaim(parentClaim));
    if (!isRequestorInScope(parentClaim?.requestorId)) return false;
    return !(isApprover && scope === 'team' && parentClaim?.status === ClaimStatus.DRAFT);
  });
  const availableMembers = users.filter(u =>
    scopedReceipts.some(r => r.requestorId === u.id)
  ).sort((a, b) => a.name.localeCompare(b.name));
  const categoryOptions = Array.from(new Set(scopedReceipts.map(r => r.category).filter(Boolean))).sort();
  const clientOptions = Array.from(new Set(scopedReceipts.map(r => r.client).filter((client): client is string => Boolean(client)))).sort();

  const filteredReceipts = scopedReceipts
    .filter(r => {
      const query = searchTerm.toLowerCase();
      const matchesSearch =
        r.fileName.toLowerCase().includes(query) ||
        r.vendor.toLowerCase().includes(query) ||
        Boolean(r.businessPurpose?.toLowerCase().includes(query)) ||
        Boolean(r.claimRef?.toLowerCase().includes(query)) ||
        Boolean(r.orNumber?.toLowerCase().includes(query));
      const matchesCategory = !selectedCategory || r.category === selectedCategory;
      const matchesReceiptStatus = receiptStatus === 'all' || (receiptStatus === 'attached' ? Boolean(r.fileUrl) : !r.fileUrl);
      const matchesMember = !selectedMember || r.requestorId === selectedMember;
      const matchesClaimStatus = !claimStatusFilter || r.claimStatus === claimStatusFilter;
      const matchesClaimType = !claimTypeFilter || r.claimType === claimTypeFilter;
      const matchesClient = !clientFilter || r.client === clientFilter;
      const matchesAmountMin = !amountMin || r.amount >= Number(amountMin);
      const matchesAmountMax = !amountMax || r.amount <= Number(amountMax);
      const receiptDate = new Date(`${r.date}T12:00:00`).getTime();
      const matchesFrom = !dateFrom || receiptDate >= new Date(`${dateFrom}T00:00:00`).getTime();
      const matchesTo = !dateTo || receiptDate <= new Date(`${dateTo}T23:59:59`).getTime();
      return matchesSearch && matchesCategory && matchesReceiptStatus && matchesMember &&
        matchesClaimStatus && matchesClaimType && matchesClient && matchesAmountMin &&
        matchesAmountMax && matchesFrom && matchesTo;
    })
    .sort((a, b) => {
      if (sortBy === 'oldest') return new Date(a.date).getTime() - new Date(b.date).getTime();
      if (sortBy === 'highest') return b.amount - a.amount;
      if (sortBy === 'lowest') return a.amount - b.amount;
      if (sortBy === 'missing') return Number(Boolean(a.fileUrl)) - Number(Boolean(b.fileUrl)) || new Date(b.date).getTime() - new Date(a.date).getTime();
      return new Date(b.date).getTime() - new Date(a.date).getTime();
    });

  const filteredReceiptIds = new Set(filteredReceipts.map(receipt => receipt.id));
  const filteredApplicableLineItems = scopedLineItems.filter(item => filteredReceiptIds.has(item.id));

  // Grouping by member is only meaningful when more than one person's receipts
  // are visible; grouping by client works in any scope.
  const canGroupByMember = isFinance || (isApprover && scope === 'team');
  const totalPages = Math.ceil(filteredReceipts.length / itemsPerPage);
  const paginatedReceipts = filteredReceipts.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);
  const receiptGroups = groupBy === 'none' ? [] : (() => {
    const map = new Map<string, ReceiptRecord[]>();
    for (const receipt of paginatedReceipts) {
      const key = groupBy === 'member' ? (receipt.requestorId || 'unknown') : (receipt.client || '—');
      const bucket = map.get(key);
      if (bucket) bucket.push(receipt);
      else map.set(key, [receipt]);
    }
    return Array.from(map.entries()).map(([key, items]) => {
      const total = items.reduce((sum, item) => sum + item.amount, 0);
      const attached = items.filter(item => Boolean(item.fileUrl)).length;
      const label = groupBy === 'member'
        ? (users.find(user => user.id === key)?.name || 'Unknown requestor')
        : (key === '—' ? 'No client' : key);
      return { key, label, items, total, attached, coverage: items.length ? Math.round((attached / items.length) * 100) : 0 };
    }).sort((a, b) => b.total - a.total);
  })();


  const applyThisMonth = () => {
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
    setDateFrom(firstDay.toISOString().split('T')[0]);
    setDateTo(now.toISOString().split('T')[0]);
  };

  useEffect(() => {
    setCurrentPage(1);
  }, [
    searchTerm,
    selectedCategory,
    selectedMember,
    receiptStatus,
    claimStatusFilter,
    claimTypeFilter,
    clientFilter,
    amountMin,
    amountMax,
    dateFrom,
    dateTo,
    sortBy,
    scope,
  ]);

  useEffect(() => {
    setSelectedMember('');
  }, [scope]);

  // "By team member" stops making sense once we're back to a single person's
  // receipts, so fall back to an ungrouped list.
  useEffect(() => {
    if (!canGroupByMember && groupBy === 'member') setGroupBy('none');
  }, [canGroupByMember, groupBy]);

  const filteredTotal = filteredReceipts.reduce((sum, receipt) => sum + receipt.amount, 0);
  const receiptCoverage = filteredApplicableLineItems.length === 0
    ? null
    : Math.round((filteredApplicableLineItems.filter(item => item.receiptUrl).length / filteredApplicableLineItems.length) * 100);
  const averageReceipt = filteredReceipts.length === 0 ? 0 : filteredTotal / filteredReceipts.length;
  const attachedReceiptCount = filteredReceipts.filter(expense => Boolean(expense.fileUrl)).length;
  const categoryTotals = filteredReceipts.reduce<Record<string, number>>((totals, receipt) => {
    totals[receipt.category] = (totals[receipt.category] || 0) + receipt.amount;
    return totals;
  }, {});
  const topCategory = Object.entries(categoryTotals).sort((a, b) => b[1] - a[1])[0];
  const showRequestorCol = isFinance || (isApprover && scope === 'team');

  const renderReceiptGrid = (items: ReceiptRecord[], showRequestor: boolean) => (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 p-6 pt-4">
      {items.map(receipt => (
        <Card
          key={receipt.id}
          className="overflow-hidden hover:border-primary transition-all cursor-pointer group hover:shadow-md"
          onClick={() => setSelectedReceipt(receipt)}
        >
          <div className="h-36 bg-surface-container-high flex flex-col items-center justify-center relative p-4">
            <span className={`material-symbols-outlined text-4xl mb-1 ${receipt.fileUrl ? 'text-primary' : 'text-tertiary'}`}>
              {receipt.fileUrl ? 'receipt_long' : 'receipt_long_off'}
            </span>
            <span className="text-xs font-mono-data font-semibold text-on-surface text-center truncate max-w-full px-2">
              {receipt.fileName}
            </span>
            {!receipt.fileUrl && (
              <span className="text-[11px] font-bold text-tertiary mt-1">Receipt missing</span>
            )}
            <span className="text-[12px] uppercase font-bold text-outline mt-1 bg-surface-container px-2 py-0.5 rounded">
              {receipt.category}
            </span>
            {receipt.orNumber && (
              <span className="text-[11px] font-mono-data text-outline mt-1">OR {receipt.orNumber}</span>
            )}
            {showRequestor && (
              <span className="text-[12px] text-outline mt-1">
                {users.find(u => u.id === receipt.requestorId)?.name || 'Unknown requestor'}
              </span>
            )}
          </div>
          <CardContent className="p-4 bg-surface-container-lowest">
            <div className="flex justify-between items-start mb-1">
              <p className="font-label-md text-on-surface font-semibold truncate">{receipt.vendor}</p>
              <p className="font-mono-data font-bold text-primary">{formatMoney(receipt.amount)}</p>
            </div>
            {receipt.businessPurpose && <p className="text-xs text-outline line-clamp-2">{receipt.businessPurpose}</p>}
            <div className="flex justify-between items-center text-xs text-outline mt-2 pt-2 border-t border-outline-variant/40">
              <span>{receipt.date}</span>
              {receipt.claimRef && (
                <span className="bg-primary-container/16 text-primary font-mono-data px-1.5 py-0.5 rounded text-[12px]">
                  {receipt.claimRef}
                </span>
              )}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );

  const renderReceiptTable = (
    items: ReceiptRecord[],
    showRequestor: boolean,
    summary?: { total: number; coverage: number; attached: number; count: number }
  ) => (
    isApprover ? (
      <div className="overflow-x-auto">
        <table className="w-full min-w-[650px] text-left">
          <thead className="bg-primary/5 text-[10px] uppercase tracking-wider text-outline"><tr><th>Vendor / Merchant</th><th>Purpose &amp; Claim Ref</th><th>Date</th><th>Receipt Status</th><th>Amount (PHP)</th></tr></thead>
          <tbody className="divide-y divide-outline-variant/30 bg-white">
            {items.map(receipt => <tr key={receipt.id} tabIndex={0} role="button" onClick={() => setSelectedReceipt(receipt)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelectedReceipt(receipt); } }} className="cursor-pointer hover:bg-primary/5">
              <td><p className="text-sm font-semibold">{receipt.vendor}</p><p className="text-xs text-outline">{receipt.category}</p></td>
              <td><p className="text-sm">{receipt.businessPurpose || '?'}</p><p className="font-mono-data text-xs text-primary">{receipt.claimRef || '?'}</p>{showRequestor && <p className="text-xs text-outline">{users.find(user => user.id === receipt.requestorId)?.name}</p>}</td>
              <td className="text-xs whitespace-nowrap">{receipt.date}</td>
              <td><span className={`rounded-md px-2 py-1 text-xs ${receipt.fileUrl ? 'bg-primary/5 text-primary' : 'bg-tertiary/5 text-tertiary'}`}>{receipt.fileUrl ? 'Attached' : 'Missing receipt'}</span></td>
              <td className="font-mono-data text-sm font-semibold whitespace-nowrap">{formatMoney(receipt.amount)}</td>
            </tr>)}
            {items.length === 0 && <tr><td colSpan={5}>
              <div className="flex min-h-[360px] flex-col items-center justify-center gap-3 text-center">
                <span aria-hidden="true" className="material-symbols-outlined rounded-2xl bg-primary/5 p-4 text-4xl text-primary">folder_open</span>
                <p className="text-sm font-semibold text-on-surface">No expenses found</p>
                <p className="text-xs text-outline">Expense lines will appear here when they are added to a claim.</p>
                {scope === 'mine' && <div className="mt-2 flex gap-2"><Button size="sm" onClick={() => navigate('/claims/new')}><span aria-hidden="true" className="material-symbols-outlined text-[16px]">add</span>Create New Expense</Button><Button size="sm" variant="outline" onClick={() => navigate('/claims/new')} title="Attach a receipt when adding an expense to a new claim"><span aria-hidden="true" className="material-symbols-outlined text-[16px]">upload_file</span>Upload Receipt</Button></div>}
              </div>
            </td></tr>}
          </tbody>
          {summary && <tfoot><tr><td colSpan={4} className="text-xs text-outline">Subtotal ? {summary.coverage}% receipt coverage</td><td className="font-mono-data font-semibold">{formatMoney(summary.total)}</td></tr></tfoot>}
        </table>
      </div>
    ) :
    <div className="overflow-x-auto">
      <table className="w-full text-left min-w-[980px]">
        <thead className="bg-slate-100 text-slate-600 font-label-sm uppercase font-semibold tracking-wider border-b border-outline-variant">
          <tr>
            <th className="px-5 py-3">Expense</th>
            {showRequestor && <th className="px-5 py-3">Requestor</th>}
            <th className="px-5 py-3">Claim</th>
            <th className="px-5 py-3">OR Number</th>
            <th className="px-5 py-3">Status</th>
            <th className="px-5 py-3">Category</th>
            <th className="px-5 py-3">Date of Purchase</th>
            <th className="px-5 py-3 text-right whitespace-nowrap">Amount</th>
            <th className="px-5 py-3 text-right whitespace-nowrap">Attachment</th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-outline-variant">
          {items.map(receipt => (
            <tr role="button" tabIndex={0} onKeyDown={event => { if (event.target === event.currentTarget && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); event.currentTarget.click(); } }}
              key={receipt.id}
              onClick={() => setSelectedReceipt(receipt)}
              className="hover:bg-slate-50 cursor-pointer transition-colors"
            >
              <td className="px-5 py-4">
                <div className="flex items-center gap-3">
                  <span className={`material-symbols-outlined ${receipt.fileUrl ? 'text-primary' : 'text-tertiary'}`}>
                    {receipt.fileUrl ? 'receipt_long' : 'receipt_long_off'}
                  </span>
                  <div className="min-w-0">
                    <p className="font-label-md text-on-surface truncate max-w-[240px]">{receipt.vendor}</p>
                    <p className="text-xs text-outline truncate max-w-[280px]">{receipt.businessPurpose || receipt.fileName}</p>
                  </div>
                </div>
              </td>
              {showRequestor && (
                <td className="px-5 py-4 text-body-sm text-on-surface">
                  {users.find(user => user.id === receipt.requestorId)?.name || 'Unknown requestor'}
                </td>
              )}
              <td className="px-5 py-4">
                <p className="font-mono-data text-xs text-primary">{receipt.claimRef || '—'}</p>
              </td>
              <td className="px-5 py-4 font-mono-data text-xs text-on-surface-variant whitespace-nowrap">{receipt.orNumber || 'No OR number'}</td>
              <td className="px-5 py-4">
                {receipt.claimStatus ? <StatusBadge status={receipt.claimStatus} /> : <span className="text-xs text-outline">Not linked</span>}
              </td>
              <td className="px-5 py-4">
                <span className="inline-flex rounded-full bg-surface-container-high px-2.5 py-1 text-xs font-medium text-on-surface-variant">
                  {receipt.category}
                </span>
              </td>
              <td className="px-5 py-4 text-body-sm text-on-surface-variant whitespace-nowrap">{receipt.date}</td>
              <td className="px-5 py-4 text-right font-mono-data font-bold text-on-surface whitespace-nowrap">{formatMoney(receipt.amount)}</td>
              <td className="px-5 py-4 text-right whitespace-nowrap">
                <span className={`inline-flex items-center gap-1 text-xs font-semibold ${receipt.fileUrl ? 'text-primary' : 'text-tertiary'}`}>
                  {receipt.fileUrl ? 'View receipt' : 'Missing receipt'}
                  <span className="material-symbols-outlined text-[16px]">{receipt.fileUrl ? 'open_in_new' : 'warning'}</span>
                </span>
              </td>
            </tr>
          ))}
        </tbody>
        {summary && (
          <tfoot className="border-t-2 border-outline-variant bg-surface-container-low/40">
            <tr>
              <td colSpan={showRequestor ? 7 : 6} className="px-5 py-4" />
              <td className="px-5 py-4 text-right align-top whitespace-nowrap">
                <p className="font-mono-data font-bold text-primary whitespace-nowrap">{formatMoney(summary.total)}</p>
                <p className="font-label-sm text-outline uppercase tracking-wider text-[11px] mt-0.5 whitespace-nowrap">Subtotal</p>
              </td>
              <td className="px-5 py-4 text-right align-top whitespace-nowrap">
                <p className="font-mono-data font-semibold text-on-surface whitespace-nowrap">
                  {summary.coverage}% <span className="text-outline font-normal text-xs">({summary.attached}/{summary.count})</span>
                </p>
                <p className="font-label-sm text-outline uppercase tracking-wider text-[11px] mt-0.5 whitespace-nowrap">Receipt coverage</p>
              </td>
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );

  const groupByOptions = [
    { value: 'none', label: 'List', icon: 'view_list' },
    { value: 'client', label: 'By Client', icon: 'domain' },
    ...(canGroupByMember ? [{ value: 'member', label: 'By Team Member', icon: 'person' }] : []),
  ];
  const groupControl = (
    <GroupByControl value={groupBy} options={groupByOptions} onChange={v => setGroupBy(v as typeof groupBy)} />
  );

  const receiptQuickFilters: SelectFilterSpec[] = [
    { type: 'select', key: 'category', label: 'Category', placeholder: 'All Categories', value: selectedCategory, onChange: setSelectedCategory, options: categoryOptions.map(c => ({ value: c, label: c })) },
    { type: 'select', key: 'receiptStatus', label: 'Receipt status', placeholder: 'All Receipts', value: receiptStatus === 'all' ? '' : receiptStatus, onChange: v => setReceiptStatus((v || 'all') as typeof receiptStatus), options: [{ value: 'attached', label: 'Receipt Attached' }, { value: 'missing', label: 'Missing Receipt' }] },
  ];

  return (
    <div className={isApprover ? "approver-receipts space-y-5 animate-in fade-in duration-500" : "space-y-8 animate-in fade-in duration-500"}>
      <div className={isApprover ? "sr-only" : "flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-outline-variant pb-4"}>
        <div>
          <h1 className="font-display text-display text-on-surface">{isFinance ? 'Financial Receipts' : 'Expenses & Receipts'}</h1>
          <p className="text-body-md text-outline mt-1">
            {isFinance
              ? 'Review supporting evidence for approved, processing, paid, and completed records.'
              : 'Review individual expenses, linked claims, and the supporting receipts behind them.'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3 shrink-0">
          {isFinance && (
            <ExportDropdown disabled={filteredReceipts.length === 0} />
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <Card className="p-4">
          <div className="flex items-center justify-between gap-2"><p className="font-label-sm text-outline uppercase tracking-wider">Total Expense Amount</p>{isApprover && <span aria-hidden="true" className="material-symbols-outlined rounded-md bg-primary/5 p-1 text-[16px] text-primary">payments</span>}</div>
          <p className="font-headline-md text-primary mt-1">{formatMoney(filteredTotal)}</p>
          <p className="text-[12px] text-outline mt-1">{filteredReceipts.length} expense{filteredReceipts.length === 1 ? '' : 's'} in this view</p>
        </Card>
        <Card className="p-4">
          <div className="flex items-center justify-between gap-2"><p className="font-label-sm text-outline uppercase tracking-wider">Receipt Coverage</p>{isApprover && <span aria-hidden="true" className="material-symbols-outlined rounded-md bg-primary/5 p-1 text-[16px] text-primary">receipt_long</span>}</div>
          <p className="font-headline-md text-on-surface mt-1">{receiptCoverage === null ? '—' : `${receiptCoverage}%`}</p>
          <p className="text-[12px] text-outline mt-1">{attachedReceiptCount} attached, {filteredReceipts.length - attachedReceiptCount} missing</p>
        </Card>
        <Card className="p-4">
          <div className="flex items-center justify-between gap-2"><p className="font-label-sm text-outline uppercase tracking-wider">Average Expense</p>{isApprover && <span aria-hidden="true" className="material-symbols-outlined rounded-md bg-primary/5 p-1 text-[16px] text-primary">monitoring</span>}</div>
          <p className="font-headline-md text-on-surface mt-1">{filteredReceipts.length === 0 ? '—' : formatMoney(averageReceipt)}</p>
          <p className="text-[12px] text-outline mt-1">Across the current filter</p>
        </Card>
        <Card className="p-4">
          <div className="flex items-center justify-between gap-2"><p className="font-label-sm text-outline uppercase tracking-wider">Top Category</p>{isApprover && <span aria-hidden="true" className="material-symbols-outlined rounded-md bg-primary/5 p-1 text-[16px] text-primary">category</span>}</div>
          <p className="font-headline-md text-on-surface mt-1 truncate">{topCategory?.[0] || '—'}</p>
          <p className="text-[12px] text-outline mt-1">{topCategory ? formatMoney(topCategory[1]) : 'No supported spend'}</p>
        </Card>
      </div>

      <div className="space-y-0">
      {isApprover && <div className="flex gap-1 px-2" role="tablist" aria-label="Expense scope">
        {(['team', 'mine'] as const).map(value => <button key={value} type="button" role="tab" aria-selected={scope === value} onClick={() => setScope(value)} className={`flex items-center gap-2 rounded-t-lg border-t-2 px-5 py-3 text-xs font-semibold ${scope === value ? 'border-primary bg-white text-primary' : 'border-transparent bg-primary/5 text-on-surface-variant'}`}>
          <span aria-hidden="true" className="material-symbols-outlined text-[16px]">{value === 'mine' ? 'person' : 'groups'}</span>
          {value === 'mine' ? 'My Expenses' : 'Team Expenses'}
          <span className="rounded-full bg-primary/5 px-2 py-0.5 text-[10px]">{derivedReceipts.filter(receipt => value === 'mine' ? receipt.requestorId === currentUser.id : Boolean(receipt.requestorId && reporteeIds.has(receipt.requestorId) && receipt.claimStatus !== ClaimStatus.DRAFT)).length}</span>
        </button>)}
      </div>}
      <FilterBar
        className={isApprover ? "receipt-toolbar rounded-b-none bg-white" : "rounded-b-none bg-white"}
        searchValue={searchTerm}
        onSearchChange={setSearchTerm}
        searchPlaceholder="Search vendor, purpose, OR number, or claim..."
        searchClassName={compactToolbar ? 'sm:min-w-40 sm:basis-48' : undefined}
        searchEnd={<>
          {groupControl}
        </>}
        popoverDescription="Narrow expenses using claim and purchase details."
        quickFilters={compactToolbar ? [] : receiptQuickFilters}
        popoverExtra={
          <>
            {compactToolbar && <div className="mb-5"><Label>Sort expenses</Label>
          <Select
            aria-label="Sort expenses"
            className="w-full"
            value={sortBy}
            onChange={e => setSortBy(e.target.value as typeof sortBy)}
          >
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="highest">Highest amount</option>
            <option value="lowest">Lowest amount</option>
            <option value="missing">Missing receipts first</option>
          </Select>
            </div>}
          <div className="mb-5">
            <p className="text-[11px] font-bold uppercase tracking-wider text-outline mb-2">Quick views</p>
            <div className="flex flex-wrap gap-2">
              <button className="px-3 py-1.5 rounded-full border border-outline-variant text-xs font-semibold hover:border-primary hover:text-primary" onClick={() => setReceiptStatus('missing')}>Missing receipts</button>
              <button className="px-3 py-1.5 rounded-full border border-outline-variant text-xs font-semibold hover:border-primary hover:text-primary" onClick={applyThisMonth}>This month</button>
              <button className="px-3 py-1.5 rounded-full border border-outline-variant text-xs font-semibold hover:border-primary hover:text-primary" onClick={() => setClaimStatusFilter(isFinance ? ClaimStatus.PROCESSING : ClaimStatus.PENDING_APPROVAL)}>{isFinance ? 'In processing' : 'Pending claims'}</button>
              <button className="px-3 py-1.5 rounded-full border border-outline-variant text-xs font-semibold hover:border-primary hover:text-primary" onClick={() => setAmountMin('1000')}>High-value expenses</button>
            </div>
          </div>
          </>
        }
        advancedFilters={[
          ...(compactToolbar ? receiptQuickFilters : []),
          {
            type: 'select', key: 'claimStatus', label: 'Claim status', placeholder: 'All Statuses',
            value: claimStatusFilter, onChange: setClaimStatusFilter,
            options: (isFinance ? FINANCE_VISIBLE_STATUSES : Object.values(ClaimStatus)).map(s => ({ value: s, label: s })),
          },
          {
            type: 'select', key: 'claimType', label: 'Claim type', placeholder: 'All Types',
            value: claimTypeFilter, onChange: setClaimTypeFilter,
            options: ['Reimbursement', 'Transport Reimbursement', 'Cash Advance', 'Liquidation'].map(t => ({ value: t, label: t })),
          },
          {
            type: 'select', key: 'client', label: 'Client', placeholder: 'All Clients',
            value: clientFilter, onChange: setClientFilter,
            options: clientOptions.map(c => ({ value: c, label: c })),
          },
          ...((isFinance || (isApprover && scope === 'team')) ? [{
            type: 'select' as const, key: 'member', label: isFinance ? 'Requestor' : 'Team member',
            placeholder: isFinance ? 'All Requestors' : 'All Team Members',
            value: selectedMember, onChange: setSelectedMember,
            options: availableMembers.map(m => ({ value: m.id, label: m.name })),
          }] : []),
          {
            type: 'dateRange', key: 'purchased', label: 'Purchased',
            fromValue: dateFrom, toValue: dateTo, onFromChange: setDateFrom, onToChange: setDateTo,
          },
          {
            type: 'numberRange', key: 'amount', label: 'Amount',
            minValue: amountMin, maxValue: amountMax, onMinChange: setAmountMin, onMaxChange: setAmountMax,
            formatValue: v => formatMoney(Number(v)),
          },
        ]}
        extraRight={
          <div className="flex flex-wrap items-center gap-3">

          {!compactToolbar && (
          <Select
            aria-label="Sort expenses"
            className="w-full lg:w-44"
            value={sortBy}
            onChange={e => setSortBy(e.target.value as typeof sortBy)}
          >
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="highest">Highest amount</option>
            <option value="lowest">Lowest amount</option>
            <option value="missing">Missing receipts first</option>
          </Select>
          )}
            {groupBy === 'none' && (
            <div className="flex items-center gap-3">
              <div className="flex rounded-lg border border-outline-variant bg-white p-1" aria-label="Expense view">
                <button
                  type="button"
                  aria-label="Grid view"
                  aria-pressed={viewMode === 'grid'}
                  onClick={() => setViewMode('grid')}
                  className={`w-9 h-8 rounded flex items-center justify-center ${viewMode === 'grid' ? 'bg-primary text-white' : 'text-outline hover:bg-surface-container-high'}`}
                >
                  <span className="material-symbols-outlined text-[18px]">grid_view</span>
                </button>
                <button
                  type="button"
                  aria-label="List view"
                  aria-pressed={viewMode === 'list'}
                  onClick={() => setViewMode('list')}
                  className={`w-9 h-8 rounded flex items-center justify-center ${viewMode === 'list' ? 'bg-primary text-white' : 'text-outline hover:bg-surface-container-high'}`}
                >
                  <span className="material-symbols-outlined text-[18px]">view_list</span>
                </button>
              </div>
              <span className="font-label-sm text-outline whitespace-nowrap">{filteredReceipts.length} records</span>
            </div>
            )}
          </div>
        }
      />

      {filteredReceipts.length === 0 ? (
        isApprover ? <Card className="!mt-[-1px] rounded-t-none bg-white">
          {renderReceiptTable([], showRequestorCol)}
          <Pagination currentPage={currentPage} totalPages={totalPages} onPageChange={setCurrentPage} showPageSelect />
        </Card> : (
        <Card className="!mt-[-1px] rounded-t-none p-12 text-center text-outline">
          <span className="material-symbols-outlined text-[48px] mb-3">folder_open</span>
          <p className="font-headline-sm text-on-surface mb-1">No expenses found</p>
          <p className="text-sm">Expense lines will appear here when they are added to a claim.</p>
          <Pagination currentPage={currentPage} totalPages={totalPages} onPageChange={setCurrentPage} />
        </Card>
        )
      ) : groupBy !== 'none' ? (
        <div className="!mt-[-1px] space-y-5 rounded-b-xl border-x border-b border-outline-variant bg-surface-container-lowest p-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <p className="text-sm text-outline pl-2">
              {receiptGroups.length} {groupBy === 'member' ? (receiptGroups.length === 1 ? 'team member' : 'team members') : (receiptGroups.length === 1 ? 'client' : 'clients')}
              {' · '}{filteredReceipts.length} record{filteredReceipts.length === 1 ? '' : 's'}
            </p>
          </div>
          {receiptGroups.map(group => (
            <div key={group.key} className="overflow-hidden rounded-xl border border-outline-variant bg-white shadow-xs">
              <div className="p-5 border-b border-outline-variant flex items-center justify-between gap-4 bg-surface-container-low/40">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="material-symbols-outlined text-primary text-[22px]">{groupBy === 'member' ? 'person' : 'domain'}</span>
                  <div className="min-w-0">
                    <h2 className="text-[16px] font-bold text-on-surface truncate">{group.label}</h2>
                    <p className="text-sm text-outline mt-0.5">{group.items.length} expense{group.items.length === 1 ? '' : 's'}</p>
                  </div>
                </div>
              </div>
              {renderReceiptTable(group.items, groupBy !== 'member' && showRequestorCol, {
                total: group.total,
                coverage: group.coverage,
                attached: group.attached,
                count: group.items.length,
              })}
            </div>
          ))}
          <Pagination currentPage={currentPage} totalPages={totalPages} onPageChange={setCurrentPage} />
        </div>
      ) : (
        <Card className="!mt-[-1px] overflow-hidden rounded-t-none">
          {viewMode === 'grid' ? renderReceiptGrid(paginatedReceipts, showRequestorCol) : renderReceiptTable(paginatedReceipts, showRequestorCol)}
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            onPageChange={setCurrentPage}
            showPageSelect={isApprover}
          />
        </Card>
      )}
      </div>

      {isApprover && scope === 'team' && (
        <TeamAnalytics
          members={teamMembers}
          claims={claims}
          lineItems={lineItems}
          title="Team Expense Analytics"
          description="Compare reported expenses, reimbursements, and receipt completeness across direct reports."
        />
      )}

      {/* Preview Modal */}
      {selectedReceipt && (
        <Modal isOpen onClose={() => setSelectedReceipt(null)} titleId="receipt-preview-title" className="max-w-2xl">
          <div className="bg-surface-container-lowest rounded-xl w-full p-6 shadow-2xl space-y-4">
            <div className="flex justify-between items-center border-b border-outline-variant pb-3">
              <div>
                <h3 id="receipt-preview-title" className="font-headline-sm text-on-surface">{selectedReceipt.fileName}</h3>
                <p className="text-xs text-outline">{selectedReceipt.vendor} • {selectedReceipt.date}</p>
              </div>
              <button aria-label="Close receipt preview" onClick={() => setSelectedReceipt(null)} className="text-outline hover:text-on-surface">
                <span aria-hidden="true" className="material-symbols-outlined">close</span>
              </button>
            </div>
            <div className="bg-surface-container-low border border-outline-variant rounded-lg p-8 flex flex-col items-center justify-center min-h-[260px]">
              {(() => {
                const url = uploadUrl(selectedReceipt.fileUrl) ?? '';
                if (!url) {
                  return (
                    <div className="text-center space-y-2">
                      <span className="material-symbols-outlined text-[64px] text-tertiary">receipt_long_off</span>
                      <p className="font-bold text-on-surface">No receipt attached</p>
                      <p className="text-xs text-outline">Open the linked claim to review or correct this expense.</p>
                    </div>
                  );
                }
                if (url.startsWith('data:image') || url.startsWith('blob:') || url.match(/\.(jpeg|jpg|gif|png)($|\?)/i)) {
                  return <img src={url} alt="Receipt preview" className="max-h-64 object-contain rounded" />;
                }
                if (url.match(/\.pdf($|\?)/i)) {
                  return <iframe title="Receipt attachment" src={url} className="w-full h-64 rounded border border-outline-variant" />;
                }
                return (
                  <div className="text-center space-y-2">
                    <span className="material-symbols-outlined text-[64px] text-primary">description</span>
                    <p className="font-bold text-on-surface">{selectedReceipt.fileName}</p>
                    <p className="text-xs text-outline">Document attachment linked to {selectedReceipt.claimRef || 'Expenses & Receipts'}</p>
                  </div>
                );
              })()}
            </div>
            <div className="flex justify-between items-center text-sm pt-2">
              <div>
                <span className="text-outline">Category:</span> <span className="font-semibold text-on-surface">{selectedReceipt.category}</span>
                <span className="ml-4 text-outline">Amount:</span> <span className="font-mono-data font-bold text-primary">{formatMoney(selectedReceipt.amount)}</span>
                {selectedReceipt.orNumber && (
                  <span className="ml-4 text-outline">OR:</span>
                )}
                {selectedReceipt.orNumber && <span className="ml-1 font-mono-data text-on-surface">{selectedReceipt.orNumber}</span>}
              </div>
              <div className="flex gap-2">
                {selectedReceipt.claimId && (
                  <Button variant="outline" size="sm" className="gap-1" onClick={() => navigate(`/claims/${selectedReceipt.claimId}`)}>
                    <span className="material-symbols-outlined text-[16px]">description</span> View claim
                  </Button>
                )}
                {selectedReceipt.fileUrl && <a href={uploadUrl(selectedReceipt.fileUrl)} target="_blank" rel="noreferrer" download={selectedReceipt.fileName}>
                  <Button variant="outline" size="sm" className="gap-1">
                    <span className="material-symbols-outlined text-[16px]">download</span> Download
                  </Button>
                </a>}
                <Button size="sm" onClick={() => setSelectedReceipt(null)}>Close</Button>
              </div>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
