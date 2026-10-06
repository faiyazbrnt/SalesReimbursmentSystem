import { Button } from './Button';

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  className?: string;
  showPageSelect?: boolean;
}

export function Pagination({ currentPage, totalPages, onPageChange, className = '', showPageSelect = false }: PaginationProps) {
  const displayedPage = totalPages === 0 ? 0 : currentPage;

  return (
    <div className={`flex flex-wrap items-center justify-end gap-3 px-6 py-4 border-t border-outline-variant bg-surface-container-lowest ${className}`}>
      <div className="text-body-sm text-outline">
        Showing page <span className="font-medium text-brand-slate">{displayedPage}</span> of <span className="font-medium text-brand-slate">{totalPages}</span>
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
