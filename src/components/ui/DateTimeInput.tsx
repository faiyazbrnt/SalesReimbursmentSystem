import { forwardRef, useEffect, useLayoutEffect, useId, useRef, useState, type InputHTMLAttributes } from 'react';
import { Button, cn } from './Button';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const pad = (value: number) => String(value).padStart(2, '0');
const dateValue = (date: Date) => String(date.getFullYear()).padStart(4, '0') + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate());
const controlClass = 'min-w-0 w-full rounded-input border border-brand-field-border bg-white p-2 text-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-50';

/** Keeps native values, validation and input refs while replacing the browser popup. */
export const DateTimeInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ type, className, onClick, onKeyDown, ...props }, ref) => {
    const inputRef = useRef<HTMLInputElement>(null);
    const rootRef = useRef<HTMLDivElement>(null);
    const panelRef = useRef<HTMLDivElement>(null);
    const panelId = useId();
    const [timeDraft, setTimeDraft] = useState('00:00');
    const [open, setOpen] = useState(false);
    const [view, setView] = useState(() => new Date());
    const [yearText, setYearText] = useState(String(view.getFullYear()));
    const [localValue, setLocalValue] = useState(String(props.defaultValue || ''));
    const value = String(props.value ?? localValue);
    const isDate = type === 'date';
    const unavailable = props.disabled || props.readOnly;
    const min = String(props.min || '');
    const max = String(props.max || '');
    const allowed = (candidate: string) => (!min || candidate >= min) && (!max || candidate <= max);
    const show = () => {
      if (unavailable) return;
      const candidate = isDate && value ? new Date(value + 'T12:00:00') : new Date();
      const selected = Number.isNaN(candidate.getTime()) ? new Date() : candidate;
      setView(selected);
      setYearText(String(selected.getFullYear()));
      setTimeDraft(value || '00:00');
      setOpen(true);
    };
    const close = () => { setOpen(false); inputRef.current?.focus(); };
    const commit = (next: string) => {
      const input = inputRef.current;
      if (!input || unavailable) return;
      // Dispatch through the native input so existing React onChange handlers
      // receive a real event with the original name, validity and value APIs.
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, next);
      input.dispatchEvent(new Event('input', { bubbles: true }));
      setLocalValue(next);
    };

    useLayoutEffect(() => {
      const panel = panelRef.current;
      if (!open || unavailable || !panel) return;
      // The browser top layer avoids clipping by scrollable dialogs/tables,
      // while keeping the popup in the same DOM subtree for modal focus traps.
      panel.showPopover();
      const position = () => {
        const anchor = inputRef.current?.getBoundingClientRect();
        if (!anchor) return;
        const viewport = window.visualViewport;
        const leftEdge = (viewport?.offsetLeft || 0) + 8;
        const topEdge = (viewport?.offsetTop || 0) + 8;
        const viewportWidth = viewport?.width || window.innerWidth;
        const bottomEdge = (viewport?.offsetTop || 0) + (viewport?.height || window.innerHeight) - 8;
        const width = Math.min(320, viewportWidth - 16);
        panel.style.width = width + 'px';
        const below = Math.max(0, bottomEdge - anchor.bottom - 6);
        const above = Math.max(0, anchor.top - topEdge - 6);
        const desiredHeight = panel.scrollHeight + 2;
        const upward = below < desiredHeight && above > below;
        const available = Math.min(bottomEdge - topEdge, upward ? above : below);
        panel.style.maxHeight = Math.max(0, available) + 'px';
        const height = panel.getBoundingClientRect().height;
        panel.style.left = Math.max(leftEdge, Math.min(anchor.left, leftEdge + viewportWidth - 16 - width)) + 'px';
        panel.style.top = Math.max(topEdge, Math.min(upward ? anchor.top - 6 - height : anchor.bottom + 6, bottomEdge - height)) + 'px';
      };
      position();
      const observer = new ResizeObserver(position);
      observer.observe(panel);
      if (rootRef.current) observer.observe(rootRef.current);
      window.addEventListener('resize', position);
      window.addEventListener('scroll', position, true);
      window.visualViewport?.addEventListener('resize', position);
      window.visualViewport?.addEventListener('scroll', position);
      return () => {
        observer.disconnect();
        window.removeEventListener('resize', position);
        window.removeEventListener('scroll', position, true);
        window.visualViewport?.removeEventListener('resize', position);
        window.visualViewport?.removeEventListener('scroll', position);
        if (panel.matches(':popover-open')) panel.hidePopover();
      };
    }, [open, unavailable]);

    useEffect(() => {
      if (!open) return;
      const outside = (event: PointerEvent) => {
        if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
      };
      const escape = (event: KeyboardEvent) => {
        if (event.key !== 'Escape') return;
        event.preventDefault();
        event.stopImmediatePropagation();
        setOpen(false);
        inputRef.current?.focus();
      };
      document.addEventListener('pointerdown', outside, true);
      window.addEventListener('keydown', escape, true);
      return () => {
        document.removeEventListener('pointerdown', outside, true);
        window.removeEventListener('keydown', escape, true);
      };
    }, [open]);

    const year = view.getFullYear();
    const month = view.getMonth();
    const first = new Date(view);
    first.setDate(1);
    const last = new Date(first);
    last.setMonth(month + 1, 0);
    const today = dateValue(new Date());
    const changeMonth = (delta: number) => {
      const next = new Date(first);
      next.setMonth(next.getMonth() + delta);
      if (next.getFullYear() < 1 || next.getFullYear() > 9999) return;
      setView(next);
      setYearText(String(next.getFullYear()));
    };
    const timeParts = timeDraft.split(':');
    const hour24 = Number(timeParts[0] || 0);
    const hour = hour24 % 12 || 12;
    const minute = timeParts[1] || '00';
    const period = hour24 >= 12 ? 'PM' : 'AM';
    const changeTime = (nextHour: number, nextMinute: string, nextPeriod: string) => {
      setTimeDraft(pad(nextHour % 12 + (nextPeriod === 'PM' ? 12 : 0)) + ':' + nextMinute);
    };

    return (
      <div ref={rootRef} className="min-w-0 w-full" onKeyDown={event => {
        if (event.key === 'Escape' && open) { event.preventDefault(); event.stopPropagation(); close(); }
      }} onBlur={event => {
        if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget as Node)) setOpen(false);
      }}>
        <div className="relative min-w-0">
          <input {...props} type={type} ref={element => {
            inputRef.current = element;
            if (typeof ref === 'function') ref(element);
            else if (ref) ref.current = element;
          }} className={cn(className, 'date-time-input min-w-0 pr-11')}
            onChange={event => { setLocalValue(event.target.value); props.onChange?.(event); }}
            onClick={event => { onClick?.(event); if (!event.defaultPrevented) { event.preventDefault(); show(); } }}
            onKeyDown={event => {
              onKeyDown?.(event);
              if (!event.defaultPrevented && (event.key === 'Enter' || (event.altKey && event.key === 'ArrowDown'))) {
                event.preventDefault(); show();
              }
            }} />
          <button type="button" aria-label={isDate ? 'Choose date' : 'Choose time'} aria-expanded={open && !unavailable}
            aria-controls={panelId} disabled={unavailable}
            className="absolute right-1 top-1/2 -translate-y-1/2 rounded-md p-2 text-on-surface-variant hover:bg-surface-container focus-visible:outline-primary disabled:opacity-50"
            onClick={() => open ? close() : show()}>
            <span aria-hidden="true" className="material-symbols-outlined text-[20px] block">{isDate ? 'calendar_month' : 'schedule'}</span>
          </button>
        </div>
        {open && !unavailable && (
          <div ref={panelRef} popover="manual" id={panelId} role="group" aria-label={isDate ? 'Date picker' : 'Time picker'} className="fixed m-0 min-w-0 overflow-y-auto overscroll-contain rounded-lg border border-outline-variant bg-white p-3 space-y-3 text-on-surface shadow-xl">
            {isDate ? <>
              <div className="grid grid-cols-2 gap-2">
                <label className="min-w-0 text-xs">Month
                  <select aria-label="Month" className={controlClass} value={month} onChange={event => {
                    const next = new Date(first); next.setMonth(Number(event.target.value)); setView(next);
                  }}>{MONTHS.map((name, index) => <option key={name} value={index}>{name}</option>)}</select>
                </label>
                <label className="min-w-0 text-xs">Year
                  <input aria-label="Year" type="number" min="1" max="9999" inputMode="numeric" className={controlClass} value={yearText}
                    onChange={event => {
                      setYearText(event.target.value);
                      const nextYear = Number(event.target.value);
                      if (Number.isInteger(nextYear) && nextYear >= 1 && nextYear <= 9999) {
                        const next = new Date(first); next.setFullYear(nextYear); setView(next);
                      }
                    }} onBlur={() => setYearText(String(year))} />
                </label>
              </div>
              <div className="flex items-center justify-between gap-1">
                <button type="button" aria-label="Previous month" className="rounded p-1 hover:bg-surface-container focus-visible:outline-primary" disabled={year === 1 && month === 0} onClick={() => changeMonth(-1)}>&#8249;</button>
                <span aria-live="polite" className="text-xs font-semibold text-center">{MONTHS[month]} {year}</span>
                <button type="button" aria-label="Next month" className="rounded p-1 hover:bg-surface-container focus-visible:outline-primary" disabled={year === 9999 && month === 11} onClick={() => changeMonth(1)}>&#8250;</button>
              </div>
              <div className="grid grid-cols-7 gap-0.5 text-center text-xs">
                {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(day => <span key={day} className="py-1 text-outline">{day}</span>)}
                {Array.from({ length: first.getDay() }, (_, index) => <span key={'blank-' + index} />)}
                {Array.from({ length: last.getDate() }, (_, index) => {
                  const day = index + 1;
                  const candidate = String(year).padStart(4, '0') + '-' + pad(month + 1) + '-' + pad(day);
                  return <button key={candidate} type="button" aria-label={MONTHS[month] + ' ' + day + ', ' + year}
                    aria-pressed={value === candidate} aria-current={today === candidate ? 'date' : undefined} disabled={!allowed(candidate)}
                    className={cn('min-w-0 rounded-md py-2 focus-visible:outline-primary disabled:opacity-30 disabled:cursor-not-allowed', value === candidate ? 'bg-primary text-on-primary' : 'hover:bg-primary/10', today === candidate && value !== candidate && 'font-bold ring-1 ring-inset ring-primary')}
                    onClick={() => { commit(candidate); close(); }}>{day}</button>;
                })}
              </div>
            </> : <>
              <div className="grid grid-cols-3 gap-2">
                <label className="min-w-0 text-xs">Hour
                  <select aria-label="Hour" className={controlClass} value={hour} onChange={event => changeTime(Number(event.target.value), minute, period)}>
                    {Array.from({ length: 12 }, (_, index) => <option key={index + 1} value={index + 1}>{pad(index + 1)}</option>)}
                  </select>
                </label>
                <label className="min-w-0 text-xs">Minute
                  <select aria-label="Minute" className={controlClass} value={minute} onChange={event => changeTime(hour, event.target.value, period)}>
                    {Array.from({ length: 60 }, (_, index) => <option key={index} value={pad(index)}>{pad(index)}</option>)}
                  </select>
                </label>
                <label className="min-w-0 text-xs">AM/PM
                  <select aria-label="AM/PM" className={controlClass} value={period} onChange={event => changeTime(hour, minute, event.target.value)}>
                    <option>AM</option><option>PM</option>
                  </select>
                </label>
              </div>
              <Button type="button" variant="outline" size="sm" className="w-full" onClick={() => {
                const now = new Date(); commit(pad(now.getHours()) + ':' + pad(now.getMinutes())); close();
              }}>Current Time</Button>
            </>}
            <div className="flex flex-wrap justify-between gap-2">
              {isDate && <Button type="button" size="sm" variant="ghost" disabled={!allowed(today)} onClick={() => { commit(today); close(); }}>Today</Button>}
              <Button type="button" size="sm" variant="ghost" onClick={() => { commit(''); close(); }}>Clear</Button>
              <Button type="button" size="sm" variant="outline" onClick={() => { if (!isDate) commit(timeDraft); close(); }}>{isDate ? 'Done' : 'Set Time'}</Button>
            </div>
          </div>
        )}
      </div>
    );
  },
);
DateTimeInput.displayName = 'DateTimeInput';
