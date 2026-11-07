import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/constants/app_colors.dart';
import '../../../core/theme/app_motion.dart';
import '../../../core/theme/app_radii.dart';
import '../../../core/theme/app_spacing.dart';
import '../application/rider_token_provider.dart';
import '../domain/rider_token.dart';

class RiderTokenScreen extends ConsumerWidget {
  const RiderTokenScreen({super.key});

  Future<void> _buyPackage(
    BuildContext context,
    WidgetRef ref,
    TokenPackage pack,
  ) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        backgroundColor: AppColors.surface,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(24)),
        title: Text('Buy ${pack.name}?'),
        content: Text(
          'Add ${pack.tokens} tokens for ${pack.priceLabel}. Payment stays demo for now.',
          style: const TextStyle(height: 1.4),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            key: Key('confirm-buy-${pack.id}'),
            onPressed: () => Navigator.of(context).pop(true),
            child: const Text('Buy pack'),
          ),
        ],
      ),
    );
    if (ok != true || !context.mounted) return;
    ref.read(riderTokenWalletProvider.notifier).buyPackage(pack);
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        behavior: SnackBarBehavior.floating,
        backgroundColor: AppColors.darkGrey,
        content: Text(
          '${pack.tokens} tokens added to your wallet.',
          style: const TextStyle(fontWeight: FontWeight.w700),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final wallet = ref.watch(riderTokenWalletProvider);
    final theme = Theme.of(context);

    return SizedBox.expand(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(20, 12, 20, 0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              'Token',
              style: theme.textTheme.headlineSmall?.copyWith(
                color: AppColors.textPrimary,
                fontWeight: FontWeight.w800,
                letterSpacing: -0.4,
                height: 1.15,
              ),
            ),
            const SizedBox(height: 6),
            Text(
              '1 token opens 1 pickup job. Top up when you’re running low.',
              style: theme.textTheme.bodyLarge?.copyWith(
                color: AppColors.textSecondary,
                fontWeight: FontWeight.w500,
                height: 1.35,
              ),
            ),
            const SizedBox(height: AppSpacing.lg),
            Expanded(
              child: ListView(
                children: [
                  _BalanceCard(balance: wallet.balance),
                  const SizedBox(height: AppSpacing.lg),
                  Text(
                    'Buy tokens',
                    style: theme.textTheme.titleSmall?.copyWith(
                      color: AppColors.textPrimary,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                  const SizedBox(height: AppSpacing.sm),
                  for (var i = 0; i < wallet.packages.length; i++) ...[
                    _PackageCard(
                      pack: wallet.packages[i],
                      index: i,
                      onBuy: () => _buyPackage(context, ref, wallet.packages[i]),
                    ),
                    if (i != wallet.packages.length - 1)
                      const SizedBox(height: AppSpacing.sm),
                  ],
                  const SizedBox(height: AppSpacing.lg),
                  Text(
                    'Recent activity',
                    style: theme.textTheme.titleSmall?.copyWith(
                      color: AppColors.textPrimary,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                  const SizedBox(height: AppSpacing.sm),
                  DecoratedBox(
                    decoration: BoxDecoration(
                      color: AppColors.surface,
                      borderRadius: BorderRadius.circular(AppRadii.lg),
                      border: Border.all(color: AppColors.border),
                    ),
                    child: Column(
                      children: [
                        for (var i = 0; i < wallet.activity.length; i++) ...[
                          _ActivityRow(item: wallet.activity[i]),
                          if (i != wallet.activity.length - 1)
                            const Divider(height: 1),
                        ],
                      ],
                    ),
                  ),
                  const SizedBox(height: AppSpacing.md),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _BalanceCard extends StatelessWidget {
  const _BalanceCard({required this.balance});

  final int balance;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return TweenAnimationBuilder<double>(
      tween: Tween(begin: 0.96, end: 1),
      duration: AppMotion.normal,
      curve: AppMotion.standard,
      builder: (context, scale, child) => Transform.scale(scale: scale, child: child),
      child: DecoratedBox(
        decoration: BoxDecoration(
          gradient: const LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [AppColors.yellow, Color(0xFFFFD84D)],
          ),
          borderRadius: BorderRadius.circular(AppRadii.lg),
          boxShadow: [
            BoxShadow(
              color: AppColors.elevationShadow(lightAlpha: 0.08),
              blurRadius: 18,
              offset: const Offset(0, 10),
            ),
          ],
        ),
        child: Padding(
          padding: const EdgeInsets.all(AppSpacing.lg),
          child: Row(
            children: [
              Container(
                width: 56,
                height: 56,
                decoration: BoxDecoration(
                  color: AppColors.darkGrey,
                  borderRadius: BorderRadius.circular(18),
                ),
                child: const Icon(
                  Icons.toll_rounded,
                  color: AppColors.yellow,
                  size: 28,
                ),
              ),
              const SizedBox(width: AppSpacing.md),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Wallet balance',
                      style: theme.textTheme.labelLarge?.copyWith(
                        color: AppColors.darkGrey,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      '$balance',
                      key: const Key('token-balance'),
                      style: theme.textTheme.headlineMedium?.copyWith(
                        color: AppColors.darkGrey,
                        fontWeight: FontWeight.w900,
                        letterSpacing: -0.8,
                      ),
                    ),
                    Text(
                      balance == 1 ? 'token ready' : 'tokens ready',
                      style: theme.textTheme.bodyMedium?.copyWith(
                        color: AppColors.darkGrey.withValues(alpha: 0.75),
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _PackageCard extends StatelessWidget {
  const _PackageCard({
    required this.pack,
    required this.index,
    required this.onBuy,
  });

  final TokenPackage pack;
  final int index;
  final VoidCallback onBuy;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return TweenAnimationBuilder<double>(
      tween: Tween(begin: 0.96, end: 1),
      duration: Duration(milliseconds: 220 + (index * 60)),
      curve: AppMotion.standard,
      builder: (context, scale, child) => Transform.scale(scale: scale, child: child),
      child: DecoratedBox(
        decoration: BoxDecoration(
          color: pack.featured ? AppColors.brandLight : AppColors.surface,
          borderRadius: BorderRadius.circular(AppRadii.lg),
          border: Border.all(
            color: pack.featured ? AppColors.yellow : AppColors.border,
            width: pack.featured ? 1.6 : 1,
          ),
          boxShadow: [
            BoxShadow(
              color: AppColors.elevationShadow(lightAlpha: 0.05),
              blurRadius: 16,
              offset: const Offset(0, 8),
            ),
          ],
        ),
        child: Padding(
          padding: const EdgeInsets.all(AppSpacing.md),
          child: Row(
            children: [
              Container(
                width: 52,
                height: 52,
                decoration: BoxDecoration(
                  color: pack.featured ? AppColors.yellow : AppColors.field,
                  borderRadius: BorderRadius.circular(16),
                ),
                child: Icon(
                  pack.featured ? Icons.star_rounded : Icons.toll_rounded,
                  color: pack.featured
                      ? AppColors.darkGrey
                      : AppColors.textPrimary,
                ),
              ),
              const SizedBox(width: AppSpacing.sm),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Text(
                          pack.name,
                          style: theme.textTheme.titleMedium?.copyWith(
                            color: AppColors.textPrimary,
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                        if (pack.featured) ...[
                          const SizedBox(width: 8),
                          Container(
                            padding: const EdgeInsets.symmetric(
                              horizontal: 8,
                              vertical: 3,
                            ),
                            decoration: BoxDecoration(
                              color: AppColors.darkGrey,
                              borderRadius: BorderRadius.circular(AppRadii.pill),
                            ),
                            child: Text(
                              'Popular',
                              style: theme.textTheme.labelSmall?.copyWith(
                                color: AppColors.yellow,
                                fontWeight: FontWeight.w800,
                              ),
                            ),
                          ),
                        ],
                      ],
                    ),
                    const SizedBox(height: 2),
                    Text(
                      '${pack.tokens} tokens · ${pack.subtitle}',
                      style: theme.textTheme.bodyMedium?.copyWith(
                        color: AppColors.textSecondary,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: AppSpacing.xs),
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Text(
                    pack.priceLabel,
                    style: theme.textTheme.titleSmall?.copyWith(
                      color: AppColors.textPrimary,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                  const SizedBox(height: 6),
                  FilledButton(
                    key: Key('buy-token-${pack.id}'),
                    onPressed: onBuy,
                    style: FilledButton.styleFrom(
                      backgroundColor: AppColors.darkGrey,
                      foregroundColor: AppColors.yellow,
                      minimumSize: const Size(72, 36),
                      padding: const EdgeInsets.symmetric(horizontal: 14),
                      textStyle: const TextStyle(fontWeight: FontWeight.w800),
                    ),
                    child: const Text('Buy'),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _ActivityRow extends StatelessWidget {
  const _ActivityRow({required this.item});

  final TokenActivity item;

  String get _whenLabel {
    final diff = DateTime.now().difference(item.occurredAt);
    if (diff.inMinutes < 60) return '${diff.inMinutes}m ago';
    if (diff.inHours < 24) return '${diff.inHours}h ago';
    if (diff.inDays == 1) return 'Yesterday';
    return '${diff.inDays}d ago';
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final credit = item.isCredit;
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      child: Row(
        children: [
          Container(
            width: 40,
            height: 40,
            decoration: BoxDecoration(
              color: credit ? AppColors.brandLight : AppColors.field,
              borderRadius: BorderRadius.circular(12),
            ),
            child: Icon(
              credit ? Icons.add_rounded : Icons.remove_rounded,
              color: credit ? AppColors.onBrandLight : AppColors.textPrimary,
              size: 20,
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  item.title,
                  style: theme.textTheme.titleSmall?.copyWith(
                    color: AppColors.textPrimary,
                    fontWeight: FontWeight.w800,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  '${item.subtitle} · $_whenLabel',
                  style: theme.textTheme.bodyMedium?.copyWith(
                    color: AppColors.textSecondary,
                    fontWeight: FontWeight.w500,
                  ),
                ),
              ],
            ),
          ),
          Text(
            credit ? '+${item.delta}' : '${item.delta}',
            style: theme.textTheme.titleSmall?.copyWith(
              color: credit ? const Color(0xFF1F8A4C) : AppColors.tomato,
              fontWeight: FontWeight.w800,
            ),
          ),
        ],
      ),
    );
  }
}
