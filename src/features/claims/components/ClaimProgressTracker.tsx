import { useNavigate } from 'react-router-dom';
import { Claim, ClaimStatus, ClaimType, StatusHistory, User } from '../../../types';
import { formatDateTime } from '../../../lib/date';

const STAGE_FLOWS: Record<ClaimType, ClaimStatus[]> = {
  'Reimbursement': [ClaimStatus.PENDING_APPROVAL, ClaimStatus.APPROVED, ClaimStatus.PROCESSING, ClaimStatus.READY_FOR_CLAIM, ClaimStatus.COMPLETED],
  'Transport Reimbursement': [ClaimStatus.PENDING_APPROVAL, ClaimStatus.APPROVED, ClaimStatus.PROCESSING, ClaimStatus.READY_FOR_CLAIM, ClaimStatus.COMPLETED],
  'Cash Advance': [ClaimStatus.SUBMITTED, ClaimStatus.APPROVED, ClaimStatus.RELEASED, ClaimStatus.LIQUIDATED],
  'Liquidation': [ClaimStatus.SUBMITTED, ClaimStatus.REVIEWED, ClaimStatus.CLOSED],
};

const STAGE_LABELS: Partial<Record<ClaimStatus, string>> = {
  [ClaimStatus.PENDING_APPROVAL]: 'Submitted',
  [ClaimStatus.SUBMITTED]: 'Submitted',
  [ClaimStatus.APPROVED]: 'Approved',
  [ClaimStatus.PROCESSING]: 'Processing',
  [ClaimStatus.READY_FOR_CLAIM]: 'Ready for Claim',
  [ClaimStatus.COMPLETED]: 'Completed',
  [ClaimStatus.RELEASED]: 'Released',
  [ClaimStatus.LIQUIDATED]: 'Liquidated',
  [ClaimStatus.REVIEWED]: 'Reviewed',
  [ClaimStatus.CLOSED]: 'Closed',
};

const STEPPER_DISPLAY_LABELS: Partial<Record<ClaimStatus, string>> = {
  [ClaimStatus.PENDING_APPROVAL]: 'Submitted',
  [ClaimStatus.SUBMITTED]: 'Submitted',
  [ClaimStatus.APPROVED]: 'Approved',
  [ClaimStatus.PROCESSING]: 'Processing',
  [ClaimStatus.READY_FOR_CLAIM]: 'Ready',
  [ClaimStatus.COMPLETED]: 'Completed',
  [ClaimStatus.RELEASED]: 'Released',
  [ClaimStatus.LIQUIDATED]: 'Liquidated',
  [ClaimStatus.REVIEWED]: 'Reviewed',
  [ClaimStatus.CLOSED]: 'Closed',
};

const BRANCH_STATUSES = [ClaimStatus.REJECTED, ClaimStatus.RETURNED];

function currentlyWith(claim: Claim, users: User[]): string {
  const approverName = users.find(u => u.id === claim.approverId)?.name;
  switch (claim.status) {
    case ClaimStatus.DRAFT:
      return 'You — not yet submitted';
    case ClaimStatus.PENDING_APPROVAL:
    case ClaimStatus.SUBMITTED:
      return approverName ? `Awaiting ${approverName}` : 'Awaiting approver';
    case ClaimStatus.APPROVED:
    case ClaimStatus.PROCESSING:
    case ClaimStatus.REVIEWED:
      return 'Finance / Custodian';
    case ClaimStatus.READY_FOR_CLAIM:
      return 'Awaiting requestor confirmation';
    case ClaimStatus.RELEASED:
      return 'Awaiting liquidation';
    case ClaimStatus.COMPLETED:
    case ClaimStatus.LIQUIDATED:
    case ClaimStatus.CLOSED:
      return 'Done';
    case ClaimStatus.REJECTED:
      return 'Rejected — no further action';
    case ClaimStatus.RETURNED:
      return `Returned to you${approverName ? ` by ${approverName}` : ''} for revision`;
    default:
      return '—';
  }
}

export interface ClaimProgressTrackerProps {
  claim: Claim | undefined;
  users: User[];
  statusHistory?: StatusHistory[];
  className?: string;
}

/**
 * Modern horizontal progress stepper tracking the most recent claim's lifecycle.
 * Visualizes completed stages, current active stage, and pending steps.
 */
export function ClaimProgressTracker({
  claim,
  users,
  statusHistory = [],
  className = '',
}: ClaimProgressTrackerProps) {
  const navigate = useNavigate();

  if (!claim) {
    return (
      <div className={`rounded-xl border border-outline-variant bg-white p-6 text-center shadow-xs ${className}`}>
        <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-400">
          <svg
            className="h-5 w-5"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth="1.5"
            stroke="currentColor"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z"
            />
          </svg>
        </div>
        <p className="text-sm font-medium text-slate-500">No claims yet to track.</p>
      </div>
    );
  }

  const flow = STAGE_FLOWS[claim.type] || STAGE_FLOWS['Reimbursement'];
  const isBranched = BRANCH_STATUSES.includes(claim.status);
  const currentIndex = flow.indexOf(claim.status);

  const latestComment = statusHistory
    .filter(h => h.claimId === claim.id && h.comment?.trim())
    .slice()
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0];

  const commentAuthor = latestComment
    ? users.find(user => user.id === latestComment.changedBy)?.name || 'System'
    : '';

  return (
    <div
      className={`group relative rounded-xl border border-outline-variant bg-white p-5 shadow-xs transition-all duration-200 hover:border-primary/50 hover:shadow-md cursor-pointer ${className}`}
      onClick={() => navigate(`/claims/${claim.id}`)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          navigate(`/claims/${claim.id}`);
        }
      }}
    >
      {/* Card Header: Title & Claim Reference */}
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <h4 className="text-sm font-semibold text-slate-900 tracking-tight">
          Most Recent Claim
        </h4>
        <span className="inline-flex items-center rounded-md border border-blue-100 bg-blue-50 px-2 py-0.5 font-mono text-xs font-semibold text-blue-700">
          {claim.ref}
        </span>
      </div>

      {/* Purpose Subtitle */}
      <p className="text-xs text-slate-500 mb-5 truncate" title={claim.purpose}>
        {claim.purpose}
      </p>

      {/* Branched Status (Rejected / Returned) */}
      {isBranched ? (
        <div
          className={`my-2 flex items-center gap-3 rounded-lg border p-3 ${
            claim.status === ClaimStatus.REJECTED
              ? 'border-rose-200 bg-rose-50/70 text-rose-700'
              : 'border-amber-200 bg-amber-50/70 text-amber-800'
          }`}
        >
          <div
            className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
              claim.status === ClaimStatus.REJECTED ? 'bg-rose-100 text-rose-600' : 'bg-amber-100 text-amber-600'
            }`}
          >
            {claim.status === ClaimStatus.REJECTED ? (
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            ) : (
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10"
                />
              </svg>
            )}
          </div>
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-wider">
              {claim.status}
            </p>
            <p className="text-xs opacity-80">
              {claim.status === ClaimStatus.REJECTED
                ? 'This request was rejected and cannot be processed further.'
                : 'Returned for revision. Check approver feedback and update.'}
            </p>
          </div>
        </div>
      ) : (
        /* Standard Stepper Grid */
        <div
          className="grid w-full mt-2 gap-1"
          style={{ gridTemplateColumns: `repeat(${flow.length}, minmax(0, 1fr))` }}
        >
          {flow.map((stage, i) => {
            const isDone = currentIndex !== -1 && currentIndex > i;
            const isCurrent = currentIndex !== -1 ? currentIndex === i : i === 0;
            const label = STEPPER_DISPLAY_LABELS[stage] || STAGE_LABELS[stage] || stage;
            const fullLabel = STAGE_LABELS[stage] || stage;

            return (
              <div key={stage} className="relative flex flex-col items-center text-center w-full min-w-0 px-0.5">
                {/* Horizontal Connecting Line behind nodes */}
                {i < flow.length - 1 && (
                  <div
                    className={`absolute top-3.5 sm:top-4 left-1/2 w-full h-0.5 -translate-y-1/2 transition-colors duration-200 ${
                      currentIndex > i ? 'bg-emerald-500' : 'bg-slate-200'
                    }`}
                    aria-hidden="true"
                  />
                )}

                {/* Node Circle */}
                <div
                  className={`relative z-10 flex h-7 w-7 sm:h-8 sm:w-8 shrink-0 items-center justify-center rounded-full transition-all duration-200 ${
                    isDone
                      ? 'bg-emerald-600 text-white shadow-xs ring-4 ring-white'
                      : isCurrent
                      ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20 ring-4 ring-blue-100'
                      : 'border-2 border-slate-200 bg-white text-slate-400 ring-4 ring-white'
                  }`}
                  title={fullLabel}
                >
                  {isDone ? (
                    <svg
                      className="h-3.5 w-3.5 sm:h-4 sm:w-4"
                      fill="none"
                      viewBox="0 0 24 24"
                      strokeWidth="2.5"
                      stroke="currentColor"
                      aria-hidden="true"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M4.5 12.75l6 6 9-13.5"
                      />
                    </svg>
                  ) : (
                    <span className={`text-[11px] sm:text-xs ${isCurrent ? 'font-bold' : 'font-medium'}`}>
                      {i + 1}
                    </span>
                  )}
                </div>

                {/* Node Label (fixed height for clean baseline alignment, wraps nicely without overlapping neighbors) */}
                <div className="mt-1.5 w-full min-w-0 min-h-[26px] flex items-start justify-center">
                  <span
                    className={`w-full min-w-0 text-[9.5px] sm:text-[11px] leading-[1.15] text-center transition-colors break-words hyphens-auto ${
                      isCurrent
                        ? 'font-bold text-blue-600'
                        : isDone
                        ? 'font-medium text-slate-700'
                        : 'font-normal text-slate-400'
                    }`}
                    title={fullLabel}
                  >
                    {label}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Latest Comment Pill */}
      {latestComment && (
        <div className="mt-4 rounded-lg border border-outline-variant bg-slate-50/80 p-3 text-xs">
          <div className="flex items-start gap-2">
            <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center text-slate-400">
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 0 1 .865-.501 48.172 48.172 0 0 0 3.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0 0 12 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018Z"
                />
              </svg>
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-slate-800">
                {STAGE_LABELS[latestComment.newStatus] || latestComment.newStatus}
                <span className="font-normal text-slate-400"> · {commentAuthor}</span>
              </p>
              <p className="mt-0.5 text-slate-600 italic line-clamp-2">
                “{latestComment.comment}”
              </p>
              <p className="mt-1 text-[10px] text-slate-400 font-normal">
                {formatDateTime(latestComment.timestamp)}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Card Footer: Currently With & View Activity */}
      <div className="mt-5 pt-3.5 border-t border-slate-100 flex items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-2 min-w-0 flex-1 mr-2">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500">
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z"
              />
            </svg>
          </span>
          <span className="truncate text-slate-600 min-w-0" title={currentlyWith(claim, users)}>
            <span className="text-slate-400">{isBranched ? 'Ended:' : 'Currently with:'}</span>{' '}
            <span className="font-semibold text-slate-900">{currentlyWith(claim, users)}</span>
          </span>
        </div>

        <span className="inline-flex items-center gap-1 font-semibold text-blue-600 transition-colors group-hover:text-blue-700 shrink-0">
          View activity
          <svg
            className="h-3 w-3 transition-transform duration-150 group-hover:translate-x-0.5"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth="2.5"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
          </svg>
        </span>
      </div>
    </div>
  );
}
