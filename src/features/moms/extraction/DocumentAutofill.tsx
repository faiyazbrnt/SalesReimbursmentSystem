import { useEffect, useRef, useState } from 'react';
import { Button } from '../../../components/ui/Button';
import { Input, Select } from '../../../components/ui/Input';
import { EXPENSE_CATEGORIES } from '../../../lib/expenseCategories';
import type { useDocumentExtraction } from './useDocumentExtraction';
import { EXPENSE_FIELDS, expenseToDraft, suggestionError, validIsoDate, type AppliedSuggestions, type DocumentSuggestions, type ExpenseKey } from './model';

export function DocumentAutofill({ file, extraction, currentValues, onApply }: {
  file: File | null;
  extraction: ReturnType<typeof useDocumentExtraction>;
  currentValues: Record<string, string>;
  onApply: (suggestions: AppliedSuggestions) => void;
}) {
  return <section aria-label="Document autofill" className="space-y-3 rounded-input border border-outline-variant p-4">
    <h5 className="font-semibold text-on-surface">Fill from document</h5>
    {extraction.available === null ? <p role="status" className="text-sm text-on-surface-variant">Checking document autofill availability…</p>
      : !extraction.available ? <p className="text-sm text-on-surface-variant">Document autofill is unavailable until Azure OpenAI is configured. Attach your file and enter the details manually.</p>
      : <>
        <p className="text-sm text-on-surface-variant">Selecting a MOM or LOA sends it to your company’s Azure OpenAI service for analysis. Review suggestions before applying them. Your form is saved only when you save or submit.</p>
        {!file && <p className="text-sm">Choose an attachment above to start.</p>}
        {extraction.status === 'loading' && <div className="flex flex-wrap items-center gap-3"><p role="status" className="text-sm">Reading document… You can continue entering details.</p><Button type="button" size="sm" variant="outline" onClick={extraction.cancel}>Cancel analysis</Button></div>}
        {extraction.status === 'error' && <div className="space-y-2"><p role="alert" className="text-sm text-error">{extraction.error}</p>{file && !/\.doc$/i.test(file.name) && <Button type="button" size="sm" variant="outline" onClick={extraction.retry}>Retry analysis</Button>}</div>}
        {extraction.status === 'applied' && <p role="status" className="text-sm font-semibold text-primary">Selected suggestions applied. Review the form before saving.</p>}
        {extraction.status === 'ready' && extraction.result && <SuggestionReview key={`${file?.name}-${file?.lastModified}-${extraction.result.fields.length}`} result={extraction.result} currentValues={currentValues} onApply={selection => { onApply(selection); extraction.applied(); }} />}
      </>}
  </section>;
}

function SuggestionReview({ result, currentValues, onApply }: {
  result: DocumentSuggestions; currentValues: Record<string, string>; onApply: (suggestions: AppliedSuggestions) => void;
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
    {!fields.length && !expenses.length && <p role="status" className="text-sm">No usable details found. Try a clearer document or enter the details manually.</p>}
    {fields.map((field, index) => {
      const error = suggestionError(field, field.value);
      const fieldId = `extracted-${index}`;
      const update = (value: string) => setFields(items => items.map((item, i) => i === index ? { ...item, value } : item));
      return <div key={field.key} className="space-y-2 border-t border-outline-variant pt-4 min-w-0">
        <label className="flex items-center gap-3 min-h-11 font-semibold text-sm"><input type="checkbox" className="h-4 w-4 accent-primary" checked={field.selected} onChange={event => setFields(items => items.map((item, i) => i === index ? { ...item, selected: event.target.checked } : item))} />Apply {field.label}</label>
        {currentValues[field.key]?.trim() && <p className="text-xs break-words">Current value: {currentValues[field.key]}. Select the checkbox to replace it.</p>}
        <label htmlFor={fieldId} className="sr-only">Suggested {field.label}</label>
        {field.options ? <Select id={fieldId} value={field.options.includes(field.value) ? field.value : ''} onChange={event => update(event.target.value)} aria-describedby={`${fieldId}-source`}>
          <option value="">Select a recognized option</option>{field.options.map(option => <option key={option} value={option}>{option}</option>)}
        </Select> : <Input id={fieldId} type={field.inputType === 'date' ? 'date' : field.inputType === 'number' ? 'number' : 'text'} value={field.value} onChange={event => update(event.target.value)} aria-describedby={`${fieldId}-source`} />}
        <p id={`${fieldId}-source`} className="text-xs text-on-surface-variant break-words">Found: {field.evidence || field.value}</p>
        {error && <p className="text-xs text-error">{error}</p>}
      </div>;
    })}
    {expenses.length > 0 && <p className="text-sm font-semibold">Expense suggestions — review amounts and attach receipts in the expense step.</p>}
    {expenses.map((expense, index) => <div key={index} className="border-t border-outline-variant pt-4 space-y-3 min-w-0">
      <label className="flex items-center gap-3 min-h-11 font-semibold text-sm"><input type="checkbox" className="h-4 w-4 accent-primary" checked={expense.selected} onChange={event => setExpenses(items => items.map((item, i) => i === index ? { ...item, selected: event.target.checked } : item))} />Add expense {index + 1}</label>
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
    {selectedCount > 0 && <Button type="button" disabled={invalid} onClick={() => onApply({ values: Object.fromEntries(fields.filter(field => field.selected).map(field => [field.key, field.value])), expenses: expenses.filter(expense => expense.selected).map(expense => expenseToDraft(expense.values)) })}>Apply selected suggestions</Button>}
    {selectedCount === 0 && (fields.length > 0 || expenses.length > 0) && <p className="text-sm">Select the details you want to apply.</p>}
  </div>;
}
