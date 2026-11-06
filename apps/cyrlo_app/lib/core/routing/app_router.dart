import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../features/auth/application/signup_controller.dart';
import '../../features/auth/application/signup_draft.dart';
import '../../features/auth/presentation/create_account_screen.dart';
import '../../features/auth/presentation/onboarding_screen.dart';
import '../../features/auth/presentation/select_role_screen.dart';
import '../../features/auth/presentation/splash_screen.dart';
import '../../features/auth/presentation/verify_otp_screen.dart';
import '../../features/auth/presentation/welcome_screen.dart';
import '../../passenger_app/profile/presentation/passenger_details_screen.dart';
import '../../rider_app/onboarding/presentation/driver_type_screen.dart';
import '../../rider_app/onboarding/presentation/rider_application_screen.dart';
import '../../rider_app/onboarding/presentation/rider_approval_screen.dart';
import '../../shared/widgets/cyrlo_page.dart';
import '../../shared/widgets/role_shell.dart';
import 'app_routes.dart';

final appRouterProvider = Provider<GoRouter>((ref) {
  final refresh = ValueNotifier<int>(0);
  ref.listen(signupProvider, (previous, next) {
    refresh.value++;
  });
  ref.onDispose(refresh.dispose);

  final router = GoRouter(
    initialLocation: AppRoutes.splash,
    refreshListenable: refresh,
    redirect: (context, state) {
      final draft = ref.read(signupProvider);
      final location = state.matchedLocation;
      final next = _requiredLocation(draft);
      if (next == null) {
        if (draft.role == RideRole.passenger && location.startsWith('/passenger/')) {
          return location == AppRoutes.passengerDetails ? AppRoutes.passengerHome : null;
        }
        if (draft.role == RideRole.rider && _isRiderHome(location)) return null;
        if (draft.role == RideRole.passenger) return AppRoutes.passengerHome;
        if (draft.riderApproved) return AppRoutes.riderJobs;
        return null;
      }
      return location == next ? null : next;
    },
    routes: [
      flowRoute(AppRoutes.splash, const SplashScreen()),
      flowRoute(AppRoutes.onboarding, const OnboardingScreen()),
      flowRoute(AppRoutes.welcome, const WelcomeScreen()),
      flowRoute(AppRoutes.createAccount, const CreateAccountScreen()),
      flowRoute(AppRoutes.verifyOtp, const VerifyOtpScreen()),
      flowRoute(AppRoutes.selectRole, const SelectRoleScreen()),
      flowRoute(AppRoutes.passengerDetails, const PassengerDetailsScreen()),
      flowRoute(AppRoutes.driverType, const DriverTypeScreen()),
      flowRoute(AppRoutes.riderApplication, const RiderApplicationScreen()),
      flowRoute(AppRoutes.riderApproval, const RiderApprovalScreen()),
      StatefulShellRoute.indexedStack(
        builder: (context, state, navigationShell) {
          return RoleShell(
            navigationShell: navigationShell,
            destinations: const [
              NavigationDestination(
                icon: Icon(Icons.home_outlined),
                selectedIcon: Icon(Icons.home_rounded),
                label: 'Home',
              ),
              NavigationDestination(
                icon: Icon(Icons.map_outlined),
                selectedIcon: Icon(Icons.map_rounded),
                label: 'Map',
              ),
              NavigationDestination(
                icon: Icon(Icons.history_rounded),
                selectedIcon: Icon(Icons.history_rounded),
                label: 'Rides',
              ),
              NavigationDestination(
                icon: Icon(Icons.person_outline_rounded),
                selectedIcon: Icon(Icons.person_rounded),
                label: 'Account',
              ),
            ],
          );
        },
        branches: [
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: AppRoutes.passengerHome,
                builder: (context, state) => const SectionPage(title: 'Home'),
              ),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: AppRoutes.passengerMap,
                builder: (context, state) => const SectionPage(title: 'Map'),
              ),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: AppRoutes.passengerRides,
                builder: (context, state) => const SectionPage(title: 'Rides'),
              ),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: AppRoutes.passengerAccount,
                builder: (context, state) => const AccountPage(role: RideRole.passenger),
              ),
            ],
          ),
        ],
      ),
      StatefulShellRoute.indexedStack(
        builder: (context, state, navigationShell) {
          return RoleShell(
            navigationShell: navigationShell,
            destinations: const [
              NavigationDestination(
                icon: Icon(Icons.work_outline_rounded),
                selectedIcon: Icon(Icons.work_rounded),
                label: 'Jobs',
              ),
              NavigationDestination(
                icon: Icon(Icons.toll_outlined),
                selectedIcon: Icon(Icons.toll_rounded),
                label: 'Token',
              ),
              NavigationDestination(
                icon: Icon(Icons.person_outline_rounded),
                selectedIcon: Icon(Icons.person_rounded),
                label: 'Account',
              ),
            ],
          );
        },
        branches: [
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: AppRoutes.riderJobs,
                builder: (context, state) => const SectionPage(title: 'Jobs'),
              ),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: AppRoutes.riderToken,
                builder: (context, state) => const SectionPage(title: 'Token'),
              ),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: AppRoutes.riderAccount,
                builder: (context, state) => const AccountPage(role: RideRole.rider),
              ),
            ],
          ),
        ],
      ),
    ],
  );
  ref.onDispose(router.dispose);
  return router;
});

String? _requiredLocation(SignupDraft draft) {
  if (!draft.splashDone) return AppRoutes.splash;
  if (!draft.onboardingDone) return AppRoutes.onboarding;
  if (!draft.welcomeDone) return AppRoutes.welcome;
  if (draft.phoneE164 == null) return AppRoutes.createAccount;
  if (!draft.otpVerified) return AppRoutes.verifyOtp;
  if (draft.role == null) return AppRoutes.selectRole;
  if (draft.role == RideRole.passenger) {
    if (draft.passengerName == null) return AppRoutes.passengerDetails;
    return null;
  }
  if (draft.driverKind == null) return AppRoutes.driverType;
  if (!draft.applicationSubmitted) return AppRoutes.riderApplication;
  if (!draft.riderApproved) return AppRoutes.riderApproval;
  return null;
}

bool _isRiderHome(String location) {
  return location == AppRoutes.riderJobs ||
      location == AppRoutes.riderToken ||
      location == AppRoutes.riderAccount;
}
