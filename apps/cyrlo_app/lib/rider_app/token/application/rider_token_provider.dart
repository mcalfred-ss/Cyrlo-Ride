import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/errors/api_exception.dart';
import '../../../features/auth/application/auth_session.dart';
import '../data/wallet_api.dart';
import '../domain/rider_token.dart';

final riderTokenWalletProvider =
    NotifierProvider<RiderTokenController, RiderTokenWallet>(
  RiderTokenController.new,
);

class RiderTokenController extends Notifier<RiderTokenWallet> {
  @override
  RiderTokenWallet build() {
    Future.microtask(refresh);
    return const RiderTokenWallet(
      balance: 0,
      packages: [],
      activity: [],
      isLoading: true,
    );
  }

  Future<void> refresh() async {
    final session = ref.read(authSessionProvider);
    if (session == null) {
      state = const RiderTokenWallet(
        balance: 0,
        packages: [],
        activity: [],
        isLoading: false,
      );
      return;
    }
    final keep = state;
    state = RiderTokenWallet(
      balance: keep.balance,
      packages: keep.packages,
      activity: keep.activity,
      isLoading: !keep.hasContent,
    );
    final api = ref.read(walletApiProvider);
    try {
      final balance = await api.balance(session.accessToken);
      final packages = await api.listPackages(session.accessToken);
      final ledger = await api.ledger(session.accessToken);
      state = RiderTokenWallet(
        balance: balance,
        packages: [
          for (var i = 0; i < packages.length; i++)
            TokenPackage(
              id: packages[i].code,
              name: packages[i].name,
              tokens: packages[i].tokenQuantity,
              priceLabel: packages[i].priceLabel,
              subtitle: '${packages[i].tokenQuantity} tokens',
              featured: i == 1,
            ),
        ],
        activity: [
          for (final entry in ledger)
            TokenActivity(
              id: entry.id,
              title: entry.reason.isEmpty ? entry.type : entry.reason,
              subtitle: entry.tokenDelta >= 0
                  ? '+${entry.tokenDelta} tokens'
                  : '${entry.tokenDelta} tokens',
              delta: entry.tokenDelta,
              occurredAt: entry.createdAt.toLocal(),
            ),
        ],
        isLoading: false,
      );
    } catch (_) {
      state = RiderTokenWallet(
        balance: keep.balance,
        packages: keep.packages,
        activity: keep.activity,
        isLoading: false,
      );
    }
  }

  /// Starts Paystack checkout for a package; returns authorization URL.
  Future<String> buyPackage(TokenPackage pack) async {
    final session = ref.read(authSessionProvider);
    if (session == null) {
      throw const ApiException(
        code: 'UNAUTHORIZED',
        message: 'Sign in again to buy tokens.',
      );
    }
    final checkout = await ref.read(walletApiProvider).purchase(
          accessToken: session.accessToken,
          packageCode: pack.id,
        );
    if (checkout.authorizationUrl.isEmpty) {
      throw const ApiException(
        code: 'PAYMENT_UNAVAILABLE',
        message: 'Payment link was not returned.',
      );
    }
    return checkout.authorizationUrl;
  }
}
