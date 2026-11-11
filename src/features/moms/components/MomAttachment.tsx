import { useState, type ReactNode } from 'react';
import { Input, Label } from '../../../components/ui/Input';

export const OFFICIAL_MOM_TEMPLATE_HREF = '/official-mom-loa-template.pdf';
export const OFFICIAL_MOM_TEMPLATE_FILENAME = 'official-mom-loa-template.pdf';

export function MomAttachment({ file, fileName, onChange, autofill }: {
  file: File | null;
  fileName?: string;
  onChange: (file: File | null) => void;
  autofill?: ReactNode;
}) {
  const [error, setError] = useState('');
  return <section className="space-y-3">
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <Label htmlFor="mom-attachment" className="mb-0">LOA / MOM attachment (optional)</Label>
        <a
          href={OFFICIAL_MOM_TEMPLATE_HREF}
          download={OFFICIAL_MOM_TEMPLATE_FILENAME}
          className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold text-primary hover:bg-primary/10 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary transition-all"
        >
          <span aria-hidden="true" className="material-symbols-outlined text-[16px]">download</span>
          Download official template (PDF)
        </a>
      </div>
      <Input id="mom-attachment" type="file" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.gif,.webp" aria-describedby="mom-attachment-help" onChange={event => {
        const selected = event.target.files?.[0];
        event.target.value = '';
        if (!selected) return;
        if (selected.size > 10 * 1024 * 1024) { setError('File is too large. Maximum size is 10MB.'); return; }
        if (!/\.(pdf|docx?|jpe?g|png|gif|webp)$/i.test(selected.name)) { setError('Upload a PDF, Word document, or image.'); return; }
        setError('');
        onChange(selected);
      }} />
      <p id="mom-attachment-help" className="mt-1 text-xs text-outline">Optional. Upload the official MOM/LOA template PDF to autofill the fields below. PDF, Word, or image; maximum 10MB.</p>
      {error && <p role="alert" className="text-sm text-error">{error}</p>}
    </div>
    {(file || fileName) && <div className="flex items-center gap-3 text-sm break-all"><span>{file?.name || fileName}</span><button type="button" className="text-error underline" onClick={() => onChange(null)}>Remove attachment</button></div>}
    {autofill}
  </section>;
}
