import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/constants/api_paths.dart';
import '../../../core/errors/api_exception.dart';
import '../../../core/network/api_client.dart';
import '../../../shared/models/geo_point.dart';
import '../../../shared/providers/core_providers.dart';
import 'booking_models.dart';

class BookingListPage {
  const BookingListPage({required this.items, required this.hasNextPage});

  final List<Booking> items;
  final bool hasNextPage;
}

abstract class BookingsApi {
  Future<Booking> create({
    required String accessToken,
    required GeoPoint pickup,
    required GeoPoint destination,
    required String vehicleCategory,
    String? pickupLabel,
    String? destinationLabel,
  });

  Future<BookingListPage> list({
    required String accessToken,
    int page = 1,
    int pageSize = 20,
  });

  Future<Booking> get({
    required String accessToken,
    required String bookingId,
  });

  Future<BookingPaymentCheckout> initializeBookingFee({
    required String accessToken,
    required String bookingId,
  });

  Future<Booking> cancel({
    required String accessToken,
    required String bookingId,
    String? reason,
  });

  Future<Booking> cancelAfterAccept({
    required String accessToken,
    required String bookingId,
    required String reason,
  });

  Future<Booking> start({
    required String accessToken,
    required String bookingId,
  });

  Future<Booking> complete({
    required String accessToken,
    required String bookingId,
  });

  Future<Booking> riderCancel({
    required String accessToken,
    required String bookingId,
    required String reason,
  });

  Future<Booking> acknowledge({
    required String accessToken,
    required String bookingId,
  });

  Future<MatchingStatus> matchingStatus({
    required String accessToken,
    required String bookingId,
  });
}

class LiveBookingsApi implements BookingsApi {
  LiveBookingsApi(this._client);

  final ApiClient _client;

  @override
  Future<Booking> create({
    required String accessToken,
    required GeoPoint pickup,
    required GeoPoint destination,
    required String vehicleCategory,
    String? pickupLabel,
    String? destinationLabel,
  }) async {
    _client.setAccessToken(accessToken);
    try {
      final response = await _client.dio.post(
        ApiPaths.bookings,
        data: {
          'pickup': {
            'latitude': pickup.latitude,
            'longitude': pickup.longitude,
          },
          'destination': {
            'latitude': destination.latitude,
            'longitude': destination.longitude,
          },
          'vehicleCategory': vehicleCategory,
          if (pickupLabel != null) 'pickupLabel': pickupLabel,
          if (destinationLabel != null) 'destinationLabel': destinationLabel,
        },
      );
      return Booking.fromJson(_dataMap(response.data));
    } on DioException catch (error) {
      throw _asApiException(error);
    }
  }

  @override
  Future<BookingListPage> list({
    required String accessToken,
    int page = 1,
    int pageSize = 20,
  }) async {
    _client.setAccessToken(accessToken);
    try {
      final response = await _client.dio.get(
        ApiPaths.bookings,
        queryParameters: {'page': page, 'pageSize': pageSize},
      );
      final data = _dataMap(response.data);
      final items = <Booking>[];
      final raw = data['items'];
      if (raw is List) {
        for (final item in raw) {
          if (item is Map) {
            items.add(Booking.fromJson(Map<String, dynamic>.from(item)));
          }
        }
      }
      final meta = data['meta'];
      final hasNext = meta is Map && meta['hasNextPage'] == true;
      return BookingListPage(items: items, hasNextPage: hasNext);
    } on DioException catch (error) {
      throw _asApiException(error);
    }
  }

  @override
  Future<Booking> get({
    required String accessToken,
    required String bookingId,
  }) async {
    _client.setAccessToken(accessToken);
    try {
      final response = await _client.dio.get(ApiPaths.booking(bookingId));
      return Booking.fromJson(_dataMap(response.data));
    } on DioException catch (error) {
      throw _asApiException(error);
    }
  }

  @override
  Future<BookingPaymentCheckout> initializeBookingFee({
    required String accessToken,
    required String bookingId,
  }) async {
    _client.setAccessToken(accessToken);
    try {
      final response = await _client.dio.post(
        ApiPaths.bookingFeePayment,
        data: {'bookingId': bookingId},
      );
      return BookingPaymentCheckout.fromJson(_dataMap(response.data));
    } on DioException catch (error) {
      throw _asApiException(error);
    }
  }

  @override
  Future<Booking> cancel({
    required String accessToken,
    required String bookingId,
    String? reason,
  }) async {
    return _mutate(
      accessToken: accessToken,
      path: ApiPaths.bookingCancel(bookingId),
      data: {if (reason != null) 'reason': reason},
    );
  }

  @override
  Future<Booking> cancelAfterAccept({
    required String accessToken,
    required String bookingId,
    required String reason,
  }) async {
    return _mutate(
      accessToken: accessToken,
      path: ApiPaths.bookingCancelAfterAccept(bookingId),
      data: {'reason': reason},
    );
  }

  @override
  Future<Booking> start({
    required String accessToken,
    required String bookingId,
  }) {
    return _mutate(
      accessToken: accessToken,
      path: ApiPaths.bookingStart(bookingId),
    );
  }

  @override
  Future<Booking> complete({
    required String accessToken,
    required String bookingId,
  }) {
    return _mutate(
      accessToken: accessToken,
      path: ApiPaths.bookingComplete(bookingId),
    );
  }

  @override
  Future<Booking> riderCancel({
    required String accessToken,
    required String bookingId,
    required String reason,
  }) {
    return _mutate(
      accessToken: accessToken,
      path: ApiPaths.bookingRiderCancel(bookingId),
      data: {'reason': reason},
    );
  }

  @override
  Future<Booking> acknowledge({
    required String accessToken,
    required String bookingId,
  }) {
    return _mutate(
      accessToken: accessToken,
      path: ApiPaths.bookingAcknowledge(bookingId),
    );
  }

  @override
  Future<MatchingStatus> matchingStatus({
    required String accessToken,
    required String bookingId,
  }) async {
    _client.setAccessToken(accessToken);
    try {
      final response =
          await _client.dio.get(ApiPaths.matchingBookingStatus(bookingId));
      return MatchingStatus.fromJson(_dataMap(response.data));
    } on DioException catch (error) {
      throw _asApiException(error);
    }
  }

  Future<Booking> _mutate({
    required String accessToken,
    required String path,
    Map<String, dynamic>? data,
  }) async {
    _client.setAccessToken(accessToken);
    try {
      final response = await _client.dio.post(path, data: data ?? const {});
      return Booking.fromJson(_dataMap(response.data));
    } on DioException catch (error) {
      throw _asApiException(error);
    }
  }

  Map<String, dynamic> _dataMap(Object? body) {
    if (body is Map && body['data'] is Map) {
      return Map<String, dynamic>.from(body['data'] as Map);
    }
    if (body is Map<String, dynamic>) return body;
    if (body is Map) return Map<String, dynamic>.from(body);
    throw const ApiException(
      code: 'BAD_RESPONSE',
      message: 'Unexpected server response.',
    );
  }

  ApiException _asApiException(DioException error) {
    if (error.error is ApiException) return error.error! as ApiException;
    return ApiException.fromJson(
      error.response?.data,
      statusCode: error.response?.statusCode,
    );
  }
}

final bookingsApiProvider = Provider<BookingsApi>((ref) {
  return LiveBookingsApi(ref.watch(apiClientProvider));
});
