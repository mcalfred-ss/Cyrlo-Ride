import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../features/auth/application/signup_controller.dart';
import '../../features/auth/application/signup_draft.dart';
import '../../passenger_app/home/domain/nearby_rider.dart';
import '../models/geo_point.dart';
import 'active_ride_request.dart';

final activeRideRequestProvider =
    NotifierProvider<ActiveRideRequestController, ActiveRideRequest?>(
  ActiveRideRequestController.new,
);

class ActiveRideRequestController extends Notifier<ActiveRideRequest?> {
  @override
  ActiveRideRequest? build() => null;

  /// Starts a live request after the GHS 1 fee. Numbers stay shared until done.
  /// [contactPhoneE164] is the number riders should call (signup or alternate).
  bool startFromNearbyRider(
    NearbyRider rider, {
    required String contactPhoneE164,
  }) {
    if (!rider.canRequest) return false;
    final draft = ref.read(signupProvider);
    final riderPhone = rider.phoneE164;
    if (contactPhoneE164.isEmpty ||
        riderPhone == null ||
        riderPhone.isEmpty) {
      return false;
    }

    state = ActiveRideRequest(
      id: 'req-${DateTime.now().millisecondsSinceEpoch}',
      kind: rider.kind,
      riderId: rider.id,
      riderPhoneE164: riderPhone,
      passengerPhoneE164: contactPhoneE164,
      status: ActiveRideStatus.ongoing,
      createdAt: DateTime.now(),
      passengerName: draft.passengerName,
      passengerFirstName: draft.passengerFirstName,
      passengerGender: draft.passengerGender,
      etaMinutes: rider.etaMinutes,
      pickupPoint: draft.passengerLocationPoint,
    );
    return true;
  }

  void accept(ActiveRideRequest job) {
    state = job.copyWith(status: ActiveRideStatus.ongoing);
  }

  void markCompleted() {
    state = null;
  }

  void markCancelled() {
    state = null;
  }

  void clear() => state = null;
}

/// Pending pickup offers on the rider Jobs tab.
final riderJobOffersProvider =
    NotifierProvider<RiderJobOffersController, List<ActiveRideRequest>>(
  RiderJobOffersController.new,
);

class RiderJobOffersController extends Notifier<List<ActiveRideRequest>> {
  @override
  List<ActiveRideRequest> build() {
    final draft = ref.watch(signupProvider);
    if (draft.role != RideRole.rider) return const [];
    return _demoOffers(draft);
  }

  List<ActiveRideRequest> _demoOffers(SignupDraft draft) {
    final now = DateTime.now();
    final kind = draft.driverKind ?? DriverKind.pragya;
    final riderPhone = draft.phoneE164 ?? '+233244000111';
    return [
      ActiveRideRequest(
        id: 'job-ama',
        kind: kind,
        riderId: 'self',
        riderPhoneE164: riderPhone,
        passengerPhoneE164: '+233201234567',
        status: ActiveRideStatus.requested,
        createdAt: now.subtract(const Duration(minutes: 1)),
        passengerName: 'Ama Mensah',
        passengerFirstName: 'Ama',
        passengerGender: PassengerGender.female,
        etaMinutes: 3,
        pickupPoint: const GeoPoint(latitude: 6.6902, longitude: -1.6218),
      ),
      ActiveRideRequest(
        id: 'job-kwesi',
        kind: kind,
        riderId: 'self',
        riderPhoneE164: riderPhone,
        passengerPhoneE164: '+233244998877',
        status: ActiveRideStatus.requested,
        createdAt: now.subtract(const Duration(minutes: 4)),
        passengerName: 'Kwesi Owusu',
        passengerFirstName: 'Kwesi',
        passengerGender: PassengerGender.male,
        etaMinutes: 6,
        pickupPoint: const GeoPoint(latitude: 6.6861, longitude: -1.6279),
      ),
      ActiveRideRequest(
        id: 'job-akosua',
        kind: kind,
        riderId: 'self',
        riderPhoneE164: riderPhone,
        passengerPhoneE164: '+233275551122',
        status: ActiveRideStatus.requested,
        createdAt: now.subtract(const Duration(minutes: 7)),
        passengerName: 'Akosua Boateng',
        passengerFirstName: 'Akosua',
        passengerGender: PassengerGender.female,
        etaMinutes: 9,
        pickupPoint: const GeoPoint(latitude: 6.6938, longitude: -1.6184),
      ),
    ];
  }

  void decline(String id) {
    final preview = ref.read(previewRiderJobProvider);
    if (preview?.id == id) {
      ref.read(previewRiderJobProvider.notifier).clear();
    }
    state = [
      for (final job in state)
        if (job.id != id) job,
    ];
  }

  ActiveRideRequest? accept(String id) {
    ActiveRideRequest? accepted;
    final next = <ActiveRideRequest>[];
    for (final job in state) {
      if (job.id == id) {
        accepted = job.copyWith(status: ActiveRideStatus.ongoing);
      } else {
        next.add(job);
      }
    }
    if (accepted == null) return null;
    state = next;
    ref.read(previewRiderJobProvider.notifier).clear();
    ref.read(activeRideRequestProvider.notifier).accept(accepted);
    return accepted;
  }
}

/// Pending job the rider opened on the map before accepting.
final previewRiderJobProvider =
    NotifierProvider<PreviewRiderJobController, ActiveRideRequest?>(
  PreviewRiderJobController.new,
);

class PreviewRiderJobController extends Notifier<ActiveRideRequest?> {
  @override
  ActiveRideRequest? build() => null;

  void select(ActiveRideRequest job) => state = job;

  void clear() => state = null;
}
