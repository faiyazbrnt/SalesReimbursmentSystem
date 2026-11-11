import { useEffect, useRef, useState } from 'react';
import { Button } from '../../../components/ui/Button';
import { Input, Select } from '../../../components/ui/Input';
import { Modal } from '../../../components/shared/Modal';
import { EXPENSE_CATEGORIES } from '../../../lib/expenseCategories';
import type { useDocumentExtraction } from './useDocumentExtraction';
import { EXPENSE_FIELDS, expenseToDraft, suggestionError, validIsoDate, type AppliedSuggestions, type DocumentSuggestions, type ExpenseKey } from './model';

export function DocumentAutofill({ file, extraction, currentValues, onApply }: {
  file: File | null;
  extraction: ReturnType<typeof useDocumentExtraction>;
  currentValues: Record<string, string>;
  onApply: (suggestions: AppliedSuggestions) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const hasAutoOpened = useRef(false);

  // Automatically open the popup modal when suggestions become ready
  useEffect(() => {
    if (file && extraction.status === 'ready' && !hasAutoOpened.current) {
      const hasItems = (extraction.result?.fields.length ?? 0) > 0 || (extraction.result?.expenses.length ?? 0) > 0;
      if (hasItems) {
        setIsOpen(true);
        hasAutoOpened.current = true;
      }
    }
    if (!file) {
      hasAutoOpened.current = false;
      setIsOpen(false);
    }
  }, [file, extraction.status, extraction.result]);

  if (!file) return null;

  return (
    <>
      <div className="flex flex-wrap items-center gap-3 pt-1">
        {extraction.status === 'loading' && (
          <span role="status" className="inline-flex items-center gap-1.5 text-xs text-on-surface-variant font-medium">
            <span aria-hidden="true" className="material-symbols-outlined animate-spin text-[16px] text-primary">sync</span>
            Reading document…
          </span>
        )}
        {extraction.status === 'error' && (
          <div className="inline-flex items-center gap-2">
            <span role="alert" className="text-xs text-error font-medium">{extraction.error}</span>
            <Button type="button" size="sm" variant="ghost" className="h-6 px-2 text-xs text-primary" onClick={extraction.retry}>
              Retry analysis
            </Button>
          </div>
        )}
        {extraction.status === 'applied' && (
          <span role="status" className="inline-flex items-center gap-1 text-xs font-semibold text-primary">
            <span aria-hidden="true" className="material-symbols-outlined text-[16px]">check_circle</span>
            Selected suggestions applied
          </span>
        )}
        {extraction.status === 'ready' && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="gap-1.5 text-xs font-semibold"
            onClick={() => setIsOpen(true)}
          >
            <span aria-hidden="true" className="material-symbols-outlined text-[16px] text-primary">auto_fix_high</span>
            Review autofill suggestions
          </Button>
        )}
      </div>

      <Modal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        titleId="autofill-modal-title"
        className="max-w-3xl max-h-[85vh] flex flex-col bg-white overflow-hidden shadow-2xl"
      >
        <section aria-label="Document autofill" className="flex flex-col h-full overflow-hidden min-h-0">
          <header className="flex shrink-0 items-center justify-between border-b border-outline-variant px-6 py-4 bg-surface-container-low/30">
            <div className="flex items-center gap-3">
              <span aria-hidden="true" className="material-symbols-outlined rounded-lg bg-primary/10 p-2 text-[20px] text-primary">
                auto_fix_high
              </span>
              <div>
                <h3 id="autofill-modal-title" className="text-base font-semibold text-on-surface">
                  Fill from document
                </h3>
                <p className="text-xs text-outline truncate max-w-sm sm:max-w-md">
                  {file.name}
                </p>
              </div>
            </div>
            <button
              type="button"
              aria-label="Close dialog"
              onClick={() => setIsOpen(false)}
              className="rounded-lg p-1.5 text-on-surface-variant hover:bg-surface-container-low focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <span aria-hidden="true" className="material-symbols-outlined text-[20px]">close</span>
            </button>
          </header>

          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4 min-h-0">
            <p className="text-xs text-on-surface-variant">
              Review suggestions extracted from this document. Choose which fields to apply to your form. Existing values will only be replaced if opted into.
            </p>

            {extraction.status === 'loading' && (
              <div className="flex flex-wrap items-center gap-3 rounded-lg border border-outline-variant/60 p-4 bg-surface-container-lowest">
                <span aria-hidden="true" className="material-symbols-outlined animate-spin text-primary text-[20px]">sync</span>
                <p role="status" className="text-sm font-medium">Reading document… You can continue or cancel.</p>
                <Button type="button" size="sm" variant="outline" className="ml-auto" onClick={extraction.cancel}>Cancel analysis</Button>
              </div>
            )}

            {extraction.status === 'error' && (
              <div className="space-y-2 rounded-lg border border-error/30 bg-error/5 p-4">
                <p role="alert" className="text-sm text-error font-medium">{extraction.error}</p>
                <Button type="button" size="sm" variant="outline" onClick={extraction.retry}>Retry analysis</Button>
              </div>
            )}

            {extraction.status === 'ready' && extraction.result && (
              <SuggestionReview
                key={`${file.name}-${file.lastModified}-${extraction.result.fields.length}`}
                result={extraction.result}
                currentValues={currentValues}
                onApply={selection => {
                  onApply(selection);
                  extraction.applied();
                  setIsOpen(false);
                }}
                onClose={() => setIsOpen(false)}
              />
            )}
          </div>
        </section>
      </Modal>
    </>
  );
}

function SuggestionReview({ result, currentValues, onApply, onClose }: {
  result: DocumentSuggestions;
  currentValues: Record<string, string>;
  onApply: (suggestions: AppliedSuggestions) => void;
  onClose: () => void;
}) {
  const [fields, setFields] = useState(() => result.fields.map(field => ({ ...field, selected: !currentValues[field.key]?.trim() && !suggestionError(field, field.value) })));
  const [expenses, setExpenses] = useState(() => result.expenses.map(expense => ({ ...expense, selected: true })));
  const previousValues = useRef(currentValues);
  // If the user types while results are open, replacement must be opted into again.
  useEffect(() => {
    const changed = Object.keys(currentValues).filter(key => currentValues[key] !== previousValues.current[key] && currentValues[key]?.trim());
    if (changed.length) {
      setFields(items => items.map(item => changed.includes(item.key) ? { ...item, selected: false } : item));
    }
    previousValues.current = currentValues;
  }, [currentValues]);
  const selectedCount = fields.filter(field => field.selected).length + expenses.filter(expense => expense.selected).length;
  const expenseError = (values: typeof expenses[number]['values']) =>
    Boolean(values.amount && (!Number.isFinite(Number(values.amount)) || Number(values.amount) <= 0))
    || Boolean(values.expenseDate && !validIsoDate(values.expenseDate));
  const invalid = fields.some(field => field.selected && suggestionError(field, field.value)) || expenses.some(expense => expense.selected && expenseError(expense.values));

  return <div className="space-y-5">
    {result.warnings.length > 0 && <ul className="list-disc pl-5 text-sm space-y-1">{result.warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul>}
    {!fields.length && !expenses.length && <p role="status" className="text-sm text-outline">No usable details found. Use the official MOM/LOA template or enter the details manually.</p>}
    {fields.map((field, index) => {
      const error = suggestionError(field, field.value);
      const fieldId = `extracted-${index}`;
      const update = (value: string) => setFields(items => items.map((item, i) => i === index ? { ...item, value } : item));
      return <div key={field.key} className="space-y-2 border-t border-outline-variant pt-4 min-w-0">
        <label className="flex items-center gap-3 min-h-11 font-semibold text-sm cursor-pointer"><input type="checkbox" className="h-4 w-4 accent-primary" checked={field.selected} onChange={event => setFields(items => items.map((item, i) => i === index ? { ...item, selected: event.target.checked } : item))} />Apply {field.label}</label>
        {currentValues[field.key]?.trim() && <p className="text-xs break-words text-on-surface-variant">Current value: <span className="font-medium text-on-surface">{currentValues[field.key]}</span>. Select the checkbox to replace it.</p>}
        <label htmlFor={fieldId} className="sr-only">Suggested {field.label}</label>
        {field.options ? <Select id={fieldId} value={field.options.includes(field.value) ? field.value : ''} onChange={event => update(event.target.value)} aria-describedby={`${fieldId}-source`}>
          <option value="">Select a recognized option</option>{field.options.map(option => <option key={option} value={option}>{option}</option>)}
        </Select> : <Input id={fieldId} type={field.inputType === 'date' ? 'date' : field.inputType === 'number' ? 'number' : 'text'} value={field.value} onChange={event => update(event.target.value)} aria-describedby={`${fieldId}-source`} />}
        <p id={`${fieldId}-source`} className="text-xs text-on-surface-variant break-words">Found: {field.evidence || field.value}</p>
        {error && <p className="text-xs text-error">{error}</p>}
      </div>;
    })}
    {expenses.length > 0 && <p className="text-sm font-semibold pt-2">Expense suggestions — review amounts and attach receipts in the expense step.</p>}
    {expenses.map((expense, index) => <div key={index} className="border-t border-outline-variant pt-4 space-y-3 min-w-0">
      <label className="flex items-center gap-3 min-h-11 font-semibold text-sm cursor-pointer"><input type="checkbox" className="h-4 w-4 accent-primary" checked={expense.selected} onChange={event => setExpenses(items => items.map((item, i) => i === index ? { ...item, selected: event.target.checked } : item))} />Add expense {index + 1}</label>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">{EXPENSE_FIELDS.map(([key, label]) => {
        const id = `extracted-expense-${index}-${key}`;
        const options = key === 'category' ? EXPENSE_CATEGORIES : key === 'paymentMethod' ? ['Personal Card', 'Cash', 'Bank Transfer'] : null;
        const update = (value: string) => setExpenses(items => items.map((item, i) => i === index ? { ...item, values: { ...item.values, [key]: value } } : item));
        return <div key={key}><label htmlFor={id} className="block text-xs font-semibold mb-1">{label}</label>{options ? <Select id={id} value={expense.values[key] || ''} onChange={event => update(event.target.value)}><option value="">Confirm manually</option>{options.map(option => <option key={option}>{option}</option>)}</Select>
          : <Input id={id} type={key === 'amount' ? 'number' : key === 'expenseDate' ? 'date' : 'text'} step={key === 'amount' ? '0.01' : undefined} value={expense.values[key as ExpenseKey] || ''} onChange={event => update(event.target.value)} />}</div>;
      })}</div>
      <p className="text-xs text-on-surface-variant break-words">Found: {expense.evidence}</p>
      {expense.warnings.map((warning, i) => <p key={i} className="text-xs">{warning}</p>)}
      {expenseError(expense.values) && <p className="text-xs text-error">Check the amount and date, or leave them blank for manual entry.</p>}
    </div>)}

    <footer className="sticky bottom-0 -mx-6 -mb-4 mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-outline-variant bg-white px-6 py-3 shadow-md">
      <div className="text-xs text-on-surface-variant font-medium">
        {selectedCount > 0 ? `${selectedCount} item${selectedCount === 1 ? '' : 's'} selected` : 'Select details to apply'}
      </div>
      <div className="flex items-center gap-2">
        <Button type="button" variant="outline" size="sm" onClick={onClose}>
          Cancel
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={selectedCount === 0 || invalid}
          onClick={() => onApply({
            values: Object.fromEntries(fields.filter(field => field.selected).map(field => [field.key, field.value])),
            expenses: expenses.filter(expense => expense.selected).map(expense => expenseToDraft(expense.values)),
          })}
        >
          Apply selected suggestions
        </Button>
      </div>
    </footer>
  </div>;
}
