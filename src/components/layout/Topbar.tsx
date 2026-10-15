import { useState, useRef, useEffect } from 'react';
import { useAppContext } from '../AppContext';
import { useNavigate } from 'react-router-dom';
import { logout } from '../../lib/api';
import { formatDateTime } from '../../lib/date';
import { GlobalSearch } from './GlobalSearch';
import { NotificationsModal } from '../shared/NotificationsModal';
import { getIconForSubject } from '../shared/NotificationsView';

export const SYSTEM_NAME = 'Sales Reimbursement System';

interface TopbarProps {
  onMenuClick: () => void;
  isSidebarOpen: boolean;
  isCollapsed?: boolean;
}

export function Topbar({ onMenuClick, isSidebarOpen, isCollapsed = false }: TopbarProps) {
  const { currentUser, emails, markEmailsRead } = useAppContext();
  const [showNotifications, setShowNotifications] = useState(false);
  const [showNotificationsModal, setShowNotificationsModal] = useState(false);
  const [selectedModalNotificationId, setSelectedModalNotificationId] = useState<string | null>(null);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const notificationsRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  // The bell shows this user's own emails. Admin's outbox is everyone's, so
  // scope to the current user either way.
  const userNotifications = emails
    .filter(e => e.recipientId === currentUser.id)
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, 30);
  const unreadCount = userNotifications.filter(n => !n.read).length;

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (notificationsRef.current && !notificationsRef.current.contains(event.target as Node)) {
        setShowNotifications(false);
      }
      if (profileRef.current && !profileRef.current.contains(event.target as Node)) {
        setShowProfileMenu(false);
      }
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setShowNotifications(false);
        setShowProfileMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, []);

  const handleSignOut = () => {
    setShowProfileMenu(false);
    logout();
    window.location.href = '/';
  };

  const handleMarkAllRead = () => {
    const unreadIds = emails.filter(e => e.recipientId === currentUser.id && !e.read).map(e => e.id);
    if (unreadIds.length > 0) {
      markEmailsRead(unreadIds);
    }
  };

  return (
    <header className={`h-[64px] fixed top-0 right-0 left-0 flex justify-between items-center px-4 sm:px-6 bg-white/80 backdrop-blur-md border-b border-outline-variant/50 shadow-[0_2px_10px_rgba(15,23,42,0.03)] z-10 transition-all duration-300 ease-[cubic-bezier(0.2,0,0,1)] ${isCollapsed ? 'lg:left-[80px]' : 'lg:left-[220px]'}`}>
      <div className="flex min-w-0 flex-1 items-center gap-3 sm:gap-4">
        <button 
          type="button"
          aria-label="Open main navigation"
          aria-controls="sidebar-navigation"
          aria-expanded={isSidebarOpen}
          className="lg:hidden p-2 text-on-surface-variant hover:bg-surface-container-high rounded-full focus:ring-2 focus:ring-primary focus-visible:outline-none transition-colors"
          onClick={onMenuClick}
        >
          <span className="material-symbols-outlined">menu</span>
        </button>
        <h2 className="hidden md:block shrink-0 whitespace-nowrap font-headline-md text-headline-md font-semibold text-on-surface">{SYSTEM_NAME}</h2>
        
        <GlobalSearch />
      </div>
      
      <div className="flex shrink-0 items-center gap-2 sm:gap-3 md:gap-4 ml-2 sm:ml-3 md:ml-4">
        <div className="flex items-center gap-2">
          <div className="relative" ref={notificationsRef}>
            <button 
              aria-label="View notifications"
              aria-expanded={showNotifications}
              className="relative p-2 text-on-surface-variant hover:text-primary hover:bg-surface-container-high rounded-full transition-colors focus:ring-2 focus:ring-primary focus-visible:outline-none active:opacity-70"
              onClick={() => {
                setShowNotifications(!showNotifications);
                setShowProfileMenu(false);
              }}
            >
              <span className="material-symbols-outlined">notifications</span>
              {unreadCount > 0 && (
                <span className="absolute top-0.5 right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-error text-white text-[12px] font-bold leading-4 text-center">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}
            </button>
            {showNotifications && (
              <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-surface border border-outline-variant rounded-lg shadow-lg overflow-hidden flex flex-col max-h-96 z-50">
                <div className="p-3 border-b border-outline-variant flex justify-between items-center bg-surface-container-low">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      className="font-semibold text-on-surface text-sm cursor-pointer hover:text-primary"
                      onClick={() => {
                        setShowNotifications(false);
                        setSelectedModalNotificationId(null);
                        setShowNotificationsModal(true);
                      }}
                    >
                      Notifications
                    </button>
                    {unreadCount > 0 && (
                      <span className="px-1.5 py-0.2 rounded-full bg-error/10 text-error text-[11px] font-bold">
                        {unreadCount}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      disabled={unreadCount === 0}
                      onClick={handleMarkAllRead}
                      className={`text-xs font-medium transition-colors ${
                        unreadCount > 0
                          ? 'text-primary hover:underline cursor-pointer'
                          : 'text-on-surface-variant/40 cursor-default'
                      }`}
                      title={unreadCount > 0 ? "Mark all unread notifications as read" : "No unread notifications"}
                    >
                      Mark all read
                    </button>
                    {currentUser.role === 'Admin' && (
                      <button onClick={() => { setShowNotifications(false); navigate('/admin/activity?tab=messages'); }} className="text-xs text-primary hover:underline">System Activity</button>
                    )}
                  </div>
                </div>
                <div className="overflow-y-auto flex-1 p-2 space-y-1">
                  {userNotifications.length === 0 ? (
                    <p className="p-4 text-center text-sm text-on-surface-variant">No notifications.</p>
                  ) : (
                    userNotifications.map(notif => {
                      const iconConfig = getIconForSubject(notif.subject);
                      const bodySnippet = notif.body
                        ? notif.body.replace(/\s+/g, ' ').trim()
                        : '';

                      return (
                        <div
                          key={notif.id}
                          className={`p-3 text-sm rounded-lg cursor-pointer transition-colors flex gap-3 ${
                            notif.read
                              ? 'bg-transparent hover:bg-surface-container'
                              : 'bg-primary-container/20 hover:bg-primary-container/30'
                          }`}
                          onClick={() => {
                            if (!notif.read) markEmailsRead([notif.id]);
                            setShowNotifications(false);
                            setSelectedModalNotificationId(notif.id);
                            setShowNotificationsModal(true);
                          }}
                        >
                          <div className={`mt-0.5 shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${iconConfig.bg} ${iconConfig.color}`}>
                            <span className="material-symbols-outlined text-[18px]">{iconConfig.icon}</span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex justify-between items-baseline gap-2 mb-0.5">
                              <p className={`truncate text-xs sm:text-sm ${notif.read ? 'text-on-surface font-medium' : 'font-semibold text-on-surface'}`}>
                                {notif.subject || 'Notification'}
                              </p>
                              {!notif.read && (
                                <span className="w-2 h-2 rounded-full bg-primary shrink-0" />
                              )}
                            </div>
                            {bodySnippet && (
                              <p className="text-xs text-on-surface-variant line-clamp-1 mb-1">
                                {bodySnippet}
                              </p>
                            )}
                            <p className="text-[11px] text-outline">{formatDateTime(notif.timestamp)}</p>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
                <div className="p-2 border-t border-outline-variant bg-surface-container-lowest text-center">
                  <button 
                    type="button"
                    onClick={() => {
                      setShowNotifications(false);
                      setSelectedModalNotificationId(null);
                      setShowNotificationsModal(true);
                    }}
                    className="text-sm font-medium text-primary hover:underline cursor-pointer"
                  >
                    View All Notifications
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
        
        <div className="h-8 w-px bg-outline-variant hidden md:block"></div>

        <div className="relative shrink-0" ref={profileRef}>
          <button
            type="button"
            aria-label={`Open account menu for ${currentUser.name}`}
            aria-haspopup="menu"
            aria-expanded={showProfileMenu}
            className="flex items-center gap-2.5 rounded-xl px-3 py-1.5 text-left transition-all duration-150 hover:bg-surface-container-high focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary cursor-pointer select-none"
            onClick={() => {
              setShowProfileMenu(!showProfileMenu);
              setShowNotifications(false);
            }}
          >
            <span className="hidden lg:block max-w-[260px] 2xl:max-w-[320px] text-right">
              <span className="block truncate font-label-md text-label-md text-on-surface" title={currentUser.name}>{currentUser.name}</span>
              <span className="block text-[11px] font-semibold uppercase tracking-wider text-outline">{currentUser.role}</span>
            </span>
            {currentUser.avatarUrl ? (
              <img src={currentUser.avatarUrl} alt="" loading="lazy" width="36" height="36" className="h-9 w-9 rounded-full border-2 border-outline-variant object-cover shrink-0" />
            ) : (
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-secondary-container font-bold text-on-secondary-container font-label-md shrink-0">
                {currentUser.name.split(' ').map(n => n[0]).join('')}
              </span>
            )}
            <span aria-hidden="true" className={`hidden sm:block material-symbols-outlined text-[18px] text-outline transition-transform shrink-0 ${showProfileMenu ? 'rotate-180' : ''}`}>expand_more</span>
          </button>

          {showProfileMenu && (
            <div role="menu" className="absolute right-0 mt-2 w-64 overflow-hidden rounded-lg border border-outline-variant bg-surface shadow-lg">
              <div className="border-b border-outline-variant px-4 py-3">
                <p className="truncate font-label-md text-on-surface">{currentUser.name}</p>
                <p className="mt-0.5 truncate text-xs text-on-surface-variant">{currentUser.email}</p>
                <span className="mt-2 inline-flex rounded-full bg-secondary-container px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-on-secondary-container">
                  {currentUser.role}
                </span>
              </div>
              <div className="p-1.5 space-y-0.5">
                <button
                  type="button"
                  role="menuitem"
                  className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm text-on-surface transition-colors hover:bg-surface-container-high focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  onClick={() => {
                    setShowProfileMenu(false);
                    navigate('/settings');
                  }}
                >
                  <span aria-hidden="true" className="material-symbols-outlined text-[19px] text-on-surface-variant">manage_accounts</span>
                  Account settings
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm text-on-surface transition-colors hover:bg-surface-container-high focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  onClick={() => {
                    setShowProfileMenu(false);
                    navigate('/support');
                  }}
                >
                  <span aria-hidden="true" className="material-symbols-outlined text-[19px] text-on-surface-variant">help</span>
                  Support
                </button>
              </div>
              <div className="border-t border-outline-variant p-1.5">
                <button
                  type="button"
                  role="menuitem"
                  className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-error transition-colors hover:bg-error-container/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-error"
                  onClick={handleSignOut}
                >
                  <span aria-hidden="true" className="material-symbols-outlined text-[19px]">logout</span>
                  Sign out
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <NotificationsModal
        isOpen={showNotificationsModal}
        onClose={() => setShowNotificationsModal(false)}
        initialSelectedId={selectedModalNotificationId}
      />
    </header>
  );
}
