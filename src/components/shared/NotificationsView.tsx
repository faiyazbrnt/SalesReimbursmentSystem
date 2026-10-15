import { useMemo, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../ui/Button';
import { Input, Select } from '../ui/Input';
import { useAppContext } from '../AppContext';
import { useToast } from './ToastContext';
import { EmptyState } from './states';
import { formatDateShort, formatFullDateTime } from '../../lib/date';

export type NotificationCategory = 'rejected' | 'returned' | 'approved' | 'payments' | 'meetings' | 'advances' | 'liquidations' | 'other';

/** Single source of truth for subject -> category, shared by the icon
 *  lookup and the filter chips below so they never disagree on what a
 *  message "is". Order matters: a subject can match several keywords
 *  (e.g. "Cash Advance Released" has both "release" and "advance"). */
export const classifySubject = (subject: string): NotificationCategory => {
  const s = subject.toLowerCase();
  if (s.includes('reject')) return 'rejected';
  if (s.includes('return') || s.includes('revis')) return 'returned';
  if (s.includes('approv')) return 'approved';
  if (s.includes('release') || s.includes('claim') || s.includes('payment') || s.includes('disburs')) return 'payments';
  if (s.includes('meeting') || s.includes('review')) return 'meetings';
  if (s.includes('advance')) return 'advances';
  if (s.includes('liquidat')) return 'liquidations';
  return 'other';
};

export const CATEGORY_ICON: Record<NotificationCategory, { icon: string; color: string; bg: string }> = {
  rejected: { icon: 'cancel', color: 'text-red-600', bg: 'bg-red-100' },
  returned: { icon: 'edit', color: 'text-yellow-600', bg: 'bg-yellow-100' },
  approved: { icon: 'check_circle', color: 'text-green-600', bg: 'bg-green-100' },
  payments: { icon: 'payments', color: 'text-teal-600', bg: 'bg-teal-100' },
  meetings: { icon: 'event', color: 'text-blue-600', bg: 'bg-blue-100' },
  advances: { icon: 'work', color: 'text-indigo-600', bg: 'bg-indigo-100' },
  liquidations: { icon: 'receipt_long', color: 'text-purple-600', bg: 'bg-purple-100' },
  other: { icon: 'notifications', color: 'text-slate-600', bg: 'bg-slate-100' },
};

export const getIconForSubject = (subject: string) => CATEGORY_ICON[classifySubject(subject)];

export const FILTERS: { id: string; label: string; match: (m: { subject: string; read: boolean }) => boolean }[] = [
  { id: 'all', label: 'All', match: () => true },
  { id: 'unread', label: 'Unread', match: m => !m.read },
  { id: 'approvals', label: 'Approvals', match: m => classifySubject(m.subject) === 'approved' },
  { id: 'payments', label: 'Payments & Releases', match: m => classifySubject(m.subject) === 'payments' },
  { id: 'meetings', label: 'Meetings', match: m => classifySubject(m.subject) === 'meetings' },
  { id: 'advances', label: 'Cash Advances', match: m => classifySubject(m.subject) === 'advances' },
  { id: 'rejections', label: 'Rejections', match: m => classifySubject(m.subject) === 'rejected' },
];

export interface NotificationsViewProps {
  initialSelectedId?: string | null;
  isModal?: boolean;
  onCloseModal?: () => void;
}

export function NotificationsView({ initialSelectedId, isModal = false, onCloseModal }: NotificationsViewProps) {
  const navigate = useNavigate();
  const { emails, claims, currentUser, markEmailsRead } = useAppContext();
  const { addToast } = useToast();
  const [selectedId, setSelectedId] = useState<string | null>(initialSelectedId ?? null);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState('all');

  const myMessages = useMemo(() => {
    return emails
      .filter(e => e.recipientId === currentUser.id)
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }, [emails, currentUser.id]);

  useEffect(() => {
    if (initialSelectedId) {
      setSelectedId(initialSelectedId);
      const msg = emails.find(e => e.id === initialSelectedId);
      if (msg && !msg.read) {
        markEmailsRead([initialSelectedId]);
      }
    }
  }, [initialSelectedId, emails, markEmailsRead]);

  const filterCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    FILTERS.forEach(f => { counts[f.id] = myMessages.filter(f.match).length; });
    return counts;
  }, [myMessages]);

  const filteredMessages = useMemo(() => {
    const filter = FILTERS.find(f => f.id === activeFilter) || FILTERS[0];
    const byCategory = myMessages.filter(filter.match);
    const q = searchQuery.toLowerCase();
    if (!q) return byCategory;
    return byCategory.filter(m => m.subject.toLowerCase().includes(q) || m.body.toLowerCase().includes(q));
  }, [myMessages, searchQuery, activeFilter]);

  const selectedMessage = useMemo(() => {
    return myMessages.find(m => m.id === selectedId) || filteredMessages[0] || null;
  }, [myMessages, filteredMessages, selectedId]);

  const relatedClaim = useMemo(() => {
    if (!selectedMessage) return null;
    const text = `${selectedMessage.subject} ${selectedMessage.body}`;
    return claims.find(c => text.includes(c.ref) || text.includes(c.id));
  }, [selectedMessage, claims]);

  const handleMarkAllRead = () => {
    const unreadIds = myMessages.filter(m => !m.read).map(m => m.id);
    if (unreadIds.length > 0) {
      markEmailsRead(unreadIds);
      addToast('All notifications marked as read.', 'success');
    }
  };

  const handleSelectMessage = (id: string) => {
    setSelectedId(id);
    const msg = myMessages.find(m => m.id === id);
    if (msg && !msg.read) markEmailsRead([id]);
  };

  if (myMessages.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center p-8 bg-surface-container-lowest h-full">
        <EmptyState
          icon="mail"
          title="No notifications yet"
          description="You'll see claim, approval, and meeting updates here as the system sends them."
        />
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-hidden flex flex-col md:flex-row bg-surface-container-lowest h-full w-full">
      {/* Left List Pane */}
      <div className="w-full md:w-[340px] lg:w-[400px] border-b md:border-b-0 md:border-r border-brand-border flex flex-col h-1/2 md:h-full shrink-0 bg-surface-container-lowest">
        <div className="p-4 border-b border-brand-border space-y-3 bg-surface-container-lowest shrink-0">
          <div className="relative">
            <Input type="search"
              placeholder="Search inbox..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-outline text-[18px]">filter_list</span>
            <Select
              value={activeFilter}
              onChange={(e) => setActiveFilter(e.target.value)}
              className="flex-1 text-xs"
              aria-label="Filter notifications"
            >
              {FILTERS.map(f => (
                <option key={f.id} value={f.id}>
                  {f.label}{filterCounts[f.id] > 0 ? ` (${filterCounts[f.id]})` : ''}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex justify-between items-center px-0.5">
            <span className="text-label-sm text-outline font-medium uppercase tracking-wider text-[11px]">
              Inbox · {filteredMessages.length}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleMarkAllRead}
              className="text-[12px] h-auto py-1 px-2 text-primary hover:bg-primary/10"
            >
              Mark all read
            </Button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto bg-surface-container-lowest">
          {filteredMessages.length === 0 ? (
            <div className="p-8 text-center text-outline flex flex-col items-center">
              <span className="material-symbols-outlined text-[32px] mb-2 opacity-50">inbox_customize</span>
              <p className="text-body-sm font-medium text-brand-slate">Nothing found</p>
              <p className="text-[12px] mt-1 max-w-[200px]">No messages match your search criteria.</p>
            </div>
          ) : (
            <ul className="divide-y divide-brand-border">
              {filteredMessages.map(msg => {
                const dateStr = formatDateShort(msg.timestamp);
                const isSelected = selectedMessage?.id === msg.id;
                const iconConfig = getIconForSubject(msg.subject);

                return (
                  <li
                    key={msg.id}
                    onClick={() => handleSelectMessage(msg.id)}
                    className={`px-4 py-3.5 cursor-pointer transition-colors flex gap-3 border-l-[3px] ${
                      isSelected ? 'bg-primary/5 border-primary' : 'border-transparent hover:bg-brand-row-hover'
                    }`}
                  >
                    <div className={`mt-0.5 shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${iconConfig.bg} ${iconConfig.color}`}>
                      <span className="material-symbols-outlined text-[18px]">{iconConfig.icon}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-baseline gap-2 mb-0.5">
                        <h4 className={`text-body-sm truncate ${!msg.read ? 'font-semibold text-brand-slate' : 'font-medium text-on-surface-variant'}`}>
                          {msg.subject}
                        </h4>
                        <span className="text-[11px] text-outline whitespace-nowrap flex items-center gap-1.5 shrink-0">
                          {!msg.read && <span className="w-2 h-2 rounded-full bg-primary" />}
                          {dateStr}
                        </span>
                      </div>
                      <p className="text-xs text-outline line-clamp-2 leading-relaxed">{msg.body.replace(/\s+/g, ' ').trim()}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      {/* Right Reading Pane */}
      <div className="flex-1 flex flex-col h-1/2 md:h-full bg-surface-container-lowest relative overflow-y-auto">
        {selectedMessage ? (
          <div className="flex-1 p-5 md:p-8 animate-in fade-in max-w-[800px] mx-auto w-full">
            <div className="mb-6 border border-brand-border rounded-xl bg-white overflow-hidden shadow-sm">
              <div className="bg-brand-table-header px-5 py-4 border-b border-brand-border flex items-start gap-3.5">
                {(() => {
                  const iconConfig = getIconForSubject(selectedMessage.subject);
                  return (
                    <div className={`mt-0.5 shrink-0 w-9 h-9 rounded-full flex items-center justify-center ${iconConfig.bg} ${iconConfig.color}`}>
                      <span className="material-symbols-outlined text-[20px]">{iconConfig.icon}</span>
                    </div>
                  );
                })()}
                <div className="flex-1 min-w-0">
                  <h2 className="text-headline-sm text-base md:text-lg font-semibold text-brand-slate mb-2">{selectedMessage.subject}</h2>
                  <div className="text-xs text-outline space-y-1">
                    <div className="flex">
                      <span className="w-12 inline-block text-on-surface-variant font-medium">From:</span>
                      <span className="truncate text-brand-slate font-medium">{selectedMessage.from}</span>
                    </div>
                    <div className="flex">
                      <span className="w-12 inline-block text-on-surface-variant font-medium">Sent:</span>
                      <span>{formatFullDateTime(selectedMessage.timestamp)}</span>
                    </div>
                    <div className="flex">
                      <span className="w-12 inline-block text-on-surface-variant font-medium">To:</span>
                      <span className="truncate">{selectedMessage.to}</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="p-5 md:p-7 bg-white text-on-surface-variant">
                <div className="text-sm md:text-body-base whitespace-pre-wrap leading-relaxed text-on-surface">
                  {selectedMessage.body}
                </div>

                {relatedClaim && (
                  <div className="mt-6 pt-5 border-t border-brand-border flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <span className="text-xs text-on-surface-variant">Related Reference: </span>
                      <span className="text-xs font-semibold text-brand-slate">{relatedClaim.ref}</span>
                      <span className="ml-2 text-xs text-outline capitalize">({relatedClaim.type})</span>
                    </div>
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => {
                        if (isModal && onCloseModal) onCloseModal();
                        navigate(`/claims/${relatedClaim.id}`);
                      }}
                      className="gap-1.5"
                    >
                      <span className="material-symbols-outlined text-[16px]">open_in_new</span>
                      View Request
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-outline p-8 text-center bg-surface-container-low/30">
            <span className="material-symbols-outlined text-[48px] mb-3 opacity-20">mail</span>
            <p className="text-body-base font-medium">Select a message</p>
            <p className="text-xs mt-1">Choose a notification from the inbox to read.</p>
          </div>
        )}
      </div>
    </div>
  );
}
