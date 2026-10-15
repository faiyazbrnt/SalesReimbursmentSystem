import { ClaimStatus } from '../../types';

export function StatusBadge({ status }: { status: ClaimStatus }) {
  let bgColor = 'bg-surface-container-highest';
  let textColor = 'text-on-surface-variant';
  let borderColor = 'border-outline-variant/30';
  
  switch (status) {
    case ClaimStatus.DRAFT:
      bgColor = 'bg-slate-500/10';
      textColor = 'text-slate-700';
      borderColor = 'border-slate-500/20';
      break;
    case ClaimStatus.SUBMITTED:
    case ClaimStatus.REVIEW_MEETING_SCHEDULED:
      bgColor = 'bg-blue-500/10';
      textColor = 'text-blue-700';
      borderColor = 'border-blue-500/20';
      break;
    case ClaimStatus.PENDING_APPROVAL:
      bgColor = 'bg-amber-500/10';
      textColor = 'text-amber-800';
      borderColor = 'border-amber-500/20';
      break;
    case ClaimStatus.APPROVED:
    case ClaimStatus.PROCESSING:
      bgColor = 'bg-purple-500/10';
      textColor = 'text-purple-700';
      borderColor = 'border-purple-500/20';
      break;
    case ClaimStatus.READY_FOR_CLAIM:
    case ClaimStatus.COMPLETED:
      bgColor = 'bg-teal-500/10';
      textColor = 'text-teal-700';
      borderColor = 'border-teal-500/20';
      break;
    case ClaimStatus.REJECTED:
      bgColor = 'bg-rose-500/10';
      textColor = 'text-rose-700';
      borderColor = 'border-rose-500/20';
      break;
    case ClaimStatus.RETURNED:
      bgColor = 'bg-orange-500/10';
      textColor = 'text-orange-800';
      borderColor = 'border-orange-500/20';
      break;
  }

  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full border text-[11px] font-bold tracking-wide uppercase shadow-sm whitespace-nowrap ${bgColor} ${textColor} ${borderColor}`}>
      {status}
    </span>
  );
}
