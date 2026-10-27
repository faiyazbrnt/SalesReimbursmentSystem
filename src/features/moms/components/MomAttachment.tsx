import { useState } from 'react';
import { Input, Label } from '../../../components/ui/Input';

export const MOM_TEMPLATE_REMINDER = 'MOM template pending — please provide the official template.';

export function MomAttachment({ file, fileName, onChange }: {
  file: File | null;
  fileName?: string;
  onChange: (file: File | null) => void;
}) {
  const [error, setError] = useState('');
  return <section className="space-y-3">
    <div>
      <Label required htmlFor="mom-attachment">LOA / MOM attachment</Label>
      <Input id="mom-attachment" type="file" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.gif,.webp" aria-describedby="mom-attachment-help" onChange={event => {
        const selected = event.target.files?.[0];
        event.target.value = '';
        if (!selected) return;
        if (selected.size > 10 * 1024 * 1024) { setError('File is too large. Maximum size is 10MB.'); return; }
        if (!/\.(pdf|docx?|jpe?g|png|gif|webp)$/i.test(selected.name)) { setError('Upload a PDF, Word document, or image.'); return; }
        setError('');
        onChange(selected);
      }} />
      <p id="mom-attachment-help" className="mt-1 text-xs text-outline">Upload the existing LOA or MOM. PDF, Word, or image; maximum 10MB.</p>
      {error && <p role="alert" className="text-sm text-error">{error}</p>}
    </div>
    {(file || fileName) && <div className="flex items-center gap-3 text-sm break-all"><span>{file?.name || fileName}</span><button type="button" className="text-error underline" onClick={() => onChange(null)}>Remove attachment</button></div>}
    <div className="rounded-input border border-outline-variant p-4">
      <Label htmlFor="mom-template">Draft MOM template</Label>
      <textarea id="mom-template" value="" readOnly rows={3} aria-describedby="mom-template-reminder" className="w-full rounded-input border border-brand-field-border bg-white" />
      <p id="mom-template-reminder" role="note" className="mt-2 text-sm text-outline">{MOM_TEMPLATE_REMINDER}</p>
    </div>
  </section>;
}
