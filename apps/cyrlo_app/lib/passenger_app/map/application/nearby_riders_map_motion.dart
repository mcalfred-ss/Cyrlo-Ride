import 'dart:async';
import 'dart:math' as math;

import 'package:cyrlo_maps/cyrlo_maps.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../shared/models/geo_point.dart';
import '../../home/application/nearby_riders_provider.dart';
import '../../home/domain/nearby_rider.dart';

class MapRiderPose {
  const MapRiderPose({
    required this.point,
    required this.headingRadians,
  });

  final GeoPoint point;
  final double headingRadians;
}

/// Smooths nearby rider marker motion. Poses follow live GPS when riders exist.
final nearbyRidersMapMotionProvider =
    NotifierProvider<NearbyRidersMapMotionController, Map<String, MapRiderPose>>(
  NearbyRidersMapMotionController.new,
);

class NearbyRidersMapMotionController
    extends Notifier<Map<String, MapRiderPose>> {
  Timer? _timer;
  final _random = math.Random(7);
  final _poses = <String, MapRiderPose>{};
  final _targets = <String, GeoPoint>{};
  final _motion = const MarkerMotion(
    duration: Duration(milliseconds: 1800),
    minInterval: Duration(milliseconds: 900),
  );
  DateTime _lastMove = DateTime.fromMillisecondsSinceEpoch(0);

  @override
  Map<String, MapRiderPose> build() {
    final riders = ref.watch(nearbyRidersProvider).items;
    ref.onDispose(() {
      _timer?.cancel();
      _timer = null;
    });

    final alive = riders.map((r) => r.id).toSet();
    _poses.removeWhere((id, _) => !alive.contains(id));
    _targets.removeWhere((id, _) => !alive.contains(id));

    for (final rider in riders) {
      _poses.putIfAbsent(
        rider.id,
        () => MapRiderPose(
          point: rider.point,
          headingRadians: _seedHeading(rider.id),
        ),
      );
      _targets.putIfAbsent(rider.id, () => _nudgeTarget(rider.point, rider.id));
    }

    _timer ??= Timer.periodic(const Duration(milliseconds: 700), (_) => _tick());
    return Map<String, MapRiderPose>.from(_poses);
  }

  void _tick() {
    final now = DateTime.now();
    if (!_motion.shouldStart(now: now, lastMove: _lastMove)) return;
    _lastMove = now;

    final riders = ref.read(nearbyRidersProvider).items;
    if (riders.isEmpty) return;

    for (final rider in riders) {
      final current = _poses[rider.id]?.point ?? rider.point;
      final previousHeading = _poses[rider.id]?.headingRadians ?? 0;
      final target = _targets[rider.id] ?? _nudgeTarget(rider.point, rider.id);
      final progressed = MarkerMotion.lerp(
        current.toMapCoordinate(),
        target.toMapCoordinate(),
        0.28,
      );
      final point = GeoPoint(
        latitude: progressed.latitude,
        longitude: progressed.longitude,
      );
      final moved =
          (point.latitude - current.latitude).abs() > 1e-8 ||
          (point.longitude - current.longitude).abs() > 1e-8;
      _poses[rider.id] = MapRiderPose(
        point: point,
        headingRadians:
            moved ? _heading(current, point) : previousHeading,
      );

      final almostThere =
          (point.latitude - target.latitude).abs() < 0.00004 &&
          (point.longitude - target.longitude).abs() < 0.00004;
      if (almostThere || _random.nextDouble() < 0.18) {
        _targets[rider.id] = _nudgeTarget(rider.point, rider.id);
      }
    }
    state = Map<String, MapRiderPose>.from(_poses);
  }

  GeoPoint _nudgeTarget(GeoPoint home, String id) {
    // Prefer longer along-road drift (lat/lng axis by seed) so vehicles
    // look like they cruise a street instead of wandering into plots.
    final seed = id.hashCode;
    final alongLat = seed.isEven;
    final travel = ((_random.nextDouble() * 2) - 1) * 0.00135;
    final side = ((_random.nextDouble() * 2) - 1) * 0.00028;
    final wave = math.sin(seed + _random.nextDouble()) * 0.00018;
    return GeoPoint(
      latitude: home.latitude + (alongLat ? travel : side) + wave,
      longitude: home.longitude + (alongLat ? side : travel),
    );
  }

  double _heading(GeoPoint from, GeoPoint to) {
    final dLat = to.latitude - from.latitude;
    final dLng = to.longitude - from.longitude;
    return math.atan2(dLng, dLat);
  }

  double _seedHeading(String id) {
    return (id.hashCode % 360) * math.pi / 180;
  }
}

List<NearbyRider> ridersWithMapPoses(
  List<NearbyRider> riders,
  Map<String, MapRiderPose> poses,
) {
  return [
    for (final rider in riders)
      NearbyRider(
        id: rider.id,
        kind: rider.kind,
        etaMinutes: rider.etaMinutes,
        point: poses[rider.id]?.point ?? rider.point,
        displayName: rider.displayName,
        gender: rider.gender,
        rating: rider.rating,
        reviewCount: rider.reviewCount,
        reviews: rider.reviews,
        phoneE164: rider.phoneE164,
        available: rider.available,
        busy: rider.busy,
      ),
  ];
}
