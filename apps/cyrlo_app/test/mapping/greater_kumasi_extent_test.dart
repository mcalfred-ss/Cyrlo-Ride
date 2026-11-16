import 'package:cyrlo_app/core/mapping/greater_kumasi_extent.dart';
import 'package:cyrlo_app/shared/models/geo_point.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('includes central Kumasi and Ahenema Kokoben area', () {
    expect(
      GreaterKumasiExtent.contains(
        const GeoPoint(latitude: 6.6885, longitude: -1.6244),
      ),
      isTrue,
    );
    expect(
      GreaterKumasiExtent.contains(
        const GeoPoint(latitude: 6.6295, longitude: -1.6615),
      ),
      isTrue,
    );
  });

  test('excludes Accra', () {
    expect(
      GreaterKumasiExtent.contains(
        const GeoPoint(latitude: 5.6037, longitude: -0.1870),
      ),
      isFalse,
    );
  });

  test('soft-clamps camera targets into Greater Kumasi', () {
    final clamped = GreaterKumasiExtent.clampCamera(
      const GeoPoint(latitude: 5.6, longitude: -0.2).toMapCoordinate(),
    );
    expect(clamped.latitude, GreaterKumasiExtent.southWest.latitude);
    expect(clamped.longitude, GreaterKumasiExtent.northEast.longitude);
  });
}
