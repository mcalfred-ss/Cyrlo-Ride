import 'package:flutter/material.dart';

import '../../core/constants/app_colors.dart';
import '../../core/theme/app_spacing.dart';

enum CyrloButtonVariant { primary, outlined }

class CyrloButton extends StatelessWidget {
  const CyrloButton({
    super.key,
    required this.label,
    required this.onPressed,
    this.variant = CyrloButtonVariant.primary,
    this.expand = true,
  });

  final String label;
  final VoidCallback? onPressed;
  final CyrloButtonVariant variant;
  final bool expand;

  @override
  Widget build(BuildContext context) {
    final size = Size(
      expand ? double.infinity : AppSpacing.touchTarget,
      AppSpacing.buttonHeight,
    );
    final isPrimary = variant == CyrloButtonVariant.primary;
    final child = Text(
      label,
      style: TextStyle(
        fontWeight: FontWeight.w800,
        color: isPrimary ? AppColors.darkGrey : AppColors.textPrimary,
      ),
    );

    final button = switch (variant) {
      CyrloButtonVariant.primary => FilledButton(
        onPressed: onPressed,
        style: FilledButton.styleFrom(
          minimumSize: size,
          backgroundColor: AppColors.yellow,
          foregroundColor: AppColors.darkGrey,
        ),
        child: child,
      ),
      CyrloButtonVariant.outlined => OutlinedButton(
        onPressed: onPressed,
        style: OutlinedButton.styleFrom(
          minimumSize: size,
          foregroundColor: AppColors.textPrimary,
          side: BorderSide(color: AppColors.border),
        ),
        child: child,
      ),
    };

    return Semantics(button: true, label: label, child: button);
  }
}
