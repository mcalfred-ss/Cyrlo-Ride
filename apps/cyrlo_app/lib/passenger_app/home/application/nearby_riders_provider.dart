import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../features/auth/application/signup_draft.dart';
import '../../../shared/models/geo_point.dart';
import '../../../shared/ride_session/active_ride_request_controller.dart';
import '../domain/nearby_rider.dart';

final _baseNearbyRiders = [
  NearbyRider(
    id: 'nearby-pragya-1',
    kind: DriverKind.pragya,
    etaMinutes: 2,
    point: GeoPoint(latitude: 6.6902, longitude: -1.6218),
    displayName: 'Kwame Mensah',
    gender: PassengerGender.male,
    rating: 4.9,
    reviewCount: 128,
    phoneE164: '+233244111222',
    reviews: [
      RiderReview(
        id: 'rev-p1-1',
        passengerName: 'Ama',
        rating: 5,
        comment: 'Very polite and the Pragya was clean. Arrived fast.',
        occurredAt: DateTime(2026, 10, 28),
      ),
      RiderReview(
        id: 'rev-p1-2',
        passengerName: 'Kojo',
        rating: 5,
        comment: 'Knew the area well. Smooth pickup.',
        occurredAt: DateTime(2026, 10, 12),
      ),
      RiderReview(
        id: 'rev-p1-3',
        passengerName: 'Efua',
        rating: 4,
        comment: 'Good ride. Slight wait but worth it.',
        occurredAt: DateTime(2026, 9, 30),
      ),
    ],
  ),
  NearbyRider(
    id: 'nearby-okada-1',
    kind: DriverKind.okada,
    etaMinutes: 4,
    point: GeoPoint(latitude: 6.6861, longitude: -1.6279),
    displayName: 'Yaw Boateng',
    gender: PassengerGender.male,
    rating: 4.7,
    reviewCount: 86,
    phoneE164: '+233244333444',
    reviews: [
      RiderReview(
        id: 'rev-o1-1',
        passengerName: 'Akosua',
        rating: 5,
        comment: 'Safe Okada rider. Helmet ready and careful in traffic.',
        occurredAt: DateTime(2026, 11, 1),
      ),
      RiderReview(
        id: 'rev-o1-2',
        passengerName: 'Kofi',
        rating: 4,
        comment: 'Quick through the shortcut. Friendly guy.',
        occurredAt: DateTime(2026, 10, 20),
      ),
      RiderReview(
        id: 'rev-o1-3',
        passengerName: 'Adwoa',
        rating: 5,
        comment: 'Always on time when I request him.',
        occurredAt: DateTime(2026, 10, 5),
      ),
    ],
  ),
  NearbyRider(
    id: 'nearby-pragya-2',
    kind: DriverKind.pragya,
    etaMinutes: 6,
    point: GeoPoint(latitude: 6.6938, longitude: -1.6184),
    displayName: 'Abena Owusu',
    gender: PassengerGender.female,
    rating: 4.8,
    reviewCount: 64,
    phoneE164: '+233244555666',
    reviews: [
      RiderReview(
        id: 'rev-p2-1',
        passengerName: 'Nana',
        rating: 5,
        comment: 'Calm driver. Felt safe the whole way.',
        occurredAt: DateTime(2026, 10, 25),
      ),
      RiderReview(
        id: 'rev-p2-2',
        passengerName: 'Yaw',
        rating: 5,
        comment: 'Clean vehicle and clear communication.',
        occurredAt: DateTime(2026, 10, 8),
      ),
    ],
  ),
  NearbyRider(
    id: 'nearby-okada-2',
    kind: DriverKind.okada,
    etaMinutes: 8,
    point: GeoPoint(latitude: 6.6824, longitude: -1.6312),
    displayName: 'Kofi Asante',
    gender: PassengerGender.male,
    rating: 4.5,
    reviewCount: 41,
    phoneE164: '+233244777888',
    reviews: [
      RiderReview(
        id: 'rev-o2-1',
        passengerName: 'Serwaa',
        rating: 4,
        comment: 'Decent Okada. Took a longer route once.',
        occurredAt: DateTime(2026, 10, 18),
      ),
      RiderReview(
        id: 'rev-o2-2',
        passengerName: 'Mensah',
        rating: 5,
        comment: 'Respectful and quick.',
        occurredAt: DateTime(2026, 9, 22),
      ),
    ],
  ),
  NearbyRider(
    id: 'nearby-aboboyaa-1',
    kind: DriverKind.aboboyaa,
    etaMinutes: 11,
    point: GeoPoint(latitude: 6.6975, longitude: -1.6151),
    displayName: 'Issah Fuseini',
    gender: PassengerGender.male,
    rating: 4.6,
    reviewCount: 19,
    available: false,
    reviews: [
      RiderReview(
        id: 'rev-a1-1',
        passengerName: 'Grace',
        rating: 5,
        comment: 'Great for small loads when available.',
        occurredAt: DateTime(2026, 9, 15),
      ),
    ],
  ),
];

/// Demo nearby supply. Marks a rider busy while they have an accepted active job.
final nearbyRidersProvider = Provider<List<NearbyRider>>((ref) {
  final active = ref.watch(activeRideRequestProvider);
  final busyRiderId =
      active?.isAccepted == true ? active!.riderId : null;

  return [
    for (final rider in _baseNearbyRiders)
      rider.copyWith(busy: busyRiderId != null && rider.id == busyRiderId),
  ];
});

final nearbyRiderByIdProvider = Provider.family<NearbyRider?, String>((ref, id) {
  for (final rider in ref.watch(nearbyRidersProvider)) {
    if (rider.id == id) return rider;
  }
  return null;
});

final selectedNearbyRiderProvider =
    NotifierProvider<SelectedNearbyRider, NearbyRider?>(SelectedNearbyRider.new);

class SelectedNearbyRider extends Notifier<NearbyRider?> {
  @override
  NearbyRider? build() => null;

  void select(NearbyRider rider) => state = rider;

  void clear() => state = null;
}
