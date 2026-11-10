import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/constants/api_paths.dart';
import '../../../core/errors/api_exception.dart';
import '../../../core/network/api_client.dart';
import '../../../shared/providers/core_providers.dart';

class WalletPackage {
  const WalletPackage({
    required this.id,
    required this.code,
    required this.name,
    required this.tokenQuantity,
    required this.pricePesewas,
    required this.currency,
  });

  final String id;
  final String code;
  final String name;
  final int tokenQuantity;
  final int pricePesewas;
  final String currency;

  String get priceLabel {
    final cedis = pricePesewas / 100;
    final text =
        cedis == cedis.roundToDouble() ? cedis.toStringAsFixed(0) : cedis.toStringAsFixed(2);
    return 'GHS $text';
  }

  factory WalletPackage.fromJson(Map<String, dynamic> json) {
    return WalletPackage(
      id: json['id'] as String,
      code: json['code'] as String? ?? '',
      name: json['name'] as String? ?? 'Pack',
      tokenQuantity: (json['tokenQuantity'] as num?)?.toInt() ?? 0,
      pricePesewas: (json['pricePesewas'] as num?)?.toInt() ?? 0,
      currency: json['currency'] as String? ?? 'GHS',
    );
  }
}

class WalletLedgerEntry {
  const WalletLedgerEntry({
    required this.id,
    required this.type,
    required this.tokenDelta,
    required this.balanceAfter,
    required this.reason,
    required this.createdAt,
  });

  final String id;
  final String type;
  final int tokenDelta;
  final int balanceAfter;
  final String reason;
  final DateTime createdAt;

  factory WalletLedgerEntry.fromJson(Map<String, dynamic> json) {
    return WalletLedgerEntry(
      id: json['id'] as String,
      type: json['type'] as String? ?? '',
      tokenDelta: (json['tokenDelta'] as num?)?.toInt() ?? 0,
      balanceAfter: (json['balanceAfter'] as num?)?.toInt() ?? 0,
      reason: json['reason'] as String? ?? json['kind'] as String? ?? '',
      createdAt: DateTime.tryParse(json['createdAt'] as String? ?? '') ??
          DateTime.now().toUtc(),
    );
  }
}

class WalletPurchaseCheckout {
  const WalletPurchaseCheckout({
    required this.purchaseId,
    required this.authorizationUrl,
    required this.amountPesewas,
    required this.tokenQuantity,
    required this.packageName,
  });

  final String purchaseId;
  final String authorizationUrl;
  final int amountPesewas;
  final int tokenQuantity;
  final String packageName;

  factory WalletPurchaseCheckout.fromJson(Map<String, dynamic> json) {
    return WalletPurchaseCheckout(
      purchaseId: json['purchaseId'] as String,
      authorizationUrl: json['authorizationUrl'] as String? ?? '',
      amountPesewas: (json['amountPesewas'] as num?)?.toInt() ?? 0,
      tokenQuantity: (json['tokenQuantity'] as num?)?.toInt() ?? 0,
      packageName: json['packageName'] as String? ?? 'Pack',
    );
  }
}

abstract class WalletApi {
  Future<List<WalletPackage>> listPackages(String accessToken);
  Future<int> balance(String accessToken);
  Future<List<WalletLedgerEntry>> ledger(String accessToken);
  Future<WalletPurchaseCheckout> purchase({
    required String accessToken,
    required String packageCode,
  });
}

class LiveWalletApi implements WalletApi {
  LiveWalletApi(this._client);

  final ApiClient _client;

  @override
  Future<List<WalletPackage>> listPackages(String accessToken) async {
    _client.setAccessToken(accessToken);
    try {
      final response = await _client.dio.get(ApiPaths.walletPackages);
      final raw = _listData(response.data);
      return [
        for (final item in raw)
          if (item is Map) WalletPackage.fromJson(Map<String, dynamic>.from(item)),
      ];
    } on DioException catch (error) {
      throw _asApiException(error);
    }
  }

  @override
  Future<int> balance(String accessToken) async {
    _client.setAccessToken(accessToken);
    try {
      final response = await _client.dio.get(ApiPaths.walletBalance);
      final data = _dataMap(response.data);
      return (data['tokenBalance'] as num?)?.toInt() ?? 0;
    } on DioException catch (error) {
      throw _asApiException(error);
    }
  }

  @override
  Future<List<WalletLedgerEntry>> ledger(String accessToken) async {
    _client.setAccessToken(accessToken);
    try {
      final response = await _client.dio.get(
        ApiPaths.walletLedger,
        queryParameters: const {'page': 1, 'pageSize': 30},
      );
      final data = _dataMap(response.data);
      final raw = data['items'];
      if (raw is! List) return const [];
      return [
        for (final item in raw)
          if (item is Map)
            WalletLedgerEntry.fromJson(Map<String, dynamic>.from(item)),
      ];
    } on DioException catch (error) {
      throw _asApiException(error);
    }
  }

  @override
  Future<WalletPurchaseCheckout> purchase({
    required String accessToken,
    required String packageCode,
  }) async {
    _client.setAccessToken(accessToken);
    try {
      final response = await _client.dio.post(
        ApiPaths.walletPurchases,
        data: {'packageCode': packageCode},
      );
      return WalletPurchaseCheckout.fromJson(_dataMap(response.data));
    } on DioException catch (error) {
      throw _asApiException(error);
    }
  }

  List<dynamic> _listData(Object? body) {
    if (body is Map && body['data'] is List) return body['data'] as List;
    if (body is List) return body;
    return const [];
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

final walletApiProvider = Provider<WalletApi>((ref) {
  return LiveWalletApi(ref.watch(apiClientProvider));
});
