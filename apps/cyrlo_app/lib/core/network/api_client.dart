import 'package:dio/dio.dart';

import '../errors/api_exception.dart';

class ApiClient {
  ApiClient({required String baseUrl, Dio? dio})
    : dio =
          dio ??
          Dio(
            BaseOptions(
              baseUrl: baseUrl,
              connectTimeout: const Duration(seconds: 10),
              receiveTimeout: const Duration(seconds: 20),
              headers: const {
                'Accept': 'application/json',
                'Content-Type': 'application/json',
              },
            ),
          ) {
    this.dio.interceptors.add(
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
        onError: (error, handler) {
          final response = error.response;
          if (response != null && error.error is! ApiException) {
            handler.reject(
              DioException(
                requestOptions: error.requestOptions,
                response: response,
                error: ApiException.fromJson(
                  response.data,
                  statusCode: response.statusCode,
                ),
                type: error.type,
              ),
            );
            return;
          }
          handler.next(error);
        },
      ),
    );
  }

  final Dio dio;

  void setAccessToken(String? token) {
    if (token == null || token.isEmpty) {
      dio.options.headers.remove('Authorization');
      return;
    }
    dio.options.headers['Authorization'] = 'Bearer $token';
  }
}
