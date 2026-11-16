import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../features/auth/application/auth_session.dart';
import 'rider_eligibility_api.dart';

class RiderEligibilityState {
  const RiderEligibilityState({
    this.eligibility,
    this.isLoading = false,
    this.errorMessage,
  });

  final RiderEligibility? eligibility;
  final bool isLoading;
  final String? errorMessage;

  RiderEligibilityState copyWith({
    RiderEligibility? eligibility,
    bool? isLoading,
    String? errorMessage,
    bool clearError = false,
  }) {
    return RiderEligibilityState(
      eligibility: eligibility ?? this.eligibility,
      isLoading: isLoading ?? this.isLoading,
      errorMessage: clearError ? null : (errorMessage ?? this.errorMessage),
    );
  }
}

/// Proactive rider zone / GPS readiness from `GET /riders/eligibility`.
///
/// Does not claim geographic coverage of the current GPS point — backend has
/// no public rider point-in-zone read. Approval for an active zone is separate
/// from being inside that polygon right now.
final riderEligibilityProvider =
    NotifierProvider<RiderEligibilityController, RiderEligibilityState>(
  RiderEligibilityController.new,
);

class RiderEligibilityController extends Notifier<RiderEligibilityState> {
  @override
  RiderEligibilityState build() {
    ref.listen<AuthSession?>(authSessionProvider, (previous, next) {
      if (next == null) {
        state = const RiderEligibilityState();
        return;
      }
      unawaited(refresh());
    });
    Future.microtask(refresh);
    return const RiderEligibilityState(isLoading: true);
  }

  Future<void> refresh() async {
    final session = ref.read(authSessionProvider);
    if (session == null) {
      state = const RiderEligibilityState();
      return;
    }
    state = state.copyWith(isLoading: true, clearError: true);
    try {
      final eligibility = await ref.read(riderEligibilityApiProvider).fetch(
            accessToken: session.accessToken,
          );
      if (!ref.mounted) return;
      state = RiderEligibilityState(eligibility: eligibility);
    } catch (_) {
      if (!ref.mounted) return;
      state = state.copyWith(
        isLoading: false,
        errorMessage: 'Could not refresh rider eligibility.',
      );
    }
  }
}

String riderZoneStatusMessage(RiderEligibility? eligibility) {
  if (eligibility == null) {
    return 'Checking whether you are approved for an active service zone…';
  }
  if (eligibility.hasLocationIssue) {
    return 'Location unavailable for matching. Turn on GPS sharing so Cyrlo can verify freshness — GPS alone does not make you eligible.';
  }
  if (!eligibility.hasApprovedActiveZone) {
    return 'You are not approved for an active service zone yet. Contact Cyrlo support — being on the map is not enough.';
  }
  if (!eligibility.verificationEligible) {
    return 'Your rider application or vehicle still needs approval.';
  }
  return 'Approved for an active service zone. Go online only when ready to take jobs.';
}
