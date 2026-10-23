import { ReactNode, useRef, useState } from 'react';
import { Modal } from '../../../components/shared/Modal';
import { MOM } from '../../../types';
import { exportMomPdf, momSections } from '../domain/export';

export interface MomClientPreviewModalProps {
  mom: MOM;
  onClose: () => void;
  footer?: ReactNode;
}

export function MomClientPreviewModal({ mom, onClose, footer }: MomClientPreviewModalProps) {
  const [zoom, setZoom] = useState(100);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const previewRef = useRef<HTMLDivElement>(null);
  const sections = momSections(mom, 'client');
  const download = async () => {
    setBusy(true);
    setError('');
    try { await exportMomPdf(mom, 'client'); }
    catch { setError('Could not download PDF. Please try again.'); }
    finally { setBusy(false); }
  };
  return (
    <Modal isOpen onClose={onClose} titleId="client-preview-title" className="max-w-5xl">
      <div ref={previewRef} className="flex h-[90dvh] w-full flex-col overflow-hidden rounded-xl bg-white shadow-2xl">
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-200 px-5 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <span aria-hidden="true" className="material-symbols-outlined rounded-lg bg-blue-50 p-2 text-[20px] text-primary">description</span>
            <div>
              <h3 id="client-preview-title" className="text-sm font-semibold text-slate-900">Client Copy Preview</h3>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden max-w-64 rounded-lg border border-slate-100 bg-slate-50 px-2 py-1 text-[10px] text-slate-500 sm:block">
              Recipient: <span className="break-all font-medium text-primary">{mom.contactPersonEmail || 'No client email added'}</span>
            </div>
            <button type="button" aria-label="Close preview" onClick={onClose} className="rounded p-1 text-slate-400 hover:bg-slate-100"><span aria-hidden="true" className="material-symbols-outlined text-[20px]">close</span></button>
          </div>
        </header>
        <div role="toolbar" aria-label="Document preview controls" className="flex shrink-0 items-center gap-3 bg-slate-800 px-4 py-2 text-[11px] text-slate-200">
          <span className="rounded border border-slate-600 bg-slate-900 px-2 py-1">Document preview</span>
          <div className="flex items-center gap-2 rounded bg-slate-700 px-1">
            <button type="button" aria-label="Zoom out" disabled={zoom <= 50} onClick={() => setZoom(value => value - 10)} className="p-1 disabled:opacity-30">-</button>
            <span className="w-9 text-center tabular-nums">{zoom}%</span>
            <button type="button" aria-label="Zoom in" disabled={zoom >= 150} onClick={() => setZoom(value => value + 10)} className="p-1 disabled:opacity-30">+</button>
          </div>
          <button type="button" aria-label="Reset zoom" onClick={() => setZoom(100)} className="flex p-1"><span aria-hidden="true" className="material-symbols-outlined text-[16px]">restart_alt</span></button>
          <button type="button" disabled={busy} onClick={download} className="ml-auto flex items-center gap-1 disabled:opacity-50"><span aria-hidden="true" className="material-symbols-outlined text-[15px]">download</span>{busy ? 'Downloading�' : 'Download'}</button>
          <button type="button" aria-label="Toggle fullscreen" onClick={() => {
            const action = document.fullscreenElement ? document.exitFullscreen() : previewRef.current?.requestFullscreen();
            action?.catch(() => setError('Fullscreen is unavailable in this browser.'));
          }} className="flex p-1"><span aria-hidden="true" className="material-symbols-outlined text-[16px]">fullscreen</span></button>
        </div>
        {error && <p role="alert" className="bg-red-50 px-4 py-2 text-xs text-error">{error}</p>}
        <div className="min-h-0 flex-1 overflow-auto bg-[#e9eef5] p-4 sm:p-7">
          <article aria-label="Client document preview" className="mx-auto flex min-h-[760px] flex-col border-t-4 border-primary bg-white p-6 text-slate-800 shadow-lg sm:p-9" style={{ width: 620, maxWidth: '100%', zoom: zoom / 100 }}>
            <div className="mb-5 border-b border-slate-100 pb-5">
              <span className="rounded border border-blue-100 bg-blue-50 px-2 py-1 text-[9px] font-semibold tracking-wide text-primary">OFFICIAL RECORD</span>
              <h1 className="mt-4 text-2xl font-bold tracking-tight text-blue-900">{mom.documentType === 'LOA' ? 'Letter of Agreement' : 'Minutes of Meeting'}</h1>
              <p className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">{mom.companyName || 'Untitled meeting'}</p>
            </div>
            <div className="space-y-5">
              {sections.map(section => (
                <section key={section.heading}>
                  <h2 className="mb-2 border-b border-slate-100 pb-2 text-[10px] font-bold uppercase tracking-wide text-blue-900">{section.rows && <span className="mr-1 text-primary">?</span>}{section.heading}</h2>
                  {section.rows && <dl className="overflow-hidden rounded-md border border-slate-200 bg-slate-50/60">
                    {section.rows.map(([label, value]) => <div key={label} className="grid grid-cols-[minmax(100px,1fr)_2fr] gap-3 border-b border-slate-100 px-3 py-2 text-[11px] last:border-0">
                      <dt className="text-slate-500">{label}</dt>
                      <dd className={`min-w-0 break-words font-medium ${label === 'Client Email' ? 'text-primary' : ''}`}>{value}</dd>
                    </div>)}
                  </dl>}
                  {section.paragraphs?.map((paragraph, index) => <p key={index} className="whitespace-pre-wrap break-words text-[11px] leading-relaxed">{paragraph}</p>)}
                </section>
              ))}
            </div>
            <p className="mt-auto border-t border-slate-100 pt-6 text-center text-[9px] uppercase tracking-wide text-slate-400">Confidential � Prepared for client review</p>
          </article>
        </div>
        {footer && <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-white px-4 py-3">{footer}</div>}
      </div>
    </Modal>
  );
}
