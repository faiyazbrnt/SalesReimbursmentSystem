import { Card } from '../../../components/ui/Card';
import { Claim, MOM } from '../../../types';
import { formatDate, formatDateTime } from '../../../lib/date';
import { formatContactsDisplay } from '@/features/moms';
import { uploadUrl } from '../../../lib/api';

export function ClaimMomSection({ mom, claim }: { mom: MOM; claim: Claim }) {
  const contact = formatContactsDisplay(mom.contactPerson, mom.contactPersonDesignation);
  const initials = (mom.contactPerson || '').split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join('').toUpperCase();
  const actions = (mom.actionItems || '').split(/\r?\n/).map(item => item.trim()).filter(Boolean);
  const discussion = mom.description || mom.summary;
  const labelClass = 'text-[10px] font-semibold uppercase tracking-wide text-outline';

  return (
    <div className="overflow-hidden rounded-xl border border-outline-variant bg-white">
      <header className="flex flex-wrap items-start justify-between gap-4 bg-surface-container-low/20 p-5 sm:p-6 border-b border-outline-variant">
        <div className="flex min-w-0 items-start gap-3">
          <span aria-hidden="true" className="material-symbols-outlined rounded-xl border border-primary/10 bg-primary/5 p-2 text-[22px] text-primary">description</span>
          <div>
            <h3 className="text-xl font-medium tracking-tight text-on-surface">Complete Minutes of Meeting</h3>
            <p className="mt-1 text-xs text-outline">The complete supporting record for this reimbursement.</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3 sm:ml-auto">
          {mom.meetingDate && <div className="rounded-xl border border-outline-variant/30 bg-white/60 px-4 py-2 text-right">
            <p className="text-sm font-medium text-on-surface">{formatDate(mom.meetingDate)}</p>
            {/T\d{2}:\d{2}/.test(mom.meetingDate) && <p className="mt-0.5 text-[10px] text-outline">{formatDateTime(mom.meetingDate)}</p>}
          </div>}
          {mom.fileUrl && <a href={uploadUrl(mom.fileUrl)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-lg border border-outline-variant bg-white px-3 py-2 text-xs text-primary hover:bg-primary/5">
            <span aria-hidden="true" className="material-symbols-outlined text-[17px]">download</span>Download attachment
          </a>}
        </div>
      </header>

      <dl className="grid grid-cols-1 items-stretch gap-x-0 gap-y-5 bg-surface-container-low/20 px-5 py-6 text-center sm:grid-cols-2 sm:px-6 lg:grid-cols-3 xl:grid-cols-6 [&>div]:px-3 [&>div]:border-outline-variant/25 [&>div]:border-b [&>div]:pb-4 [&>div:last-child]:border-b-0 sm:[&>div]:border-b-0 sm:[&>div]:border-l sm:[&>div:nth-child(2n+1)]:border-l-0 lg:[&>div:nth-child(2n+1)]:border-l lg:[&>div:nth-child(3n+1)]:border-l-0 xl:[&>div:nth-child(3n+1)]:border-l xl:[&>div:first-child]:border-l-0">
        <div className="min-w-0">
          <dt className={labelClass}>Company</dt>
          <dd className="mt-2 break-words text-xs font-medium leading-5 text-on-surface">{mom.companyName || claim.client || '—'}</dd>
        </div>
        <div className="min-w-0">
          <dt className={labelClass}>Purpose</dt>
          <dd className="mt-2 break-words text-xs leading-5 text-on-surface-variant">{mom.purposeOfMeeting || '—'}</dd>
        </div>
        <div className="min-w-0">
          <dt className={labelClass}>Key contact</dt>
          <dd className="mt-2 flex items-start justify-center gap-2">
            <span aria-hidden="true" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-semibold text-primary">{initials || '?'}</span>
            <div className="min-w-0">
              <p className="break-words text-xs font-medium text-on-surface">{contact || '?'}</p>
              {mom.contactPersonEmail && <a href={'mailto:' + mom.contactPersonEmail} className="mt-0.5 block break-words text-[11px] text-primary hover:underline">{mom.contactPersonEmail}</a>}
            </div>
          </dd>
        </div>
        <div className="min-w-0">
          <dt className={labelClass}>Location</dt>
          <dd className="mt-2 flex items-start justify-center gap-1.5 text-xs leading-5 text-on-surface-variant"><span aria-hidden="true" className="material-symbols-outlined shrink-0 text-[16px] text-outline">location_on</span><span className="whitespace-pre-wrap break-words">{mom.location || '—'}</span></dd>
        </div>
        <div className="min-w-0">
          <dt className={labelClass}>Type of account</dt>
          <dd className="mt-2"><span className="inline-block rounded bg-surface-container-high px-2 py-1 text-[11px] text-on-surface-variant">{mom.typeOfAccount || '—'}</span></dd>
        </div>
        <div className="min-w-0">
          <dt className={labelClass}>Category</dt>
          <dd className="mt-2"><span className="inline-block rounded bg-surface-container-high px-2 py-1 text-[11px] text-on-surface-variant">{mom.category || '?'}</span></dd>
        </div>
      </dl>

      <div className="space-y-7 p-5 sm:p-6">
        <section aria-labelledby="claim-mom-discussion">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h4 id="claim-mom-discussion" className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-on-surface"><span aria-hidden="true" className="material-symbols-outlined text-[16px] text-primary">chat_bubble</span>Discussion &amp; Proceedings</h4>
            <span className="text-[10px] text-outline">Meeting notes</span>
          </div>
          <p className="rounded-xl border border-outline-variant/20 bg-surface-container-low/40 p-4 text-sm leading-6 text-on-surface-variant whitespace-pre-wrap break-words">{discussion || 'No discussion was recorded.'}</p>
        </section>
        <section aria-labelledby="claim-mom-agreements">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h4 id="claim-mom-agreements" className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-on-surface"><span aria-hidden="true" className="material-symbols-outlined text-[16px] text-outline">check_circle</span>Agreements and Decisions</h4>
            <span className="text-[10px] text-outline">Formal resolution</span>
          </div>
          <div className="flex items-start gap-2 rounded-xl border border-outline-variant/20 bg-surface-container-low/20 p-4">
            {!mom.agreements && <span aria-hidden="true" className="material-symbols-outlined text-[16px] text-outline">info</span>}
            <p className={'whitespace-pre-wrap break-words text-sm leading-6 ' + (mom.agreements ? 'text-on-surface-variant' : 'italic text-outline')}>{mom.agreements || 'No separate agreements were recorded.'}</p>
          </div>
        </section>
        <section aria-labelledby="claim-mom-actions">
          <h4 id="claim-mom-actions" className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-on-surface"><span aria-hidden="true" className="material-symbols-outlined text-[16px] text-success">assignment</span>Action Items &amp; Next Steps</h4>
          {actions.length ? <ul className="space-y-2">{actions.map((action, index) => <li key={index} className="flex items-start gap-3 rounded-xl border border-outline-variant/30 bg-white p-4">
            <span aria-hidden="true" className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
            <p className="break-words text-sm leading-5 text-on-surface-variant">{action}</p>
          </li>)}</ul> : <p className="rounded-xl border border-outline-variant/20 bg-surface-container-low/20 p-4 text-sm italic text-outline">No action items were recorded.</p>}
        </section>
      </div>
    </div>
  );
}
