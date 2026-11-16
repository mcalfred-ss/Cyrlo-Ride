import 'package:cyrlo_app/core/mapping/location_label.dart';
import 'package:cyrlo_app/core/mapping/resolved_location.dart';
import 'package:cyrlo_app/shared/models/geo_point.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('shapes reverse labels to most-specific leading segments', () {
    expect(
      shapeLocationLabel('Ahenema Kokoben, Atwima Kwanwoma, Ashanti Region, Ghana'),
      'Ahenema Kokoben, Atwima Kwanwoma, Ashanti Region',
    );
  });

  test('does not invent a town when provider only returns city/region', () {
    final shaped = shapeLocationLabel('Kumasi, Ashanti Region, Ghana');
    expect(shaped, 'Kumasi, Ashanti Region');
    expect(isCoarseRegionLabel(shaped), isTrue);
  });

  test('drops placeholder Ghana / empty parts', () {
    expect(shapeLocationLabel('Ghana'), '');
    expect(isPlaceholderLocationLabel('Ghana'), isTrue);
    expect(shapeLocationLabel(null, fallback: 'Pinned pickup'), 'Pinned pickup');
  });

  test('formats resolved location and nearby landmarks for display', () {
    const resolved = ResolvedLocation(
      formattedAddress:
          'Ahenema Kokoben, Atwima Kwanwoma, Ashanti Region, Ghana',
      locality: 'Ahenema Kokoben',
      district: 'Atwima Kwanwoma',
      region: 'Ashanti Region',
      country: 'Ghana',
      point: GeoPoint(latitude: 6.626, longitude: -1.65),
      source: 'provider+catalogue',
      confidence: 'high',
      approximate: false,
      nearbyLandmarks: [
        NearbyLandmarkRef(
          name: 'Santasi Roundabout',
          category: 'landmark',
          point: GeoPoint(latitude: 6.6723, longitude: -1.6411),
          distanceMeters: 5200,
          source: 'verified-catalog',
        ),
      ],
    );

    expect(
      displayResolvedLocationLabel(resolved),
      'Ahenema Kokoben, Atwima Kwanwoma, Ashanti Region',
    );
    expect(
      formatNearbyLandmarksSummary(resolved.nearbyLandmarks),
      'Nearby: Santasi Roundabout — 5.2 km',
    );
  });
}
