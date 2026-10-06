import React from 'react';

export type TimelineEventStatus = 'completed' | 'pending';

export interface TimelineEvent {
  id: string | number;
  actor: string;
  action: string;
  timestamp: string;
  note?: string;
  status: TimelineEventStatus;
}

export interface TimelineProps {
  /** Optional custom title for the timeline header. Defaults to "History". */
  title?: string;
  /** List of timeline events (newest-first, top to bottom). */
  events: TimelineEvent[];
  /** Optional CSS class overrides for the container card. */
  className?: string;
}

/**
 * Reusable, responsive vertical Timeline/Stepper component for activity/claim history.
 * Dynamically adjusts connecting lines without DOM measurements or hardcoded heights.
 */
export const Timeline: React.FC<TimelineProps> = ({
  title = 'History',
  events,
  className = '',
}) => {
  return (
    <div
      className={`w-full rounded-xl border border-outline-variant bg-white p-5 shadow-xs sm:p-6 ${className}`}
    >
      {/* Header */}
      <div className="mb-5 flex items-center justify-between border-b border-outline-variant pb-3.5">
        <div className="flex items-center gap-2">
          {/* History / Clock Icon */}
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
            {title}
          </h3>
        </div>

        {/* Dynamic event counter badge */}
        <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">
          {events.length} {events.length === 1 ? 'event' : 'events'}
        </span>
      </div>

      {/* Empty State */}
      {events.length === 0 ? (
        <div className="py-8 text-center">
          <p className="text-sm text-slate-500">No activity recorded yet.</p>
        </div>
      ) : (
        /* Timeline Items List */
        <ol className="relative m-0 list-none p-0">
          {events.map((event, index) => {
            const isCompleted = event.status === 'completed';
            const isLast = index === events.length - 1;

            return (
              <li
                key={event.id}
                className="group relative pb-6 last:pb-1"
              >
                {/* Continuous connecting line running to the next step */}
                {!isLast && (
                  <span
                    className="absolute top-6 left-3.5 -ml-px h-full w-0.5 bg-slate-200 transition-colors group-hover:bg-slate-300"
                    aria-hidden="true"
                  />
                )}

                <div className="relative flex items-start gap-3.5">
                  {/* Status Indicator Icon */}
                  <div className="relative flex h-7 w-7 shrink-0 items-center justify-center">
                    {isCompleted ? (
                      <div
                        className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-600 text-white shadow-xs ring-4 ring-white transition-transform duration-150 group-hover:scale-105"
                        title="Completed"
                      >
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
                            d="M4.5 12.75l6 6 9-13.5"
                          />
                        </svg>
                      </div>
                    ) : (
                      <div
                        className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-slate-300 bg-white text-slate-400 ring-4 ring-white transition-all duration-150 group-hover:border-indigo-400 group-hover:text-indigo-600 group-hover:scale-105"
                        title="Pending"
                      >
                        {/* Right-pointing arrow/triangle */}
                        <svg
                          className="h-3 w-3 translate-x-0.5 fill-current"
                          viewBox="0 0 24 24"
                          aria-hidden="true"
                        >
                          <path d="M8 5v14l11-7z" />
                        </svg>
                      </div>
                    )}
                  </div>

                  {/* Event Details Content */}
                  <div className="min-w-0 flex-1 pt-0.5">
                    <div className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
                      {/* Actor + Action */}
                      <p className="text-sm text-slate-900 break-words">
                        <span className="font-semibold text-slate-900">
                          {event.actor}
                        </span>
                        <span className="mx-1.5 font-normal text-slate-400" aria-hidden="true">
                          •
                        </span>
                        <span
                          className={`font-medium ${
                            isCompleted ? 'text-emerald-700' : 'text-slate-600'
                          }`}
                        >
                          {event.action}
                        </span>
                      </p>

                      {/* Timestamp */}
                      <time
                        dateTime={event.timestamp}
                        className="shrink-0 text-xs font-normal text-slate-500"
                      >
                        {event.timestamp}
                      </time>
                    </div>

                    {/* Optional Quoted Note Pill */}
                    {event.note && (
                      <div className="mt-2 inline-block max-w-full rounded-md border border-slate-200/80 bg-slate-100/80 px-2.5 py-1 text-xs text-slate-700 italic shadow-2xs break-words">
                        “{event.note}”
                      </div>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
};

export default Timeline;
