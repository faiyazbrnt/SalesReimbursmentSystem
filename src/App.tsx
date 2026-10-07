'use client';

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState, type ReactNode } from 'react';
import { createBrowserRouter, Navigate, RouterProvider, useLocation } from 'react-router-dom';
import { AppProvider, useAppContext } from './components/AppContext';
import { ToastProvider } from './components/shared/ToastContext';
import { ErrorBoundary } from './components/shared/ErrorBoundary';
import { Login } from './features/auth/screens';
import { isLoggedIn, applyDeepLinkLogin } from './lib/api';
import { AppRoutes } from './routes';
import { canonicalRoleUrl, rolePath, roleToSlug } from './routes/rolePaths';

// A route that throws shouldn't white-screen the whole app, and navigating
// away from the broken page should recover automatically — keying the
// boundary by pathname remounts it (and clears the error) on every nav.
function RouteErrorBoundary({ children }: { children: ReactNode }) {
  const location = useLocation();
  return <ErrorBoundary key={location.pathname}>{children}</ErrorBoundary>;
}

function RoleRouter({ role, landingAfterLogin, onLandingComplete }: {
  role: string;
  landingAfterLogin: boolean;
  onLandingComplete: () => void;
}) {
  const [router] = useState(() => {
    const url = new URL(window.location.href);
    const canonicalUrl = canonicalRoleUrl(
      url.pathname,
      url.search,
      url.hash,
      role,
      landingAfterLogin,
    );

    if (canonicalUrl) {
      const currentUrl = `${url.pathname}${url.search}${url.hash}`;
      if (canonicalUrl !== currentUrl) window.history.replaceState(window.history.state, '', canonicalUrl);
    }

    return createBrowserRouter(
      canonicalUrl === null
        ? [{ path: '*', element: <Navigate to={rolePath(role)} replace /> }]
        : [{ path: '*', element: <RouteErrorBoundary><AppRoutes /></RouteErrorBoundary> }],
      canonicalUrl === null ? undefined : { basename: `/${roleToSlug(role)}` },
    );
  });

  useEffect(() => {
    if (landingAfterLogin) onLandingComplete();
  }, [landingAfterLogin, onLandingComplete]);

  return <RouterProvider router={router} />;
}

function ApplicationRouter({ landingAfterLogin, onLandingComplete }: {
  landingAfterLogin: boolean;
  onLandingComplete: () => void;
}) {
  const { currentUser } = useAppContext();
  const roleSlug = roleToSlug(currentUser.role);
  return (
    <RoleRouter
      key={roleSlug}
      role={currentUser.role}
      landingAfterLogin={landingAfterLogin}
      onLandingComplete={onLandingComplete}
    />
  );
}

export default function App() {
  // The account-picker Login screen is the entry point in every build, dev
  // included. Identity is per-tab (sessionStorage), so each tab can be signed
  // in as a different role against the same backend. A `?role=`/`?uid=` deep
  // link signs this tab straight in — see applyDeepLinkLogin — which is what
  // lets a presenter open one tab per role in a single click each.
  const [loggedIn, setLoggedIn] = useState(() => applyDeepLinkLogin() || isLoggedIn());
  const [landingAfterLogin, setLandingAfterLogin] = useState(false);
  const isLoginPath = window.location.pathname.toLowerCase() === '/login';

  if (!loggedIn || isLoginPath) {
    return <Login onLoggedIn={() => { setLandingAfterLogin(true); setLoggedIn(true); }} />;
  }

  return (
    <AppProvider>
      <ToastProvider>
        <ApplicationRouter
          landingAfterLogin={landingAfterLogin}
          onLandingComplete={() => setLandingAfterLogin(false)}
        />
      </ToastProvider>
    </AppProvider>
  );
}
