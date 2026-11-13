import { Button } from './Button';

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  className?: string;
  showPageSelect?: boolean;
}

export function Pagination({ currentPage, totalPages, onPageChange, className = '', showPageSelect = true }: PaginationProps) {
  const displayedPage = totalPages === 0 ? 0 : currentPage;

  return (
    <div data-pagination="" className={`flex flex-wrap items-center justify-end gap-3 px-6 py-4 border-t border-brand-border bg-surface-container-lowest ${className}`}>
      <div className="flex items-center gap-2 text-body-sm text-brand-slate">
        <span>Page</span>
        {showPageSelect ? (
          <select
            aria-label="Page"
            className="h-8 min-w-14 rounded-btn border border-outline-variant/40 bg-surface-container-lowest/50 px-3 py-1 text-sm font-label-md text-on-surface outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:opacity-50"
            value={displayedPage}
            disabled={totalPages <= 1}
            onChange={event => onPageChange(Number(event.target.value))}
          >
            {totalPages === 0 && <option value={0}>0</option>}
            {Array.from({ length: totalPages }, (_, index) => (
              <option key={index + 1} value={index + 1}>{index + 1}</option>
            ))}
          </select>
        ) : <span className="font-medium">{displayedPage}</span>}
        <span>of <span className="font-medium text-brand-slate">{totalPages}</span></span>
      </div>
      <div className="flex items-center gap-2">
        <Button 
          variant="outline" 
          className="px-3 py-1 text-sm h-8"
          disabled={currentPage <= 1 || totalPages === 0}
          onClick={() => onPageChange(currentPage - 1)}
        >
          Previous
        </Button>
        <Button 
          variant="outline" 
          className="px-3 py-1 text-sm h-8"
          disabled={currentPage >= totalPages}
          onClick={() => onPageChange(currentPage + 1)}
        >
          Next
        </Button>
      </div>
    </div>
  );
}
