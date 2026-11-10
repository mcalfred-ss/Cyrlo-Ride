import 'dart:async';

import 'package:dio/dio.dart';

import '../errors/api_exception.dart';

typedef UnauthorizedHandler = Future<bool> Function();

class ApiClient {
  ApiClient({required String baseUrl, Dio? dio}) : dio = dio ?? _createDio(baseUrl) {
    final client = this.dio;
    client.interceptors.add(
      InterceptorsWrapper(
        onResponse: (response, handler) {
          final body = response.data;
          if (body is Map && body['success'] == false) {
            handler.reject(
              DioException(
                requestOptions: response.requestOptions,
                response: response,
                error: ApiException.fromJson(
                  body,
                  statusCode: response.statusCode,
                ),
              ),
            );
            return;
          }
          handler.next(response);
        },
        onError: (error, handler) async {
          final response = error.response;
          final options = error.requestOptions;
          final skipRefresh = options.extra['skipAuthRefresh'] == true;
          final alreadyRetried = options.extra['authRetried'] == true;
          final isUnauthorized = response?.statusCode == 401;

          if (isUnauthorized &&
              !skipRefresh &&
              !alreadyRetried &&
              onUnauthorized != null) {
            final refreshed = await onUnauthorized!.call();
            if (refreshed) {
              options.extra['authRetried'] = true;
              final authHeader = client.options.headers['Authorization'];
              if (authHeader != null) {
                options.headers['Authorization'] = authHeader;
              }
              try {
                final replay = await client.fetch(options);
                handler.resolve(replay);
                return;
              } on DioException catch (retryError) {
                handler.next(_asApiException(retryError));
                return;
              }
            }
          }

          handler.next(_asApiException(error));
        },
      ),
    );
  }

  final Dio dio;

  static Dio _createDio(String baseUrl) {
    return Dio(
      BaseOptions(
        baseUrl: baseUrl,
        connectTimeout: const Duration(seconds: 10),
        receiveTimeout: const Duration(seconds: 20),
        headers: const {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        },
      ),
    );
  }

  /// Returns true when a fresh access token was stored and the caller may retry.
  UnauthorizedHandler? onUnauthorized;

  void setAccessToken(String? token) {
    if (token == null || token.isEmpty) {
      dio.options.headers.remove('Authorization');
      return;
    }
    dio.options.headers['Authorization'] = 'Bearer $token';
  }

  DioException _asApiException(DioException error) {
    if (error.error is ApiException) return error;
    final response = error.response;
    if (response == null) return error;
    return DioException(
      requestOptions: error.requestOptions,
      response: response,
      error: ApiException.fromJson(
        response.data,
        statusCode: response.statusCode,
      ),
      type: error.type,
    );
  }
}
