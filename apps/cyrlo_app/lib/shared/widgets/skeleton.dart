import 'package:flutter/material.dart';

import '../../core/constants/app_colors.dart';
import '../../core/theme/app_radii.dart';
import '../../core/theme/app_spacing.dart';

/// Soft pulse placeholder used while remote content loads.
class SkeletonBox extends StatefulWidget {
  const SkeletonBox({
    super.key,
    required this.height,
    this.width,
    this.borderRadius,
  });

  final double height;
  final double? width;
  final BorderRadius? borderRadius;

  @override
  State<SkeletonBox> createState() => _SkeletonBoxState();
}

class _SkeletonBoxState extends State<SkeletonBox>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 1100),
  )..repeat(reverse: true);

  late final Animation<double> _opacity = Tween<double>(begin: 0.38, end: 0.72)
      .animate(CurvedAnimation(parent: _controller, curve: Curves.easeInOut));

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return FadeTransition(
      opacity: _opacity,
      child: Container(
        width: widget.width,
        height: widget.height,
        decoration: BoxDecoration(
          color: AppColors.field,
          borderRadius:
              widget.borderRadius ?? BorderRadius.circular(AppRadii.md),
        ),
      ),
    );
  }
}

class SkeletonLine extends StatelessWidget {
  const SkeletonLine({
    super.key,
    this.width,
    this.height = 12,
  });

  final double? width;
  final double height;

  @override
  Widget build(BuildContext context) {
    return SkeletonBox(
      width: width,
      height: height,
      borderRadius: BorderRadius.circular(999),
    );
  }
}

/// Avatar + two text lines — nearby riders, jobs, notifications, history.
class SkeletonListTile extends StatelessWidget {
  const SkeletonListTile({
    super.key,
    this.avatarSize = 72,
    this.showTrailing = true,
  });

  final double avatarSize;
  final bool showTrailing;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(AppSpacing.sm),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(AppRadii.lg),
        border: Border.all(color: AppColors.border),
      ),
      child: Row(
        children: [
          SkeletonBox(
            width: avatarSize,
            height: avatarSize,
            borderRadius: BorderRadius.circular(AppRadii.md),
          ),
          const SizedBox(width: AppSpacing.sm),
          const Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                SkeletonLine(width: 120, height: 14),
                SizedBox(height: 8),
                SkeletonLine(width: 180, height: 12),
                SizedBox(height: 6),
                SkeletonLine(width: 90, height: 10),
              ],
            ),
          ),
          if (showTrailing) ...[
            const SizedBox(width: AppSpacing.sm),
            const SkeletonBox(width: 64, height: 32),
          ],
        ],
      ),
    );
  }
}

class SkeletonList extends StatelessWidget {
  const SkeletonList({
    super.key,
    this.count = 4,
    this.avatarSize = 72,
    this.showTrailing = true,
  });

  final int count;
  final double avatarSize;
  final bool showTrailing;

  @override
  Widget build(BuildContext context) {
    return ListView.separated(
      itemCount: count,
      separatorBuilder: (_, __) => const SizedBox(height: AppSpacing.sm),
      itemBuilder: (_, __) => SkeletonListTile(
        avatarSize: avatarSize,
        showTrailing: showTrailing,
      ),
    );
  }
}

/// Token wallet first-load placeholder.
class TokenWalletSkeleton extends StatelessWidget {
  const TokenWalletSkeleton({super.key});

  @override
  Widget build(BuildContext context) {
    return ListView(
      children: [
        const SkeletonBox(height: 120),
        const SizedBox(height: AppSpacing.lg),
        const SkeletonLine(width: 100, height: 14),
        const SizedBox(height: AppSpacing.sm),
        for (var i = 0; i < 3; i++) ...[
          const SkeletonBox(height: 88),
          if (i != 2) const SizedBox(height: AppSpacing.sm),
        ],
        const SizedBox(height: AppSpacing.lg),
        const SkeletonLine(width: 130, height: 14),
        const SizedBox(height: AppSpacing.sm),
        const SkeletonBox(height: 140),
      ],
    );
  }
}

/// Account profile hydrate placeholder.
class AccountSkeleton extends StatelessWidget {
  const AccountSkeleton({super.key});

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.fromLTRB(20, 12, 20, 24),
      children: [
        const Center(
          child: SkeletonBox(
            width: 88,
            height: 88,
            borderRadius: BorderRadius.all(Radius.circular(44)),
          ),
        ),
        const SizedBox(height: AppSpacing.md),
        const Center(child: SkeletonLine(width: 160, height: 18)),
        const SizedBox(height: 8),
        const Center(child: SkeletonLine(width: 120, height: 12)),
        const SizedBox(height: AppSpacing.xl),
        for (var i = 0; i < 5; i++) ...[
          const SkeletonBox(height: 56),
          if (i != 4) const SizedBox(height: AppSpacing.sm),
        ],
      ],
    );
  }
}

/// In-app browser / checkout loading surface.
class WebPageSkeleton extends StatelessWidget {
  const WebPageSkeleton({super.key});

  @override
  Widget build(BuildContext context) {
    return const Padding(
      padding: EdgeInsets.all(20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          SkeletonLine(width: 180, height: 18),
          SizedBox(height: 16),
          SkeletonLine(height: 12),
          SizedBox(height: 10),
          SkeletonLine(width: 220, height: 12),
          SizedBox(height: 10),
          SkeletonLine(width: 160, height: 12),
          SizedBox(height: 24),
          Expanded(child: SkeletonBox(height: double.infinity)),
          SizedBox(height: 16),
          SkeletonBox(height: 48),
        ],
      ),
    );
  }
}
