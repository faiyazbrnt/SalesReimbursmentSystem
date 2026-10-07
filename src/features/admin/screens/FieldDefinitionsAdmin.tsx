import { useState, useEffect } from 'react';
import { Card } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { useAppContext } from '../../../components/AppContext';
import { useToast } from '../../../components/shared/ToastContext';
import { Modal } from '../../../components/shared/Modal';
import { createFieldDefinition, updateFieldDefinition } from '../../../lib/api';
import { FieldDefinition, FIELD_ENTITIES, FieldDefinitionEntity, ClaimType } from '../../../types';
import { Pagination } from '../../../components/ui/Pagination';

const ITEMS_PER_PAGE = 8;



function slugifyKey(label: string): string {
  return label
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s_]/g, '')
    .replace(/\s+/g, '_');
}

function generateUniqueKey(label: string, existingKeys: string[]): string {
  const base = slugifyKey(label) || `field_${Date.now()}`;
  let key = base;
  let i = 2;
  while (existingKeys.includes(key)) {
    key = `${base}_${i}`;
    i++;
  }
  return key;
}

const CLAIM_TYPES: ClaimType[] = ['Reimbursement', 'Transport Reimbursement', 'Cash Advance', 'Liquidation'];

/**
 * Add / rename / remove the choices for a dropdown field. Bound directly to
 * `editForm.options`; the same list is what DynamicFieldRenderer offers in
 * every form the field appears in (e.g. the MoM Category dropdown shows up in
 * both the standalone MoM form and the MoM step inside Submit Claim), so a
 * change here propagates everywhere with no code change. Removing an option
 * only stops it being offered in new entries — records that already stored the
 * old value keep displaying it.
 */
function OptionsEditor({ editForm, setEditForm }: { editForm: Partial<FieldDefinition>; setEditForm: any }) {
  const [draft, setDraft] = useState('');
  const list = editForm.options || [];
  const setList = (next: string[]) => setEditForm((p: any) => ({ ...p, options: next }));

  // A field that pulls from a Master Data catalog gets its choices from there,
  // not from this list — point the admin at the right screen instead.
  if (editForm.master_data_entity) {
    return (
      <p className="mt-2 pt-2 border-t border-outline-variant text-[12px] text-tertiary">
        Choices come from the <strong>{editForm.master_data_entity}</strong> catalog — edit them under Master Data.
      </p>
    );
  }

  const add = () => {
    const value = draft.trim();
    if (!value) return;
    if (list.some(o => o.toLowerCase() === value.toLowerCase())) { setDraft(''); return; }
    setList([...list, value]);
    setDraft('');
  };

  return (
    <div className="mt-2 pt-2 border-t border-outline-variant">
      <p className="text-xs font-semibold text-outline mb-1">Dropdown options</p>
      <div className="flex flex-col gap-1">
        {list.map((opt, i) => (
          <div key={i} className="flex items-center gap-1">
            <Input
              value={opt}
              aria-label={`Option ${i + 1}`}
              onChange={e => setList(list.map((o, idx) => (idx === i ? e.target.value : o)))}
              className="text-xs py-1"
            />
            <button
              type="button"
              aria-label={`Remove ${opt}`}
              title="Remove option"
              onClick={() => setList(list.filter((_, idx) => idx !== i))}
              className="text-outline hover:text-error shrink-0"
            >
              <span className="material-symbols-outlined text-[18px]">close</span>
            </button>
          </div>
        ))}
        {list.length === 0 && <p className="text-[11px] text-outline italic">No options yet — add at least one.</p>}
      </div>
      <div className="flex items-center gap-1 mt-1.5">
        <Input
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
          placeholder="Add option…"
          className="text-xs py-1"
        />
        <button type="button" onClick={add} className="text-primary hover:underline text-xs font-semibold shrink-0 px-1">Add</button>
      </div>
    </div>
  );
}

function ClaimTypeCheckboxes({ editForm, setEditForm }: { editForm: Partial<FieldDefinition>, setEditForm: any }) {
  const toggleType = (type: ClaimType) => {
    setEditForm((prev: any) => {
      const current = prev.applicableClaimTypes || [];
      if (current.includes(type)) {
        return { ...prev, applicableClaimTypes: current.filter((t: string) => t !== type) };
      } else {
        return { ...prev, applicableClaimTypes: [...current, type] };
      }
    });
  };

  return (
    <div className="mt-2 pt-2 border-t border-outline-variant">
      <p className="text-xs font-semibold text-outline mb-1">Applicable Types (leave empty for All)</p>
      <div className="flex flex-col gap-1">
        {CLAIM_TYPES.map(type => (
          <label key={type} className="flex items-center gap-2 text-xs">
            <input 
              type="checkbox" 
              checked={editForm.applicableClaimTypes?.includes(type) || false} 
              onChange={() => toggleType(type)} 
            />
            {type}
          </label>
        ))}
      </div>
    </div>
  );
}

export function FieldDefinitionsAdmin() {
  const { fieldDefinitions, refresh } = useAppContext();
  const { addToast } = useToast();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<FieldDefinition>>({});
  const [selectedEntity, setSelectedEntity] = useState<FieldDefinitionEntity>(FIELD_ENTITIES[0].value);
  const [keyManuallyEdited, setKeyManuallyEdited] = useState(false);
  const [saving, setSaving] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);

  const filteredFields = fieldDefinitions.filter(fd => fd.entity === selectedEntity);
  const totalPages = Math.ceil(filteredFields.length / ITEMS_PER_PAGE);
  const paginatedFields = filteredFields.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

  useEffect(() => {
    setCurrentPage(1);
  }, [selectedEntity]);

  const handleSave = async () => {
    setSaving(true);
    try {
      if (editingId === 'new') {
        await createFieldDefinition({
          entity: selectedEntity,
          key: editForm.key || `custom_${Date.now()}`,
          label: editForm.label || 'New Field',
          input_type: editForm.input_type || 'text',
          required: editForm.required ?? false,
          active: editForm.active ?? true,
          display_order: filteredFields.length + 1,
          allow_other: editForm.allow_other,
          // A dropdown's choices are meaningless (and shouldn't be sent) once
          // it's backed by a Master Data catalog instead of its own list.
          options: editForm.input_type === 'dropdown' && !editForm.master_data_entity ? editForm.options : undefined,
          master_data_entity: editForm.master_data_entity,
          // applicableClaimTypes only means anything on a claim field.
          applicableClaimTypes: selectedEntity === 'claim' ? editForm.applicableClaimTypes : undefined,
        });
      } else if (editingId) {
        await updateFieldDefinition(editingId, {
          label: editForm.label,
          input_type: editForm.input_type,
          required: editForm.required,
          active: editForm.active,
          allow_other: editForm.allow_other,
          options: editForm.input_type === 'dropdown' && !editForm.master_data_entity ? editForm.options : undefined,
          master_data_entity: editForm.master_data_entity,
          applicableClaimTypes: selectedEntity === 'claim' ? editForm.applicableClaimTypes : undefined,
        });
      }
      await refresh();
      addToast('Record saved successfully.', 'success');
      setEditingId(null);
      setEditForm({});
    } catch (err: any) {
      // Server validates key uniqueness and required shape.
      addToast(err?.message || 'Could not save the field.', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-12">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="font-display text-display text-on-surface">Field Definitions</h1>
          <p className="text-body-md text-outline mt-1">Configure dynamic fields and validations across MOMs, Claims, and future forms.</p>
        </div>
        <Button className="gap-2" onClick={() => { setEditingId('new'); setEditForm({ active: true, required: false, input_type: 'text' }); setKeyManuallyEdited(false); }}>
          <span className="material-symbols-outlined">add</span>
          New Field
        </Button>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-2 border-b border-outline-variant mb-6">
        {FIELD_ENTITIES.map(ent => (
          <button
            key={ent.value}
            className={`px-4 py-2 font-label-md transition-colors rounded-t-lg border-b-2 ${
              selectedEntity === ent.value
                ? 'border-primary text-primary bg-primary/5'
                : 'border-transparent text-outline hover:bg-surface-container-high'
            }`}
            onClick={() => { setSelectedEntity(ent.value); setEditingId(null); }}
          >
            {ent.label}
          </button>
        ))}
      </div>
      <div className="overflow-hidden rounded-xl border border-outline-variant bg-white">
        <div className="overflow-x-auto">
          {/* table-fixed makes the <th> width hints below authoritative —
              under the default auto layout, a wide input's intrinsic content
              width (e.g. the disabled Key field) overrides percentage hints
              and starves Settings regardless of what's requested here. */}
          <table className="w-full text-left min-w-[960px]">
            <thead className="bg-slate-100 text-slate-600 font-label-sm uppercase font-semibold tracking-wider border-b border-outline-variant">
              <tr>
                <th className="px-6 py-4">Label</th>
                <th className="px-6 py-4 whitespace-nowrap">Key</th>
                <th className="px-6 py-4 whitespace-nowrap">Input Type</th>
                {/* Settings holds the richest content per row — checkboxes plus,
                    for dropdowns, the full add/rename/remove options editor —
                    so it gets the largest fixed share instead of the auto
                    table layout starving it in favor of Key/Actions. */}
                <th className="px-6 py-4">Settings</th>
                <th className="px-6 py-4 text-center whitespace-nowrap">Active</th>
                <th className="px-6 py-4 text-right whitespace-nowrap">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-outline-variant">
              {paginatedFields.map(fd => (
                <tr key={fd.id} className="hover:bg-slate-50 transition-colors">
                  {editingId === fd.id && false ? (
                    <>
                      <td className="px-6 py-3"><Input value={editForm.label || ''} onChange={e => setEditForm(p => ({...p, label: e.target.value}))} /></td>
                      <td className="px-6 py-3">
  <div className="relative">
    <Input 
      value={editForm.key || ''} 
      readOnly
      disabled
      className="bg-surface-container-highest text-outline-variant cursor-not-allowed pr-8"
      title="Field keys cannot be changed after creation"
    />
    <span className="material-symbols-outlined absolute right-2 top-1/2 -translate-y-1/2 text-outline-variant text-[16px]" title="Field keys cannot be changed after creation">lock</span>
  </div>
</td>
                      <td className="px-6 py-3">
                        <select className="p-2 rounded border border-outline-variant w-full" value={editForm.input_type || 'text'} onChange={e => setEditForm(p => ({...p, input_type: e.target.value as any}))}>
                          <option value="text">Text</option>
                          <option value="number">Number</option>
                          <option value="date">Date</option>
                          <option value="dropdown">Dropdown</option>
                          <option value="textarea">Textarea</option>
                        </select>
                      </td>
                      <td className="px-6 py-3">
                         <label className="flex items-center gap-2 mb-1 text-sm"><input type="checkbox" checked={editForm.required} onChange={e => setEditForm(p => ({...p, required: e.target.checked}))} /> Required</label>
                         {editForm.input_type === 'dropdown' && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={editForm.allow_other} onChange={e => setEditForm(p => ({...p, allow_other: e.target.checked}))} /> Allow "Other"</label>}
                         {editForm.input_type === 'dropdown' && <OptionsEditor editForm={editForm} setEditForm={setEditForm} />}
                         {selectedEntity === 'claim' && <ClaimTypeCheckboxes editForm={editForm} setEditForm={setEditForm} />}
                      </td>
                      <td className="px-6 py-3 text-center">
                        <input type="checkbox" checked={editForm.active} onChange={e => setEditForm(p => ({...p, active: e.target.checked}))} className="w-4 h-4" />
                      </td>
                      <td className="px-6 py-3 text-right">
                         <div className="flex justify-end gap-2">
                           <Button size="sm" variant="ghost" onClick={() => setEditingId(null)} disabled={saving}>Cancel</Button>
                           <Button size="sm" onClick={handleSave} disabled={saving}>Save</Button>
                         </div>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="px-6 py-4 font-label-md text-on-surface">{fd.label}</td>
                      <td className="px-6 py-4 font-mono-data text-outline whitespace-nowrap">{fd.key}</td>
                      <td className="px-6 py-4 text-on-surface capitalize whitespace-nowrap">{fd.input_type}</td>
                      <td className="px-6 py-4 text-on-surface text-sm">
                        {fd.required && <span className="block text-error">Required</span>}
                        {fd.allow_other && <span className="block text-primary">Allows "Other"</span>}
                        {fd.master_data_entity && <span className="block text-tertiary">Uses {fd.master_data_entity} catalog</span>}
                        {fd.input_type === 'dropdown' && !fd.master_data_entity && (
                          <span className="block text-outline" title={(fd.options || []).join(', ')}>
                            {(fd.options || []).length} option{(fd.options || []).length === 1 ? '' : 's'}
                          </span>
                        )}
                        {selectedEntity === 'claim' && (
                          <span className="block text-[12px] text-outline mt-1 font-semibold">
                            {(!fd.applicableClaimTypes || fd.applicableClaimTypes.length === 0) 
                              ? 'Applies to: All Types' 
                              : `Applies to: ${fd.applicableClaimTypes.join(', ')}`}
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-center whitespace-nowrap">
                         <span className={`px-2 py-1 rounded-full text-xs font-bold ${fd.active ? 'bg-green-100 text-green-800' : 'bg-surface-container-high text-on-surface-variant'}`}>
                            {fd.active ? 'Active' : 'Inactive'}
                         </span>
                      </td>
                      <td className="px-6 py-4 text-right whitespace-nowrap">
                         <Button size="sm" variant="outline" onClick={() => { setEditingId(fd.id); setEditForm(fd); }}>Edit</Button>
                      </td>
                    </>
                  )}
                </tr>
              ))}
              
              {editingId === 'new' && (
                <tr className="bg-primary/5">
                   <td className="px-6 py-3">
  <Input 
    placeholder="Label" 
    value={editForm.label || ''} 
    onChange={e => {
      const newLabel = e.target.value;
      setEditForm(p => {
        const next = { ...p, label: newLabel };
        if (!keyManuallyEdited) {
          next.key = generateUniqueKey(newLabel, filteredFields.map(f => f.key));
        }
        return next;
      });
    }} 
  />
</td>
                   <td className="px-6 py-3">
  <Input 
    placeholder="Key" 
    value={editForm.key || ''} 
    onChange={e => {
      setKeyManuallyEdited(true);
      setEditForm(p => ({...p, key: e.target.value}));
    }} 
    className="text-sm bg-surface-container-low"
  />
  <p className="text-[12px] text-outline mt-1">Auto-generated from label — edit if needed.</p>
</td>
                   <td className="px-6 py-3">
                     <select className="p-2 rounded border border-outline-variant w-full" value={editForm.input_type || 'text'} onChange={e => setEditForm(p => ({...p, input_type: e.target.value as any}))}>
                       <option value="text">Text</option>
                       <option value="number">Number</option>
                       <option value="date">Date</option>
                       <option value="dropdown">Dropdown</option>
                       <option value="textarea">Textarea</option>
                     </select>
                   </td>
                   <td className="px-6 py-3">
                      <label className="flex items-center gap-2 mb-1 text-sm"><input type="checkbox" checked={editForm.required || false} onChange={e => setEditForm(p => ({...p, required: e.target.checked}))} /> Required</label>
                      {editForm.input_type === 'dropdown' && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={editForm.allow_other || false} onChange={e => setEditForm(p => ({...p, allow_other: e.target.checked}))} /> Allow "Other"</label>}
                      {editForm.input_type === 'dropdown' && <OptionsEditor editForm={editForm} setEditForm={setEditForm} />}
                      {selectedEntity === 'claim' && <ClaimTypeCheckboxes editForm={editForm} setEditForm={setEditForm} />}
                   </td>
                   <td className="px-6 py-3 text-center">
                     <input type="checkbox" checked={editForm.active !== false} onChange={e => setEditForm(p => ({...p, active: e.target.checked}))} className="w-4 h-4" />
                   </td>
                   <td className="px-6 py-3 text-right">
                      <div className="flex justify-end gap-2">
                        <Button size="sm" variant="outline" className="gap-1" disabled={saving} onClick={() => {
                          const label = 'Cost Center Approval';
                          setEditForm(p => ({
                            ...p,
                            label,
                            key: generateUniqueKey(label, filteredFields.map(f => f.key)),
                            input_type: 'text',
                            required: false,
                            active: true,
                          }));
                          setKeyManuallyEdited(false);
                        }}>
                          <span className="material-symbols-outlined text-[16px]">bolt</span> Autofill
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setEditingId(null)} disabled={saving}>Cancel</Button>
                        <Button size="sm" onClick={handleSave} disabled={saving}>Save</Button>
                      </div>
                   </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <Pagination currentPage={currentPage} totalPages={totalPages} onPageChange={setCurrentPage} />
      </div>
      {editingId && editingId !== 'new' && (
        <Modal
          isOpen
          onClose={() => {
            if (!saving) {
              setEditingId(null);
              setEditForm({});
            }
          }}
          titleId="edit-field-title"
          className="max-w-2xl bg-surface-container-lowest p-6 shadow-xl"
        >
          <form onSubmit={event => { event.preventDefault(); void handleSave(); }}>
            <div className="flex items-start justify-between gap-4 border-b border-outline-variant pb-4">
              <div>
                <h2 id="edit-field-title" className="font-headline-md text-on-surface">Edit field</h2>
                <p className="mt-1 text-sm text-outline">Update the field settings. Changes take effect after saving.</p>
              </div>
              <button
                type="button"
                aria-label="Close edit field dialog"
                onClick={() => { if (!saving) { setEditingId(null); setEditForm({}); } }}
                className="text-outline hover:text-on-surface"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-sm font-semibold text-on-surface">Label</span>
                <Input value={editForm.label || ''} onChange={event => setEditForm(form => ({ ...form, label: event.target.value }))} />
              </label>
              <label className="block">
                <span className="mb-1 block text-sm font-semibold text-on-surface">Key</span>
                <Input value={editForm.key || ''} readOnly disabled title="Field keys cannot be changed after creation" className="bg-surface-container-highest text-outline-variant" />
              </label>
              <label className="block">
                <span className="mb-1 block text-sm font-semibold text-on-surface">Input type</span>
                <select className="w-full rounded border border-outline-variant bg-white p-2" value={editForm.input_type || 'text'} onChange={event => setEditForm(form => ({ ...form, input_type: event.target.value as FieldDefinition['input_type'] }))}>
                  <option value="text">Text</option>
                  <option value="number">Number</option>
                  <option value="date">Date</option>
                  <option value="dropdown">Dropdown</option>
                  <option value="textarea">Textarea</option>
                </select>
              </label>
              <div className="flex flex-col justify-end gap-3 pb-1 sm:flex-row sm:items-center sm:justify-start">
                <label className="flex items-center gap-2 text-sm text-on-surface"><input type="checkbox" checked={editForm.required || false} onChange={event => setEditForm(form => ({ ...form, required: event.target.checked }))} /> Required</label>
                <label className="flex items-center gap-2 text-sm text-on-surface"><input type="checkbox" checked={editForm.active !== false} onChange={event => setEditForm(form => ({ ...form, active: event.target.checked }))} /> Active</label>
              </div>
            </div>

            <div className="mt-4">
              {editForm.input_type === 'dropdown' && <label className="flex items-center gap-2 text-sm text-on-surface"><input type="checkbox" checked={editForm.allow_other || false} onChange={event => setEditForm(form => ({ ...form, allow_other: event.target.checked }))} /> Allow “Other”</label>}
              {editForm.input_type === 'dropdown' && <OptionsEditor editForm={editForm} setEditForm={setEditForm} />}
              {selectedEntity === 'claim' && <ClaimTypeCheckboxes editForm={editForm} setEditForm={setEditForm} />}
            </div>

            <div className="mt-6 flex flex-col-reverse gap-3 border-t border-outline-variant pt-4 sm:flex-row sm:justify-end">
              <Button type="button" variant="outline" onClick={() => { setEditingId(null); setEditForm({}); }} disabled={saving}>Cancel</Button>
              <Button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save changes'}</Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
