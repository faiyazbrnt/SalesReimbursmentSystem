import { Claim, StatusHistory, User, ClaimStatus, ClaimType } from '../../../types';
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

export interface ClaimTimelineProps {
  claim?: Claim;
  history: StatusHistory[];
  users: Array<Pick<User, 'id' | 'name'>>;
  className?: string;
}

interface TimelineStepItem {
  id: string;
  stage?: ClaimStatus;
  label: string;
  isDone: boolean;
  isCurrent: boolean;
  isRejected: boolean;
  actorName?: string;
  comment?: string;
  timestamp?: string;
}

/**
 * Claim-specific horizontal History table/stepper component.
 * Displays all lifecycle steps (completed, current, and upcoming next steps)
 * inside a single card container with dashboard module styling.
 */
export function ClaimTimeline({
  claim,
  history,
  users,
  className = 'flex-1',
}: ClaimTimelineProps) {
  // Sort chronologically (oldest first) so progress flows left to right
  const sorted = [...history].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );

  // Check if rejected in history or current claim status
  const rejectionIndex = sorted.findIndex(
    (h) =>
      h.newStatus === ClaimStatus.REJECTED ||
      h.newStatus?.toLowerCase() === 'rejected'
  );
  const isRejected = rejectionIndex !== -1 || claim?.status === ClaimStatus.REJECTED;

  let steps: TimelineStepItem[] = [];

  if (!claim && sorted.length === 0) {
    return (
      <div
        className={`w-full rounded-xl border border-slate-200/80 bg-white p-5 shadow-xs sm:p-6 ${className}`}
      >
        <div className="mb-6 flex items-center justify-between border-b border-slate-100 pb-3.5">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
              <svg
                className="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth="2"
                stroke="currentColor"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
                />
              </svg>
            </div>
            <h3 className="text-base font-semibold text-slate-900 tracking-tight">
              History
            </h3>
          </div>
          <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">
            0 events
          </span>
        </div>
        <div className="py-8 text-center">
          <p className="text-sm text-slate-500">No activity recorded yet.</p>
        </div>
      </div>
    );
  }

  if (isRejected) {
    // Collect steps until REJECTED; auto-ends immediately after rejected step
    const cutoff = rejectionIndex !== -1 ? rejectionIndex : sorted.length - 1;
    for (let i = 0; i <= cutoff; i++) {
      const h = sorted[i];
      if (!h) continue;
      const user = users.find((u) => u.id === h.changedBy);
      const isRejStep =
        i === cutoff ||
        h.newStatus === ClaimStatus.REJECTED ||
        h.newStatus?.toLowerCase() === 'rejected';

      steps.push({
        id: h.id || `step-${i}`,
        stage: h.newStatus,
        label: isRejStep ? 'REJECTED' : STAGE_LABELS[h.newStatus] || h.newStatus,
        isDone: !isRejStep,
        isCurrent: false,
        isRejected: isRejStep,
        actorName: user?.name || 'System User',
        comment: h.comment,
        timestamp: h.timestamp,
      });
    }
  } else {
    // Standard flow from claim type (defaults to Reimbursement)
    const claimType: ClaimType = claim?.type || 'Reimbursement';
    const flow = STAGE_FLOWS[claimType] || STAGE_FLOWS['Reimbursement'];

    // Determine current status
    const effectiveStatus = claim?.status || sorted[sorted.length - 1]?.newStatus;

    // Find current stage index in flow
    let currentIndex = -1;
    if (effectiveStatus && effectiveStatus !== ClaimStatus.DRAFT) {
      currentIndex = flow.findIndex((stage) => {
        if (
          (stage === ClaimStatus.PENDING_APPROVAL || stage === ClaimStatus.SUBMITTED) &&
          (effectiveStatus === ClaimStatus.PENDING_APPROVAL || effectiveStatus === ClaimStatus.SUBMITTED)
        ) {
          return true;
        }
        return stage === effectiveStatus;
      });
    }

    const isAllCompleted =
      effectiveStatus === ClaimStatus.COMPLETED ||
      effectiveStatus === ClaimStatus.CLOSED ||
      effectiveStatus === ClaimStatus.LIQUIDATED;

    steps = flow.map((stage, i) => {
      const isDone = isAllCompleted ? true : currentIndex !== -1 && currentIndex > i;
      const isCurrent = !isAllCompleted && (currentIndex !== -1 ? currentIndex === i : i === 0);

      // Find matching history event for this stage
      const matchingEvent = [...sorted].reverse().find((h) => {
        if (
          (stage === ClaimStatus.PENDING_APPROVAL || stage === ClaimStatus.SUBMITTED) &&
          (h.newStatus === ClaimStatus.PENDING_APPROVAL || h.newStatus === ClaimStatus.SUBMITTED)
        ) {
          return true;
        }
        return h.newStatus === stage;
      });

      const fallbackEvent = isCurrent && !matchingEvent ? sorted[sorted.length - 1] : undefined;
      const eventToUse = matchingEvent || fallbackEvent;

      const user = eventToUse ? users.find((u) => u.id === eventToUse.changedBy) : undefined;
      const actorName = user?.name || (eventToUse ? 'System User' : undefined);

      return {
        id: eventToUse?.id || `stage-${stage}-${i}`,
        stage,
        label: STAGE_LABELS[stage] || stage,
        isDone,
        isCurrent,
        isRejected: false,
        actorName,
        comment: eventToUse?.comment,
        timestamp: eventToUse?.timestamp,
      };
    });
  }

  const eventCount = isRejected ? steps.length : (sorted.length || steps.length);

  return (
    <div
      className={`w-full rounded-xl border border-outline-variant bg-white p-5 shadow-xs sm:p-6 ${className}`}
    >
      {/* Header */}
      <div className="mb-6 flex items-center justify-between border-b border-outline-variant pb-3.5">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
            <svg
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth="2"
              stroke="currentColor"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
              />
            </svg>
          </div>
          <h3 className="text-base font-semibold text-slate-900 tracking-tight">
            History
          </h3>
        </div>

        <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">
          {eventCount} {eventCount === 1 ? 'event' : 'events'}
        </span>
      </div>

      {/* Horizontal stepper table */}
      <div className="overflow-x-auto pb-2">
        <div
          className="grid w-full gap-2 items-start"
          style={{
            gridTemplateColumns: `repeat(${steps.length}, minmax(${
              steps.length > 3 ? '180px' : '0px'
            }, 1fr))`,
          }}
        >
          {steps.map((step, i) => {
            const isDone = step.isDone;
            const isCurrent = step.isCurrent;
            const isRej = step.isRejected;

            return (
              <div
                key={step.id}
                className="relative flex flex-col items-center text-center w-full min-w-0 px-2"
              >
                {/* Horizontal Connecting Line behind nodes */}
                {i < steps.length - 1 && (
                  <div
                    className={`absolute top-3.5 sm:top-4 left-1/2 w-full h-0.5 -translate-y-1/2 transition-colors duration-200 ${
                      steps[i + 1]?.isRejected
                        ? 'bg-rose-300'
                        : isDone
                        ? 'bg-emerald-500'
                        : 'bg-slate-200'
                    }`}
                    aria-hidden="true"
                  />
                )}

                {/* Node Circle */}
                <div
                  className={`relative z-10 flex h-7 w-7 sm:h-8 sm:w-8 shrink-0 items-center justify-center rounded-full transition-all duration-200 ${
                    isRej
                      ? 'bg-rose-600 text-white shadow-md shadow-rose-500/20 ring-4 ring-rose-100'
                      : isCurrent
                      ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20 ring-4 ring-blue-100'
                      : isDone
                      ? 'bg-emerald-600 text-white shadow-xs ring-4 ring-white'
                      : 'border-2 border-slate-200 bg-white text-slate-400 ring-4 ring-white'
                  }`}
                  title={`Step ${i + 1}${step.actorName ? ` by ${step.actorName}` : ''}`}
                >
                  {isRej ? (
                    <svg
                      className="h-4 w-4"
                      fill="none"
                      viewBox="0 0 24 24"
                      strokeWidth="2.5"
                      stroke="currentColor"
                      aria-hidden="true"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M6 18L18 6M6 6l12 12"
                      />
                    </svg>
                  ) : isDone ? (
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
                    <span
                      className={`text-[11px] sm:text-xs ${
                        isCurrent ? 'font-bold' : 'font-medium'
                      }`}
                    >
                      {i + 1}
                    </span>
                  )}
                </div>

                {/* Step details content */}
                <div className="mt-3 w-full flex flex-col items-center">
                  {/* STEP - STATUS */}
                  <p
                    className={`text-xs font-bold uppercase tracking-wider ${
                      isRej
                        ? 'text-rose-700'
                        : isCurrent
                        ? 'text-blue-600'
                        : isDone
                        ? 'text-slate-800'
                        : 'text-slate-400'
                    }`}
                  >
                    STEP {i + 1} - {isRej ? 'REJECTED' : step.label}
                  </p>

                  {/* IF REJECTED: by "who rejected" */}
                  {isRej && (
                    <p className="text-xs font-semibold text-rose-600 mt-0.5">
                      by {step.actorName || 'Approver'}
                    </p>
                  )}

                  {/* MESSAGE */}
                  {step.comment ? (
                    <div
                      className={`mt-2 rounded-lg border p-2 text-xs text-center w-full break-words ${
                        isRej
                          ? 'border-rose-200 bg-rose-50/70 text-rose-700 italic'
                          : isCurrent
                          ? 'border-blue-100 bg-blue-50/50 text-slate-700 italic'
                          : 'border-slate-200/80 bg-slate-50/80 text-slate-600 italic'
                      }`}
                    >
                      “{step.comment}”
                    </div>
                  ) : (
                    <div className="mt-2 text-xs text-slate-400 italic">—</div>
                  )}

                  {/* DATE & TIME */}
                  <p
                    className={`mt-2 text-[10px] sm:text-[11px] font-medium ${
                      step.timestamp ? 'text-slate-400' : 'text-slate-300'
                    }`}
                  >
                    {step.timestamp ? formatDateTime(step.timestamp) : '—'}
                  </p>

                  {step.actorName && (
                    <span className="sr-only">{step.actorName}</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
