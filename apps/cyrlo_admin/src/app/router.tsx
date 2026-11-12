import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';

import { RequireMfaSession } from '../auth/RequireMfaSession';
import { AppShell } from '../layouts/AppShell';
import { AuthLayout } from '../layouts/AuthLayout';
import { ForbiddenPage } from '../pages/ForbiddenPage';
import { HomePage } from '../pages/HomePage';
import { LoginPage } from '../pages/LoginPage';
import { MfaEnrollPage } from '../pages/MfaEnrollPage';
import { MfaVerifyPage } from '../pages/MfaVerifyPage';
import { OtpPage } from '../pages/OtpPage';
import { ApplicationDetailPage } from '../pages/ApplicationDetailPage';
import { ApplicationsPage } from '../pages/ApplicationsPage';
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
            <Route
              path="bookings"
              element={
                <PlaceholderPage
                  title="Bookings"
                  description="Booking browser UI is not in Phase 1A."
                />
              }
            />
            <Route
              path="zones"
              element={
                <PlaceholderPage
                  title="Service zones"
                  description="Zone management UI is not in Phase 1A."
                />
              }
            />
            <Route
              path="geo"
              element={
                <PlaceholderPage
                  title="Geography"
                  description="Geo hierarchy UI is not in Phase 1A."
                />
              }
            />
            <Route
              path="finance"
              element={
                <PlaceholderPage
                  title="Finance"
                  description="Finance screens are not in Phase 1A."
                />
              }
            />
            <Route
              path="support"
              element={
                <PlaceholderPage
                  title="Support"
                  description="Disputes UI is not in Phase 1A."
                />
              }
            />
            <Route
              path="admins"
              element={
                <PlaceholderPage
                  title="Administrators"
                  description="Invite/revoke UI is not in Phase 1A."
                />
              }
            />
            <Route
              path="audit"
              element={
                <PlaceholderPage
                  title="Audit logs"
                  description="Audit browser UI is not in Phase 1A."
                />
              }
            />
          </Route>
        </Route>

        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
