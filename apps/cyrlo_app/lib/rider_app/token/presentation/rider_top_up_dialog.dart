import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../../core/constants/app_colors.dart';
import '../../../core/routing/app_routes.dart';

/// Returns true if the rider chose to open the token / top-up screen.
Future<bool> showRiderTopUpDialog(
  BuildContext context, {
  required String title,
  required String message,
  String confirmLabel = 'Buy tokens',
  String cancelLabel = 'Not now',
}) async {
  final goBuy = await showDialog<bool>(
    context: context,
    builder: (context) => AlertDialog(
      backgroundColor: AppColors.surface,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(24)),
      title: Text(title),
      content: Text(
        message,
        style: const TextStyle(height: 1.4),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.of(context).pop(false),
          child: Text(cancelLabel),
        ),
        FilledButton(
          key: const Key('top-up-buy-tokens'),
          onPressed: () => Navigator.of(context).pop(true),
          child: Text(confirmLabel),
        ),
      ],
    ),
  );
  if (goBuy == true && context.mounted) {
    context.go(AppRoutes.riderToken);
    return true;
  }
  return false;
}
