import { useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { ErrorBoundary } from '../shared/ErrorBoundary';

const getInitialCollapsed = (): boolean => {
  if (typeof document === 'undefined') return false;
  const match = document.cookie.match(/(?:^|; )sidebar_collapsed=([^;]*)/);
  return match ? match[1] === 'true' : false;
};

export function Layout() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState<boolean>(getInitialCollapsed);
  const location = useLocation();

  const handleToggleCollapse = () => {
    setIsCollapsed(prev => {
      const next = !prev;
      if (typeof document !== 'undefined') {
        document.cookie = `sidebar_collapsed=${next}; path=/; max-age=31536000; SameSite=Lax`;
      }
      return next;
    });
  };

  return (
    <div className="min-h-screen bg-background text-on-surface">
      <Sidebar
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
        isCollapsed={isCollapsed}
        onToggleCollapse={handleToggleCollapse}
      />
      <Topbar
        onMenuClick={() => setIsSidebarOpen(true)}
        isSidebarOpen={isSidebarOpen}
        isCollapsed={isCollapsed}
      />
      <main className={`pt-[64px] min-h-screen transition-all duration-300 ease-[cubic-bezier(0.2,0,0,1)] ${isCollapsed ? 'lg:pl-[80px]' : 'lg:pl-[220px]'}`}>
        <div className="max-w-[1728px] mx-auto p-4 sm:p-6 lg:p-8 transition-all duration-300 ease-in-out">
          {/* Keyed by pathname so navigating away from a broken page recovers
              the boundary automatically, without losing the sidebar/topbar. */}
          <ErrorBoundary key={location.pathname}>
            <Outlet />
          </ErrorBoundary>
        </div>
      </main>
    </div>
  );
}
