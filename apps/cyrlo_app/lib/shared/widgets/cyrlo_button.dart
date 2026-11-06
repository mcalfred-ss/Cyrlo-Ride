import 'package:flutter/material.dart';

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
    final child = Text(
      label,
      style: Theme.of(context).textTheme.labelLarge?.copyWith(
        fontWeight: FontWeight.w800,
      ),
    );

    final button = switch (variant) {
      CyrloButtonVariant.primary => FilledButton(
        onPressed: onPressed,
        style: FilledButton.styleFrom(minimumSize: size),
        child: child,
      ),
      CyrloButtonVariant.outlined => OutlinedButton(
        onPressed: onPressed,
        style: OutlinedButton.styleFrom(minimumSize: size),
        child: child,
      ),
    };

    return Semantics(button: true, label: label, child: button);
  }
}
