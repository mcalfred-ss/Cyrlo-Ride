import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';

import { RequireMfaSession } from '../auth/RequireMfaSession';
import { AppShell } from '../layouts/AppShell';
import { AuthLayout } from '../layouts/AuthLayout';
import { FinanceLayout } from '../layouts/FinanceLayout';
import { AdminsPage } from '../pages/AdminsPage';
import { AshantiDistrictMapPage } from '../pages/AshantiDistrictMapPage';
import { AuditLogsPage } from '../pages/AuditLogsPage';
import { FinanceCasesPage } from '../pages/finance/FinanceCasesPage';
import { FinanceHubPage } from '../pages/finance/FinanceHubPage';
import { FinanceLedgersPage } from '../pages/finance/FinanceLedgersPage';
import { FinancePackagesPage } from '../pages/finance/FinancePackagesPage';
import { FinancePurchasesPage } from '../pages/finance/FinancePurchasesPage';
import { FinanceRefundsPage } from '../pages/finance/FinanceRefundsPage';
import { ForbiddenPage } from '../pages/ForbiddenPage';
import { GeoPage } from '../pages/GeoPage';
import { ReportsPage } from '../pages/ReportsPage';
import { ZoneDetailPage } from '../pages/ZoneDetailPage';
import { ZonesPage } from '../pages/ZonesPage';
import { HomePage } from '../pages/HomePage';
import { LoginPage } from '../pages/LoginPage';
import { MfaEnrollPage } from '../pages/MfaEnrollPage';
import { MfaVerifyPage } from '../pages/MfaVerifyPage';
import { OtpPage } from '../pages/OtpPage';
import { ApplicationDetailPage } from '../pages/ApplicationDetailPage';
import { ApplicationsPage } from '../pages/ApplicationsPage';
import { BookingDetailPage } from '../pages/BookingDetailPage';
import { BookingsPage } from '../pages/BookingsPage';
import { OverviewPage } from '../pages/OverviewPage';
import { PassengerProfilePage } from '../pages/PassengerProfilePage';
import { PassengersPage } from '../pages/PassengersPage';
import { PlaceholderPage } from '../pages/PlaceholderPage';
import { RiderProfilePage } from '../pages/RiderProfilePage';
import { RidersPage } from '../pages/RidersPage';
import { SessionExpiredPage } from '../pages/SessionExpiredPage';

export function AppRouter() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AuthLayout />}>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/otp" element={<OtpPage />} />
          <Route path="/mfa" element={<MfaVerifyPage />} />
          <Route path="/mfa/enroll" element={<MfaEnrollPage />} />
          <Route path="/session-expired" element={<SessionExpiredPage />} />
          <Route path="/forbidden" element={<ForbiddenPage />} />
        </Route>

        <Route element={<RequireMfaSession />}>
          <Route element={<AppShell />}>
            <Route index element={<HomePage />} />
            <Route path="overview" element={<OverviewPage />} />
            <Route path="riders" element={<RidersPage />} />
            <Route path="riders/:riderId" element={<RiderProfilePage />} />
            <Route path="applications" element={<ApplicationsPage />} />
            <Route path="applications/:riderId" element={<ApplicationDetailPage />} />
            <Route path="passengers" element={<PassengersPage />} />
            <Route path="passengers/:passengerId" element={<PassengerProfilePage />} />
            <Route path="bookings" element={<BookingsPage />} />
            <Route path="bookings/:bookingId" element={<BookingDetailPage />} />
            <Route path="zones" element={<ZonesPage />} />
            <Route path="zones/ashanti-map" element={<AshantiDistrictMapPage />} />
            <Route path="zones/:zoneId" element={<ZoneDetailPage />} />
            <Route path="geo" element={<GeoPage />} />
            <Route path="reports" element={<ReportsPage />} />
            <Route path="finance" element={<FinanceLayout />}>
              <Route index element={<FinanceHubPage />} />
              <Route path="refunds" element={<FinanceRefundsPage />} />
              <Route path="cases" element={<FinanceCasesPage />} />
              <Route path="packages" element={<FinancePackagesPage />} />
              <Route path="purchases" element={<FinancePurchasesPage />} />
              <Route path="ledgers" element={<FinanceLedgersPage />} />
            </Route>
            <Route
              path="support"
              element={
                <PlaceholderPage
                  title="Support"
                  description="Disputes UI is not in Phase 1A."
                />
              }
            />
            <Route path="admins" element={<AdminsPage />} />
            <Route path="audit" element={<AuditLogsPage />} />
          </Route>
        </Route>

        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
