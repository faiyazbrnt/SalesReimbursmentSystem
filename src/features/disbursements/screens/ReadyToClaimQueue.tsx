import { RecordCount } from '../../../components/shared/RecordCount';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { Input, Select } from '../../../components/ui/Input';
import { StatusBadge } from '../../../components/ui/StatusBadge';
import { Pagination } from '../../../components/ui/Pagination';
import { ClaimStatus } from '../../../types';
import { formatMoney } from '../../../lib/money';
import { useAppContext } from '../../../components/AppContext';

const ITEMS_PER_PAGE = 8;

export function ReadyToClaimQueue() {
  const navigate = useNavigate();
  const { claims, users } = useAppContext();
  const [currentPage, setCurrentPage] = useState(1);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  const readyClaims = claims.filter(c => c.status === ClaimStatus.READY_FOR_CLAIM);
  const claimTypes = useMemo(() => Array.from(new Set(readyClaims.map(claim => claim.type))).sort(), [readyClaims]);
  const departments = useMemo(
    () => Array.from(new Set(readyClaims
      .map(claim => users.find(user => user.id === claim.requestorId)?.department)
      .filter((value): value is string => Boolean(value)))).sort(),
    [readyClaims, users]
  );
  const filteredReadyClaims = useMemo(() => {
    const query = search.trim().toLowerCase();
    return readyClaims.filter(claim => {
      const requestor = users.find(user => user.id === claim.requestorId);
      const matchesSearch = !query || [claim.ref, claim.type, claim.client, requestor?.name, claim.releaseCode]
        .some(value => value?.toLowerCase().includes(query));
      return matchesSearch && (!typeFilter || claim.type === typeFilter) && (!departmentFilter || requestor?.department === departmentFilter);
    });
  }, [departmentFilter, readyClaims, search, typeFilter, users]);
  const hasFilters = Boolean(typeFilter || departmentFilter);
  const totalPages = Math.ceil(filteredReadyClaims.length / ITEMS_PER_PAGE);
  const paginatedClaims = filteredReadyClaims.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

  useEffect(() => {
    setCurrentPage(1);
  }, [search, typeFilter, departmentFilter]);

  const clearFilters = () => {
    setSearch('');
    setTypeFilter('');
    setDepartmentFilter('');
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex justify-between items-center">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-display text-display text-on-surface">Ready to Claim</h1>
            <span className="text-[12px] font-bold uppercase tracking-wider text-outline bg-surface-container-high px-2 py-0.5 rounded-full">Read-only</span>
          </div>
          <p className="text-body-md text-outline mt-1">Prepped claims awaiting the requestor to confirm receipt with their release code.</p>
        </div>
      </div>

      <Card className="border-primary/20 bg-primary-fixed/10">
        <div className="p-4 flex items-start gap-3">
          <span className="material-symbols-outlined text-primary text-[22px]">key</span>
          <p className="text-body-sm text-on-surface-variant">
            Share each release code with its requestor. The claim completes only when
            <span className="font-semibold text-on-surface"> they </span>
            confirm receipt by entering the code — the custodian cannot finalize payout.
          </p>
        </div>
      </Card>

      <Card className="bg-white">
        <div className="border-b border-outline-variant bg-white p-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center">
            <div className="relative min-w-0 flex-1">
              <Input type="search"
                className="pl-10"
                value={search}
                onChange={event => setSearch(event.target.value)}
                placeholder="Search reference, requestor, release code, or type..."
                aria-label="Search ready to claim queue"
              />
            </div>
            <Button
              variant="outline"
              className="gap-2 md:flex-none"
              onClick={() => setShowFilters(open => !open)}
              aria-expanded={showFilters}
            >
              <span className="material-symbols-outlined text-[18px]">filter_list</span>
              Filters{hasFilters ? ' (active)' : ''}
            </Button>
            {(search || hasFilters) && <button className="text-xs font-semibold text-primary hover:underline md:flex-none" onClick={clearFilters}>Clear all</button>}
            <RecordCount count={filteredReadyClaims.length} className="md:ml-auto" />
          </div>
          {showFilters && (
            <div className="mt-4 grid grid-cols-1 gap-3 border-t border-outline-variant pt-4 sm:grid-cols-2">
              <Select value={typeFilter} onChange={event => setTypeFilter(event.target.value)} aria-label="Filter ready to claim queue by type">
                <option value="">All types</option>
                {claimTypes.map(type => <option key={type} value={type}>{type}</option>)}
              </Select>
              <Select value={departmentFilter} onChange={event => setDepartmentFilter(event.target.value)} aria-label="Filter ready to claim queue by department">
                <option value="">All departments</option>
                {departments.map(department => <option key={department} value={department}>{department}</option>)}
              </Select>
            </div>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-slate-100 text-slate-600 font-label-sm uppercase font-semibold tracking-wider border-b border-outline-variant">
              <tr>
                <th className="px-6 py-4">Requestor</th>
                <th className="px-6 py-4">Ref & Type</th>
                <th className="px-6 py-4">Amount</th>
                <th className="px-6 py-4">Release Code</th>
                <th className="px-6 py-4 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-outline-variant">
              {filteredReadyClaims.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-outline">
                    <span className="material-symbols-outlined text-4xl mb-2 opacity-50">task_alt</span>
                    <p className="font-label-md">{readyClaims.length === 0 ? 'Queue is empty!' : 'No claims match these filters.'}</p>
                  </td>
                </tr>
              ) : paginatedClaims.map(claim => {
                const req = users.find(u => u.id === claim.requestorId) || users[0];
                return (
                  <tr role="button" tabIndex={0} onKeyDown={event => { if (event.target === event.currentTarget && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); event.currentTarget.click(); } }}  key={claim.id} className="hover:bg-slate-50 transition-colors cursor-pointer bg-white" onClick={() => navigate(`/claims/${claim.id}`)}>
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
                      <p className="font-label-md text-on-surface">{claim.ref}</p>
                      <div className="flex items-center text-outline font-body-sm mt-0.5">
                        <span className="material-symbols-outlined text-[14px] mr-1">receipt_long</span>
                        {claim.type}
                      </div>
                    </td>
                    <td className="px-6 py-4 font-mono-data text-on-surface font-bold">{formatMoney(claim.total)}</td>
                    <td className="px-6 py-4">
                      {claim.releaseCode ? (
                        <span className="font-mono-data text-sm bg-surface-container-high px-2.5 py-1 rounded tracking-widest text-on-surface">{claim.releaseCode}</span>
                      ) : (
                        <span className="text-outline text-sm">—</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-center">
                      <StatusBadge status={claim.status} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={setCurrentPage}
        />
      </Card>
    </div>
  );
}
