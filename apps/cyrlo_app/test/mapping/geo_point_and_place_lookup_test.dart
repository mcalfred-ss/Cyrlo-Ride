import 'package:cyrlo_app/core/mapping/place_lookup_gateway.dart';
import 'package:cyrlo_app/core/mapping/route_preview_gateway.dart';
import 'package:cyrlo_app/shared/models/geo_point.dart';
import 'package:cyrlo_maps/cyrlo_maps.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('GeoPoint converts at the maps edge', () {
    const point = GeoPoint(latitude: 6.6885, longitude: -1.6244);
    expect(point.isValid, isTrue);
    expect(point.toMapCoordinate(), const MapCoordinate(latitude: 6.6885, longitude: -1.6244));
    expect(
      GeoPoint.fromMapCoordinate(point.toMapCoordinate()),
      point,
    );
  });

  test('unavailable place lookup never invents an address', () async {
    const gateway = UnavailablePlaceLookupGateway();
    await expectLater(
      gateway.search('Kejetia'),
      throwsA(
        isA<PlaceLookupException>().having(
          (error) => error.code,
          'code',
          'unavailable',
        ),
      ),
    );
    await expectLater(
      gateway.reverse(const GeoPoint(latitude: 6.69, longitude: -1.62)),
      throwsA(isA<PlaceLookupException>()),
    );
  });

  test('unavailable route preview never invents a polyline', () async {
    const gateway = UnavailableRoutePreviewGateway();
    await expectLater(
      gateway.preview(
        from: const GeoPoint(latitude: 6.69, longitude: -1.62),
        to: const GeoPoint(latitude: 6.70, longitude: -1.63),
      ),
      throwsA(
        isA<RoutePreviewException>().having(
          (error) => error.code,
          'code',
          'unavailable',
        ),
      ),
    );
  });
}
