import { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useAppContext } from '../components/AppContext';
import { UserRole } from '../types';

export function RequireRoles({ roles, children }: { roles: UserRole[]; children: ReactNode }) {
  const { currentUser } = useAppContext();
  if (roles.includes(currentUser.role)) return <>{children}</>;

  return (
    <div className="mx-auto max-w-xl p-6">
      <div className="rounded-xl border border-outline-variant bg-white p-8 text-center shadow-xs">
        <span aria-hidden="true" className="material-symbols-outlined text-[40px] text-outline">lock</span>
        <h1 className="mt-3 font-headline-md text-on-surface">This page is not available for your role</h1>
        <p className="mt-2 text-body-md text-on-surface-variant">
          Your prototype account does not have permission to open this module.
        </p>
        <Link
          to="/"
          className="mt-6 inline-flex h-10 items-center justify-center rounded-btn bg-primary px-5 font-label-md text-on-primary"
        >
          Return to dashboard
        </Link>
      </div>
    </div>
  );
}
