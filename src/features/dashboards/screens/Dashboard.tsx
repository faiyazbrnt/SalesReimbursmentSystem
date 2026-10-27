import { lazy } from 'react';
import { useAppContext } from '../../../components/AppContext';
import { UserRole } from '../../../types';

const RequestorDashboard = lazy(() => import('../../claims/screens/RequestorDashboard').then(module => ({ default: module.RequestorDashboard })));
const ApproverDashboard = lazy(() => import('../../approvals/screens/ApproverDashboard').then(module => ({ default: module.ApproverDashboard })));
const CustodianDashboard = lazy(() => import('../../disbursements/screens/CustodianDashboard').then(module => ({ default: module.CustodianDashboard })));

export function Dashboard() {
  const { currentUser } = useAppContext();

  switch (currentUser.role) {
    case UserRole.REQUESTOR:
      return <RequestorDashboard />;
    case UserRole.APPROVER:
      return <ApproverDashboard />;
    case UserRole.CUSTODIAN:
      return <CustodianDashboard />;
    default:
      return <div>Unknown Role</div>;
  }
}
