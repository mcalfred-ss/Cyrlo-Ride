import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/constants/app_colors.dart';
import 'passenger_cancel_notice.dart';

/// Shows a one-shot snackbar when the rider cancelled the passenger's pickup.
void listenForPassengerCancelNotice(WidgetRef ref, BuildContext context) {
  ref.listen<PassengerCancelNotice?>(passengerCancelNoticeProvider, (
    previous,
    next,
  ) {
    if (next == null) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        behavior: SnackBarBehavior.floating,
        backgroundColor: AppColors.darkGrey,
        duration: const Duration(seconds: 5),
        content: Text(
          '${next.title}. ${next.body}',
          style: const TextStyle(
            color: Colors.white,
            fontWeight: FontWeight.w700,
          ),
        ),
      ),
    );
    ref.read(passengerCancelNoticeProvider.notifier).clear();
  });
}
