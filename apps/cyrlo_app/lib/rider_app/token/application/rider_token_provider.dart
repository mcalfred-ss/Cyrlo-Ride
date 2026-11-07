import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../domain/rider_token.dart';

final riderTokenWalletProvider =
    NotifierProvider<RiderTokenController, RiderTokenWallet>(
  RiderTokenController.new,
);

class RiderTokenController extends Notifier<RiderTokenWallet> {
  @override
  RiderTokenWallet build() {
    final now = DateTime.now();
    return RiderTokenWallet(
      balance: 12,
      packages: const [
        TokenPackage(
          id: 'starter',
          name: 'Starter',
          tokens: 20,
          priceLabel: 'GHS 10',
          subtitle: 'Good for light days',
        ),
        TokenPackage(
          id: 'standard',
          name: 'Standard',
          tokens: 50,
          priceLabel: 'GHS 20',
          subtitle: 'Most popular pack',
          featured: true,
        ),
        TokenPackage(
          id: 'pro',
          name: 'Pro',
          tokens: 150,
          priceLabel: 'GHS 50',
          subtitle: 'Best value for busy riders',
        ),
      ],
      activity: [
        TokenActivity(
          id: 'act-1',
          title: 'Accepted pickup',
          subtitle: '1 token used',
          delta: -1,
          occurredAt: now.subtract(const Duration(hours: 2)),
        ),
        TokenActivity(
          id: 'act-2',
          title: 'Bought Standard pack',
          subtitle: '+50 tokens',
          delta: 50,
          occurredAt: now.subtract(const Duration(days: 1)),
        ),
        TokenActivity(
          id: 'act-3',
          title: 'Accepted pickup',
          subtitle: '1 token used',
          delta: -1,
          occurredAt: now.subtract(const Duration(days: 1, hours: 5)),
        ),
      ],
    );
  }

  /// Demo top-up until live Paystack packages land.
  void buyPackage(TokenPackage pack) {
    final now = DateTime.now();
    state = RiderTokenWallet(
      balance: state.balance + pack.tokens,
      packages: state.packages,
      activity: [
        TokenActivity(
          id: 'act-${now.millisecondsSinceEpoch}',
          title: 'Bought ${pack.name} pack',
          subtitle: '+${pack.tokens} tokens',
          delta: pack.tokens,
          occurredAt: now,
        ),
        ...state.activity,
      ],
    );
  }
}
