import { useMemo, useRef, useState } from 'react';
import { Input } from '../../../components/ui/Input';
import { Company } from '../../../types';
import { findExactMatch, findSimilarCompanies } from '../../../lib/companyMatch';
import { useToast } from '../../../components/shared/ToastContext';

export interface CompanyPickerProps {
  id?: string;
  value: string;
  companies: Company[];
  onSelectExisting: (company: Company) => void;
  onChangeText: (name: string) => void;
  /** Called after a new company name is confirmed so the parent can refresh its list. */
  onAddNew?: (name: string) => void;
  placeholder?: string;
}

export function CompanyPicker({ id, value, companies, onSelectExisting, onChangeText, onAddNew, placeholder }: CompanyPickerProps) {
  const [focused, setFocused] = useState(false);
  const [localAdded, setLocalAdded] = useState<Company[]>([]);
  const blurTimeout = useRef<number | null>(null);
  const { addToast } = useToast();

  const trimmed = value.trim();

  // Merge server list with locally-added companies so they appear immediately.
  const allCompanies = useMemo(() => {
    const ids = new Set(companies.map(c => c.id));
    return [...companies, ...localAdded.filter(c => !ids.has(c.id))];
  }, [companies, localAdded]);

  const filteredList = useMemo(() => {
    if (!trimmed) return allCompanies.slice(0, 8);
    const fuzzy = findSimilarCompanies(trimmed, allCompanies);
    if (fuzzy.length > 0) return fuzzy.map(m => m.company);
    const norm = trimmed.toLowerCase();
    return allCompanies.filter(c => c.name.toLowerCase().includes(norm)).slice(0, 6);
  }, [trimmed, allCompanies]);

  const exactMatch = useMemo(() => findExactMatch(trimmed, allCompanies), [trimmed, allCompanies]);
  // Show "Add new" only when typed text has no close match in either list
  const showAddNew = focused && trimmed.length >= 2 && !exactMatch;
  // Show dropdown whenever focused — if there are companies or a new-name option
  const showDropdown = focused && (filteredList.length > 0 || showAddNew);

  const clearBlur = () => {
    if (blurTimeout.current) {
      window.clearTimeout(blurTimeout.current);
      blurTimeout.current = null;
    }
  };

  // Selecting an existing company: always fill the text field directly (guards
  // against parent callbacks that bail out for locally-added entries) AND call
  // the parent's onSelectExisting so it can prefill related fields.
  const select = (company: Company) => {
    clearBlur();
    onChangeText(company.name);   // ← always fills the input immediately
    onSelectExisting(company);    // ← parent may also prefill location/contact
    setFocused(false);
  };

  const selectNew = () => {
    clearBlur();
    const newCompany: Company = { id: `local-${Date.now()}`, name: trimmed };
    setLocalAdded(prev => [...prev, newCompany]);
    onChangeText(trimmed);
    onAddNew?.(trimmed);
    addToast(`"${trimmed}" added as a new company.`, 'success');
    setFocused(false);
  };

  const isLocallyAdded = (company: Company) => localAdded.some(c => c.id === company.id);

  return (
    <div className="relative">
      <Input
        id={id}
        value={value}
        placeholder={placeholder || 'Type or select a company...'}
        onChange={e => onChangeText(e.target.value)}
        onFocus={() => {
          clearBlur();
          setFocused(true);
        }}
        onBlur={() => {
          // 200ms gives mousedown on dropdown items time to fire first
          blurTimeout.current = window.setTimeout(() => setFocused(false), 200);
        }}
        role="combobox"
        aria-expanded={showDropdown}
        aria-autocomplete="list"
        autoComplete="off"
      />
      {showDropdown && (
        <div
          className="absolute z-20 mt-1 w-full rounded-input border border-outline-variant bg-white shadow-lg overflow-hidden"
          // Prevent the wrapper itself from stealing focus / triggering blur
          onMouseDown={e => e.preventDefault()}
        >
          {filteredList.length > 0 && (
            <div>
              {!trimmed && (
                <p className="px-4 pt-2.5 pb-1 text-[11px] font-bold uppercase tracking-wider text-outline">
                  Past companies
                </p>
              )}
              {filteredList.map(company => (
                <button
                  key={company.id}
                  type="button"
                  onClick={() => select(company)}
                  className="w-full text-left px-4 py-2.5 hover:bg-primary/5 flex items-center gap-2"
                >
                  <span className="material-symbols-outlined text-[18px] text-outline">domain</span>
                  <span className="flex-1 text-body-sm text-on-surface">{company.name}</span>
                  {isLocallyAdded(company) && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-success/10 text-success px-2 py-0.5 text-[11px] font-semibold">
                      <span className="material-symbols-outlined text-[13px]">check_circle</span>
                      Added
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
          {showAddNew && (
            <button
              type="button"
              onClick={() => selectNew()}
              className={`w-full text-left px-4 py-2.5 flex items-center gap-2 hover:bg-primary/5 ${filteredList.length > 0 ? 'border-t border-outline-variant' : ''}`}
            >
              <span className="material-symbols-outlined text-[18px] text-primary">add_circle</span>
              <span className="text-body-sm">
                Add <span className="font-semibold text-on-surface">"{trimmed}"</span> as a new company
              </span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
