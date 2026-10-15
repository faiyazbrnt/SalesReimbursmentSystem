import Image from 'next/image';
import { useEffect, useRef } from 'react';
import { NavLink } from 'react-router-dom';
import { cn } from '../ui/Button';
import { useAppContext } from '../AppContext';
import { ClaimStatus, DelegationStatus, UserRole } from '../../types';
import { isCustodianProcessingClaim } from '@/features/claims';

const FOCUSABLE_SELECTOR = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** badgeKey ties a nav item to one of the live counts computed in Sidebar()
 *  below — new items on a queue, or unread mail, previously had no on-screen
 *  indicator at all (you had to open the page to find out). */
interface NavItem {
  label: string;
  icon: string;
  path: string;
  section: string;
  badgeKey?: 'notifications' | 'approvals' | 'processing' | 'readyToClaim' | 'delegation';
}

const getNavItems = (role: UserRole): NavItem[] => {
  const common: NavItem[] = [
    { label: 'Dashboard', icon: 'dashboard', path: '/', section: 'Overview' },
  ];

    if (role === UserRole.REQUESTOR) {
    return [
      ...common,
      { label: 'My Requests', icon: 'description', path: '/claims', section: 'Claims' },
      { label: 'Payouts', icon: 'key', path: '/payouts', section: 'Claims' },
      { label: 'Expenses & Receipts', icon: 'receipt_long', path: '/receipts', section: 'Claims' },
      { label: 'Minutes & Agreements', icon: 'meeting_room', path: '/moms', section: 'Meetings' },
      { label: 'Calendar', icon: 'calendar_month', path: '/calendar', section: 'Meetings' },
    ];
  }

  if (role === UserRole.APPROVER) {
    return [
      ...common,
      { label: 'My Requests', icon: 'description', path: '/claims', section: 'Claims' },
      { label: 'Payouts', icon: 'key', path: '/payouts', section: 'Claims' },
      { label: 'Expenses & Receipts', icon: 'receipt_long', path: '/receipts', section: 'Claims' },
      { label: 'Approvals', icon: 'assignment_turned_in', path: '/approvals', section: 'Review', badgeKey: 'approvals' },
      { label: 'Minutes & Agreements', icon: 'meeting_room', path: '/moms', section: 'Meetings' },
      { label: 'Calendar', icon: 'calendar_month', path: '/calendar', section: 'Meetings' },
    ];
  }

  if (role === UserRole.CUSTODIAN) {
    return [
      ...common,
      { label: 'Processing Queue', icon: 'payments', path: '/disbursements', section: 'Operations', badgeKey: 'processing' },
      { label: 'Ready to Claim', icon: 'outbox', path: '/ready-to-claim', section: 'Operations', badgeKey: 'readyToClaim' },
      { label: 'Transaction History', icon: 'history', path: '/transactions', section: 'Operations' },
      { label: 'Analytics', icon: 'monitoring', path: '/custodian/analytics', section: 'Insights' },
    ];
  }

  if (role === UserRole.FINANCE) {
    return [
      ...common,
      { label: 'Approved Records', icon: 'description', path: '/claims', section: 'Financials' },
      { label: 'Financial Receipts', icon: 'receipt_long', path: '/receipts', section: 'Financials' },
      { label: 'Paid & Completed', icon: 'history', path: '/transactions', section: 'Financials' },
      { label: 'Analytics', icon: 'monitoring', path: '/finance/analytics', section: 'Insights' },
    ];
  }

  if (role === UserRole.ADMIN) {
    return [
      ...common,
      { label: 'User Accounts', icon: 'people', path: '/admin/users', section: 'Administration' },
      { label: 'Company Directory', icon: 'business', path: '/admin/companies', section: 'Administration' },
      { label: 'Historical Import', icon: 'upload_file', path: '/admin/import', section: 'Administration' },
      { label: 'Admin Reporting', icon: 'bar_chart', path: '/admin/reports', section: 'Reporting' },
      { label: 'System Activity', icon: 'manage_history', path: '/admin/activity', section: 'Reporting' },
    ];
  }

  return common;
};

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
}

export function Sidebar({ isOpen, onClose, isCollapsed = false, onToggleCollapse }: SidebarProps) {
  const { currentUser, claims, emails, delegations } = useAppContext();
  const navItems = getNavItems(currentUser.role);
  const sidebarRef = useRef<HTMLElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!isOpen) return;

    const mobileBreakpoint = window.matchMedia('(max-width: 1023px)');
    const sidebar = sidebarRef.current;
    if (!mobileBreakpoint.matches || !sidebar) return;

    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const getFocusableElements = () => Array.from(sidebar.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
      .filter(element => element.getClientRects().length > 0 && element.getAttribute('aria-hidden') !== 'true');
    const focusFrame = window.requestAnimationFrame(() => getFocusableElements()[0]?.focus());

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab') return;

      const focusableElements = getFocusableElements();
      const first = focusableElements[0];
      const last = focusableElements[focusableElements.length - 1];
      if (!first || !last) {
        event.preventDefault();
        sidebar.focus();
      } else if (event.shiftKey && (document.activeElement === first || !sidebar.contains(document.activeElement))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !sidebar.contains(document.activeElement))) {
        event.preventDefault();
        first.focus();
      }
    };
    const handleBreakpointChange = (event: MediaQueryListEvent) => {
      if (!event.matches) onCloseRef.current();
    };

    document.addEventListener('keydown', handleKeyDown);
    mobileBreakpoint.addEventListener('change', handleBreakpointChange);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener('keydown', handleKeyDown);
      mobileBreakpoint.removeEventListener('change', handleBreakpointChange);
      const returnTarget = previouslyFocused?.getClientRects().length
        ? previouslyFocused
        : sidebar.querySelector<HTMLElement>('a[aria-current="page"]');
      if (returnTarget?.isConnected) returnTarget.focus();
    };
  }, [isOpen]);

  // `claims` already arrives pre-scoped to this user's role from the server
  // (an approver's queue, a custodian's queue, etc.) — see AppContext/api.ts —
  // so these are just status counts over what the user can already see.
  const badgeCounts: Record<string, number> = {
    notifications: emails.filter(e => e.recipientId === currentUser.id && !e.read).length,
    approvals: claims.filter(c => c.status === ClaimStatus.PENDING_APPROVAL || c.status === ClaimStatus.SUBMITTED).length,
    processing: claims.filter(isCustodianProcessingClaim).length,
    readyToClaim: claims.filter(c => c.status === ClaimStatus.READY_FOR_CLAIM).length,
    // Incoming delegation requests waiting on this user to accept/decline —
    // previously buried in a Settings tab with zero indication anything
    // needed attention.
    delegation: delegations.filter(d => d.delegate_id === currentUser.id && d.status === DelegationStatus.PENDING).length,
  };

  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-scrim/40 backdrop-blur-sm z-20 lg:hidden transition-all duration-300 ease-in-out" 
          onClick={onClose}
        />
      )}
      
      <aside 
        ref={sidebarRef}
        id="sidebar-navigation"
        role={isOpen ? 'dialog' : undefined}
        aria-label="Main navigation"
        aria-modal={isOpen ? true : undefined}
        tabIndex={-1}
        className={cn(
          "flex flex-col h-screen pb-6 bg-gradient-to-b from-[#0a2540] to-primary fixed left-0 top-0 z-30 transition-all duration-300 ease-[cubic-bezier(0.2,0,0,1)] shadow-[4px_0_24px_rgba(0,0,0,0.15)]",
          isCollapsed ? "w-[220px] lg:w-[80px]" : "w-[220px] lg:w-[220px]",
          isOpen ? "translate-x-0 visible" : "-translate-x-full invisible lg:translate-x-0 lg:visible"
        )}
      >
        {/* Header with Logo and Mobile Close control */}
        <div className={cn(
          "h-[64px] shrink-0 flex items-center justify-center relative mb-4 transition-all duration-300 ease-[cubic-bezier(0.2,0,0,1)]",
          isCollapsed ? "px-2" : "px-4"
        )}>
          <div className="relative flex items-center justify-center w-full h-12">
            {/* Collapsed Saturn icon */}
            <div className={cn(
              "transition-opacity duration-300 ease-[cubic-bezier(0.2,0,0,1)] flex items-center justify-center absolute",
              isCollapsed 
                ? "opacity-0 lg:opacity-100 pointer-events-none lg:pointer-events-auto" 
                : "opacity-0 pointer-events-none"
            )}>
              <Image 
                src="/logo-icon.png"
                alt="Microgenesis" 
                priority
                width={48}
                height={48}
                className="w-12 h-12 object-contain"
              />
            </div>

            {/* Expanded Full Logo */}
            <div className={cn(
              "transition-opacity duration-300 ease-[cubic-bezier(0.2,0,0,1)] flex items-center justify-center absolute",
              isCollapsed 
                ? "opacity-100 lg:opacity-0 pointer-events-auto lg:pointer-events-none" 
                : "opacity-100 pointer-events-auto"
            )}>
              <Image 
                src="/logo/logo.png"
                alt="Microgenesis" 
                priority
                width={160}
                height={42}
                className="h-10 w-auto max-w-[172px] object-contain"
              />
            </div>
          </div>

          {/* Mobile Close Button */}
          <button 
            type="button"
            aria-label="Close sidebar" 
            className="lg:hidden absolute right-4 text-white/90 hover:text-white focus:ring-2 focus:ring-white focus-visible:outline-none rounded p-1 cursor-pointer" 
            onClick={onClose}
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        {/* Desktop Circular Collapse Toggle Button on Sidebar Right Edge */}
        {onToggleCollapse && (
          <button 
            type="button"
            onClick={onToggleCollapse}
            aria-expanded={!isCollapsed}
            aria-controls="sidebar-navigation"
            aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            className="hidden lg:flex items-center justify-center w-8 h-8 rounded-full bg-white text-primary shadow-lg hover:bg-slate-50 hover:scale-110 active:scale-95 border border-blue-200 transition-all duration-200 absolute -right-4 top-1/2 -translate-y-1/2 z-40 focus-visible:outline-none focus:ring-2 focus:ring-primary cursor-pointer select-none"
            title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            <span className={cn(
              "material-symbols-outlined text-[20px] font-bold transition-transform duration-300 ease-[cubic-bezier(0.2,0,0,1)] select-none",
              isCollapsed ? "rotate-180" : "rotate-0"
            )}>
              chevron_left
            </span>
          </button>
        )}
        
        {/* Navigation List */}
        <nav className="sidebar-navigation min-h-0 flex-1 space-y-1 overflow-y-auto px-0">
          {navItems.map((item, index) => {
            const count = item.badgeKey ? badgeCounts[item.badgeKey] || 0 : 0;
            const to = item.badgeKey === 'delegation' && count > 0 ? `${item.path}?tab=delegation` : item.path;
            const startsSection = index === 0 || navItems[index - 1].section !== item.section;
            return (
              <div
                key={item.path}
                className={cn(startsSection && index > 0 ? "mt-3 pt-3 border-t border-white/15" : "")}
              >
              {startsSection && (
                <div className={cn(
                  "overflow-hidden transition-all duration-300 ease-[cubic-bezier(0.2,0,0,1)]",
                  isCollapsed ? "lg:max-h-0 lg:opacity-0" : "max-h-8 opacity-100"
                )}>
                  <p className="px-5 pb-1 text-[10px] font-bold uppercase tracking-[0.14em] text-white/55 whitespace-nowrap">
                    {item.section}
                  </p>
                </div>
              )}
              <NavLink
                to={to}
                onClick={() => onClose()}
                title={count > 0 ? `${item.label} (${count})` : item.label}
                className={({ isActive }) => cn(
                  "flex items-center h-12 group transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-inset outline-none relative overflow-hidden",
                  isActive
                    ? "text-white font-bold border-l-4 border-white bg-black/15 shadow-inner"
                    : "text-white/90 font-medium hover:bg-white/15 hover:text-white border-l-4 border-transparent"
                )}
              >
                {/* Icon wrapper - centered in collapsed rail */}
                <div className={cn(
                  "shrink-0 flex items-center justify-center transition-all duration-300 ease-[cubic-bezier(0.2,0,0,1)]",
                  isCollapsed ? "w-[56px] lg:w-[76px]" : "w-[56px]"
                )}>
                  <span className="relative flex items-center justify-center">
                    <span className="material-symbols-outlined text-[24px]">
                      {item.icon}
                    </span>
                    {count > 0 && (
                      <span className={cn(
                        "hidden lg:flex absolute -top-1 -right-1 min-w-[8px] h-2 w-2 rounded-full bg-error ring-2 ring-primary transition-all duration-300 ease-[cubic-bezier(0.2,0,0,1)]",
                        isCollapsed ? "scale-100 opacity-100" : "scale-0 opacity-0 pointer-events-none"
                      )} />
                    )}
                  </span>
                </div>

                {/* Text Label & Badge */}
                <div className={cn(
                  "flex items-center gap-2 flex-1 min-w-0 pr-3 overflow-hidden transition-all duration-300 ease-[cubic-bezier(0.2,0,0,1)] whitespace-nowrap",
                  isCollapsed 
                    ? "lg:max-w-0 lg:opacity-0 lg:-translate-x-2 lg:pointer-events-none max-w-[155px] opacity-100 translate-x-0" 
                    : "max-w-[155px] opacity-100 translate-x-0"
                )}>
                  <span className="truncate min-w-0 flex-1 font-body-base text-body-base">{item.label}</span>
                  {count > 0 && (
                    <span className="shrink-0 min-w-[22px] h-5 px-1.5 rounded-full bg-white/90 text-primary text-[11px] font-bold flex items-center justify-center shadow-sm">
                      {count > 99 ? '99+' : count}
                    </span>
                  )}
                </div>
              </NavLink>
              </div>
            );
          })}
        </nav>
      </aside>
    </>
  );
}
