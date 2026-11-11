import 'dart:io';

import 'package:cyrlo_app/core/errors/api_exception.dart';
import 'package:cyrlo_app/features/bookings/data/booking_models.dart';
import 'package:cyrlo_app/features/bookings/data/bookings_api.dart';
import 'package:cyrlo_app/passenger_app/map/application/passenger_trip_plan.dart';
import 'package:cyrlo_app/shared/models/geo_point.dart';
import 'package:flutter_test/flutter_test.dart';

class _RecordingBookingsApi implements BookingsApi {
  String? accessToken;
  GeoPoint? pickup;
  GeoPoint? destination;
  String? vehicleCategory;
  String? pickupLabel;
  String? destinationLabel;
  int createCalls = 0;
  int initializeCalls = 0;
  Object? createError;
  String createStatus = 'SEARCHING';

  @override
  Future<Booking> create({
    required String accessToken,
    required GeoPoint pickup,
    required String vehicleCategory,
    GeoPoint? destination,
    String? pickupLabel,
    String? destinationLabel,
  }) async {
    createCalls += 1;
    this.accessToken = accessToken;
    this.pickup = pickup;
    this.destination = destination;
    this.vehicleCategory = vehicleCategory;
    this.pickupLabel = pickupLabel;
    this.destinationLabel = destinationLabel;
    final error = createError;
    if (error != null) {
      if (error is Exception) throw error;
      throw Exception(error);
    }
    return Booking(
      id: 'booking-1',
      status: createStatus,
      vehicleCategory: vehicleCategory,
      pickup: pickup,
      destination: destination,
      bookingFeePesewas: 100,
      createdAt: DateTime.utc(2026),
      pickupLabel: pickupLabel,
      destinationLabel: destinationLabel,
    );
  }

  @override
  Future<Booking> acknowledge({
    required String accessToken,
    required String bookingId,
  }) =>
      throw UnimplementedError();

  @override
  Future<Booking> cancel({
    required String accessToken,
    required String bookingId,
    String? reason,
  }) =>
      throw UnimplementedError();

  @override
  Future<Booking> cancelAfterAccept({
    required String accessToken,
    required String bookingId,
    required String reason,
  }) =>
      throw UnimplementedError();

  @override
  Future<Booking> complete({
    required String accessToken,
    required String bookingId,
  }) =>
      throw UnimplementedError();

  @override
  Future<Booking> get({
    required String accessToken,
    required String bookingId,
  }) =>
      throw UnimplementedError();

  @override
  Future<BookingPaymentCheckout> initializeBookingFee({
    required String accessToken,
    required String bookingId,
  }) async {
    initializeCalls += 1;
    throw UnimplementedError(
      'initializeBookingFee should not run at booking create',
    );
  }

  @override
  Future<BookingListPage> list({
    required String accessToken,
    int page = 1,
    int pageSize = 20,
  }) =>
      throw UnimplementedError();

  @override
  Future<MatchingStatus> matchingStatus({
    required String accessToken,
    required String bookingId,
  }) =>
      throw UnimplementedError();

  @override
  Future<Booking> riderCancel({
    required String accessToken,
    required String bookingId,
    required String reason,
  }) =>
      throw UnimplementedError();

  @override
  Future<Booking> start({
    required String accessToken,
    required String bookingId,
  }) =>
      throw UnimplementedError();
}

void main() {
  const pickup = GeoPoint(latitude: 6.6885, longitude: -1.6244);

  test('booking create records pickup only without destination', () async {
    final api = _RecordingBookingsApi();
    final booking = await api.create(
      accessToken: 'token',
      pickup: pickup,
      vehicleCategory: 'PRAGYA',
      pickupLabel: 'Kejetia',
    );

    expect(api.createCalls, 1);
    expect(api.pickup, pickup);
    expect(api.destination, isNull);
    expect(api.pickupLabel, 'Kejetia');
    expect(api.destinationLabel, isNull);
    expect(booking.pickup, pickup);
    expect(booking.destination, isNull);
    expect(booking.paymentExpiresAt, isNull);
    expect(booking.isSearching, isTrue);
  });

  test('authentication failure surfaces as ApiException', () async {
    final api = _RecordingBookingsApi()
      ..createError = const ApiException(
        code: 'UNAUTHORIZED',
        message: 'Invalid or expired token.',
        statusCode: 401,
      );

    await expectLater(
      () => api.create(
        accessToken: 'bad',
        pickup: pickup,
        vehicleCategory: 'PRAGYA',
      ),
      throwsA(
        isA<ApiException>().having((e) => e.statusCode, 'status', 401),
      ),
    );
  });

  test('service-zone rejection does not look like success', () async {
    final api = _RecordingBookingsApi()
      ..createError = const ApiException(
        code: 'CONFLICT',
        message: 'Pickup is outside the active service area',
      );

    try {
      await api.create(
        accessToken: 'token',
        pickup: pickup,
        vehicleCategory: 'PRAGYA',
      );
      fail('expected service-area rejection');
    } on ApiException catch (error) {
      expect(isServiceAreaRejection(error), isTrue);
      expect(api.createCalls, 1);
      expect(api.initializeCalls, 0);
    }
  });

  test('Booking.fromJson tolerates null destination and paymentExpiresAt', () {
    final booking = Booking.fromJson({
      'id': 'b1',
      'status': 'SEARCHING',
      'vehicleCategory': 'PRAGYA',
      'pickup': {'latitude': 6.6885, 'longitude': -1.6244},
      'destination': null,
      'paymentExpiresAt': null,
      'createdAt': '2026-01-01T00:00:00.000Z',
      'bookingFeePesewas': 100,
    });
    expect(booking.destination, isNull);
    expect(booking.paymentExpiresAt, isNull);
  });

  test('MatchingOffer tolerates booking without destination', () {
    final offer = MatchingOffer.fromJson({
      'offerId': 'offer-1',
      'bookingId': 'booking-1',
      'status': 'PENDING',
      'batchSequence': 1,
      'offeredAt': '2026-01-01T00:00:00.000Z',
      'expiresAt': '2026-01-01T00:05:00.000Z',
      'booking': {
        'vehicleCategory': 'PRAGYA',
        'pickup': {'latitude': 6.6885, 'longitude': -1.6244},
        'pickupLabel': 'Kejetia',
      },
    });
    expect(offer.booking.destination, isNull);
    expect(offer.booking.paymentExpiresAt, isNull);
  });

  test('live booking flow is pickup-only and does not open Paystack at create', () {
    final source = File(
      'lib/passenger_app/home/presentation/live_booking_flow.dart',
    ).readAsStringSync();
    expect(source.contains('0.007'), isFalse);
    expect(source.contains('Nearby destination'), isFalse);
    expect(source.contains('required GeoPoint destination'), isFalse);
    expect(source.contains('destination:'), isFalse);
    expect(source.contains('initializeBookingFee'), isFalse);
    expect(source.contains('InAppWebScreen'), isFalse);
    expect(source.contains('Paystack'), isFalse);
    expect(source.contains('markSearchingRider'), isTrue);
    expect(source.contains('markServiceUnavailable'), isTrue);
    expect(source.contains('Looking for a rider'), isTrue);
    expect(source.contains('GH₵1 connection fee'), isTrue);
    expect(source.contains('Transport fare is agreed'), isTrue);
    final createAt = source.indexOf('bookingsApiProvider).create');
    final zoneAt = source.indexOf('isServiceAreaRejection');
    expect(createAt, greaterThan(0));
    expect(zoneAt, greaterThan(createAt));
  });

  test('bookings API omits destination from JSON when null', () {
    final source = File(
      'lib/features/bookings/data/bookings_api.dart',
    ).readAsStringSync();
    expect(source.contains('if (destination != null)'), isTrue);
    expect(source.contains('GeoPoint? destination'), isTrue);
  });
}
