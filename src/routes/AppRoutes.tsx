import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAppContext } from '../components/AppContext';
import { Layout } from '../components/layout/Layout';
import { CardSkeleton } from '../components/shared/states/Skeleton';
import { UserRole } from '../types';
import { RequireRoles } from './RequireRoles';

// Route-level code-splitting: every page below Layout is its own chunk,
// fetched on first navigation rather than bundled into the initial load.
// Dashboard is the common landing page. Admin analytics is kept in its own
// chunk because its charting dependency is not needed by other roles.
const Dashboard = lazy(() => import('../features/dashboards/screens/Dashboard').then(m => ({ default: m.Dashboard })));
const AdminDashboard = lazy(() => import('../features/admin/screens/AdminDashboard').then(m => ({ default: m.AdminDashboard })));

const ClaimsList = lazy(() => import('../features/claims/screens/ClaimsList').then(m => ({ default: m.ClaimsList })));
const Payouts = lazy(() => import('../features/claims/screens/Payouts').then(m => ({ default: m.Payouts })));
const SubmitClaim = lazy(() => import('../features/claims/screens/SubmitClaim').then(m => ({ default: m.SubmitClaim })));
const ClaimDetail = lazy(() => import('../features/claims/screens/ClaimDetail').then(m => ({ default: m.ClaimDetail })));
const ApprovalQueue = lazy(() => import('../features/approvals/screens/ApprovalQueue').then(m => ({ default: m.ApprovalQueue })));
const ProcessingQueue = lazy(() => import('../features/disbursements/screens/ProcessingQueue').then(m => ({ default: m.ProcessingQueue })));
const ReadyToClaimQueue = lazy(() => import('../features/disbursements/screens/ReadyToClaimQueue').then(m => ({ default: m.ReadyToClaimQueue })));
const TransactionHistory = lazy(() => import('../features/disbursements/screens/TransactionHistory').then(m => ({ default: m.TransactionHistory })));
const CustodianAnalytics = lazy(() => import('../features/disbursements/screens/CustodianAnalytics').then(m => ({ default: m.CustodianAnalytics })));
const SystemActivity = lazy(() => import('../features/admin/screens/SystemActivity').then(m => ({ default: m.SystemActivity })));
const UserAccounts = lazy(() => import('../features/admin/screens/UserAccounts').then(m => ({ default: m.UserAccounts })));
const MOMs = lazy(() => import('../features/moms/screens/MOMs').then(m => ({ default: m.MOMs })));
const MomDetail = lazy(() => import('../features/moms/screens/MomDetail').then(m => ({ default: m.MomDetail })));
const CreateMom = lazy(() => import('../features/moms/screens/CreateMom').then(m => ({ default: m.CreateMom })));
const Calendar = lazy(() => import('../features/review-meetings/screens/Calendar').then(m => ({ default: m.Calendar })));
const Settings = lazy(() => import('../features/users/screens/Settings').then(m => ({ default: m.Settings })));
const Support = lazy(() => import('../features/support/screens/Support').then(m => ({ default: m.Support })));
const Notifications = lazy(() => import('../features/activity/screens/Notifications').then(m => ({ default: m.Notifications })));
const CompanyDirectory = lazy(() => import('../features/admin/screens/CompanyDirectory').then(m => ({ default: m.CompanyDirectory })));
const Receipts = lazy(() => import('../features/claims/screens/Receipts').then(m => ({ default: m.Receipts })));
const AdminReporting = lazy(() => import('../features/admin/screens/AdminReporting').then(m => ({ default: m.AdminReporting })));
const FinancialOverview = lazy(() => import('../features/analytics/screens/FinancialOverview').then(m => ({ default: m.FinancialOverview })));
const FinancialAnalytics = lazy(() => import('../features/admin/screens/AdminReporting').then(m => ({ default: m.FinancialAnalytics })));
const HistoricalImport = lazy(() => import('../features/admin/screens/HistoricalImport').then(m => ({ default: m.HistoricalImport })));

function RouteFallback() {
  return (
    <div className="p-6">
      <CardSkeleton />
    </div>
  );
}

export function AppRoutes() {
  const { currentUser } = useAppContext();
  const requestRoles = [UserRole.REQUESTOR, UserRole.APPROVER];
  const receiptRoles = [UserRole.REQUESTOR, UserRole.APPROVER];
  const claimDetailRoles = [UserRole.REQUESTOR, UserRole.APPROVER, UserRole.CUSTODIAN, UserRole.ADMIN];

  return (
    <Suspense fallback={<RouteFallback />}>
      <Routes>
        <Route element={<Layout />}>
          {currentUser.role === UserRole.ADMIN ? (
            <Route path="/" element={<AdminDashboard />} />
          ) : (
            <Route path="/" element={<Dashboard />} />
          )}

          {/* Requestor / General */}
          <Route path="/claims" element={<RequireRoles roles={requestRoles}><ClaimsList /></RequireRoles>} />
          <Route path="/payouts" element={<RequireRoles roles={requestRoles}><Payouts /></RequireRoles>} />
          <Route path="/claims/new" element={<RequireRoles roles={requestRoles}><SubmitClaim /></RequireRoles>} />
          <Route path="/claims/:id" element={<RequireRoles roles={claimDetailRoles}><ClaimDetail /></RequireRoles>} />
          <Route path="/moms" element={<RequireRoles roles={requestRoles}><MOMs /></RequireRoles>} />
          <Route path="/moms/new" element={<RequireRoles roles={requestRoles}><CreateMom /></RequireRoles>} />
          <Route path="/moms/:id/edit" element={<RequireRoles roles={requestRoles}><CreateMom /></RequireRoles>} />
          <Route path="/moms/:id" element={<RequireRoles roles={requestRoles}><MomDetail /></RequireRoles>} />
          <Route path="/receipts" element={<RequireRoles roles={receiptRoles}><Receipts /></RequireRoles>} />

          {/* Shared */}
          <Route path="/calendar" element={<RequireRoles roles={requestRoles}><Calendar /></RequireRoles>} />
          <Route path="/support" element={<Support />} />
          <Route path="/notifications" element={<Notifications />} />
          <Route path="/settings" element={<Settings />} />

          {/* Approver */}
          <Route path="/approvals" element={<RequireRoles roles={[UserRole.APPROVER]}><ApprovalQueue /></RequireRoles>} />

          <Route path="/financials" element={<RequireRoles roles={[UserRole.APPROVER]}><FinancialOverview /></RequireRoles>} />
          <Route path="/financials/records" element={<RequireRoles roles={[UserRole.APPROVER]}><ClaimsList key="financial-records" financialView /></RequireRoles>} />
          <Route path="/financials/receipts" element={<RequireRoles roles={[UserRole.APPROVER]}><Receipts key="financial-receipts" financialView /></RequireRoles>} />
          <Route path="/financials/analytics" element={<RequireRoles roles={[UserRole.APPROVER]}><FinancialAnalytics /></RequireRoles>} />

          {/* Custodian */}
          <Route path="/disbursements" element={<RequireRoles roles={[UserRole.CUSTODIAN]}><ProcessingQueue /></RequireRoles>} />
          <Route path="/ready-to-claim" element={<RequireRoles roles={[UserRole.CUSTODIAN]}><ReadyToClaimQueue /></RequireRoles>} />
          <Route path="/transactions" element={<RequireRoles roles={[UserRole.CUSTODIAN, UserRole.APPROVER]}><TransactionHistory /></RequireRoles>} />
          <Route path="/custodian/analytics" element={<RequireRoles roles={[UserRole.CUSTODIAN]}><CustodianAnalytics /></RequireRoles>} />

          {/* Admin */}
          <Route path="/admin/users" element={<RequireRoles roles={[UserRole.ADMIN]}><UserAccounts /></RequireRoles>} />
          <Route path="/admin/companies" element={<RequireRoles roles={[UserRole.ADMIN]}><CompanyDirectory /></RequireRoles>} />
          <Route path="/admin/import" element={<RequireRoles roles={[UserRole.ADMIN]}><HistoricalImport /></RequireRoles>} />
          <Route path="/admin/reports" element={<RequireRoles roles={[UserRole.ADMIN]}><AdminReporting /></RequireRoles>} />
          <Route path="/admin/activity" element={<RequireRoles roles={[UserRole.ADMIN]}><SystemActivity /></RequireRoles>} />
          <Route path="/admin/audit" element={<RequireRoles roles={[UserRole.ADMIN]}><Navigate to="/admin/activity?tab=audit" replace /></RequireRoles>} />
          <Route path="/admin/emails" element={<RequireRoles roles={[UserRole.ADMIN]}><Navigate to="/admin/activity?tab=messages" replace /></RequireRoles>} />

          {/* Catch all */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </Suspense>
  );
}
