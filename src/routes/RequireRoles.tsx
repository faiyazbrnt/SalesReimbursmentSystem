import { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAppContext } from '../components/AppContext';
import { UserRole } from '../types';

export function RequireRoles({ roles, children }: { roles: UserRole[]; children: ReactNode }) {
  const { currentUser } = useAppContext();
  const location = useLocation();
  if (roles.includes(currentUser.role)) return <>{children}</>;

  return <Navigate to={{ pathname: '/', search: location.search, hash: location.hash }} replace />;
}
