import { useState, useRef, useEffect } from 'react';
import { Button } from '../ui/Button';
import { useToast } from './ToastContext';

interface ExportDropdownProps {
  onExportCsv?: () => void;
  onExportPdf?: () => void;
  onExportWord?: () => void;
  onExportExcel?: () => void;
  disabled?: boolean;
}

export function ExportDropdown({ onExportCsv, onExportPdf, onExportWord, onExportExcel, disabled }: ExportDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const { addToast } = useToast();

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleExport = (type: 'CSV' | 'PDF' | 'Word' | 'Excel', handler?: () => void) => {
    setIsOpen(false);
    if (handler) {
      handler();
    } else {
      addToast(`${type} export is not fully implemented yet.`, 'info');
    }
  };

  return (
    <div className="relative" ref={menuRef}>
      <Button
        variant="outline"
        className="gap-2 shrink-0 bg-white"
        onClick={() => setIsOpen(!isOpen)}
        disabled={disabled}
      >
        <span className="material-symbols-outlined text-[18px]">download</span>
        Export
        <span className="material-symbols-outlined text-[18px]">{isOpen ? 'expand_less' : 'expand_more'}</span>
      </Button>
      {isOpen && (
        <div className="absolute right-0 mt-2 w-48 bg-white border border-outline-variant rounded-xl shadow-glass z-50 py-1 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
          <button 
            type="button"
            className="w-full text-left px-4 py-2.5 text-sm text-on-surface hover:bg-surface-container-low transition-colors flex items-center gap-3 font-medium"
            onClick={() => handleExport('CSV', onExportCsv)}
          >
            <span className="material-symbols-outlined text-[20px] text-primary">csv</span>
            Export as CSV
          </button>
          <button 
            type="button"
            className="w-full text-left px-4 py-2.5 text-sm text-on-surface hover:bg-surface-container-low transition-colors flex items-center gap-3 font-medium"
            onClick={() => handleExport('PDF', onExportPdf)}
          >
            <span className="material-symbols-outlined text-[20px] text-error">picture_as_pdf</span>
            Export as PDF
          </button>
          <button 
            type="button"
            className="w-full text-left px-4 py-2.5 text-sm text-on-surface hover:bg-surface-container-low transition-colors flex items-center gap-3 font-medium"
            onClick={() => handleExport('Word', onExportWord)}
          >
            <span className="material-symbols-outlined text-[20px] text-blue-600">description</span>
            Export as Word
          </button>
          <button 
            type="button"
            className="w-full text-left px-4 py-2.5 text-sm text-on-surface hover:bg-surface-container-low transition-colors flex items-center gap-3 font-medium"
            onClick={() => handleExport('Excel', onExportExcel)}
          >
            <span className="material-symbols-outlined text-[20px] text-success">table</span>
            Export as Excel
          </button>
        </div>
      )}
    </div>
  );
}
