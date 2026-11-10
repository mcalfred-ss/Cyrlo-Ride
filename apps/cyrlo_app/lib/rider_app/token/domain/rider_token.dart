class TokenPackage {
  const TokenPackage({
    required this.id,
    required this.name,
    required this.tokens,
    required this.priceLabel,
    required this.subtitle,
    this.featured = false,
  });

  final String id;
  final String name;
  final int tokens;
  final String priceLabel;
  final String subtitle;
  final bool featured;
}

class TokenActivity {
  const TokenActivity({
    required this.id,
    required this.title,
    required this.subtitle,
    required this.delta,
    required this.occurredAt,
  });

  final String id;
  final String title;
  final String subtitle;
  final int delta;
  final DateTime occurredAt;

  bool get isCredit => delta > 0;
}

class RiderTokenWallet {
  const RiderTokenWallet({
    required this.balance,
    required this.packages,
    required this.activity,
    this.isLoading = false,
  });

  final int balance;
  final List<TokenPackage> packages;
  final List<TokenActivity> activity;
  final bool isLoading;

  bool get hasContent => packages.isNotEmpty || balance > 0 || activity.isNotEmpty;
}
