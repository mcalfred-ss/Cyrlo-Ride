import 'package:flutter/material.dart';

import '../../../core/constants/app_colors.dart';
import '../../../core/theme/app_motion.dart';

class NotificationBellButton extends StatelessWidget {
  const NotificationBellButton({
    super.key,
    required this.unreadCount,
    required this.onPressed,
  });

  final int unreadCount;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: AppColors.yellow,
      borderRadius: BorderRadius.circular(14),
      child: InkWell(
        key: const Key('notification-bell'),
        onTap: onPressed,
        borderRadius: BorderRadius.circular(14),
        child: SizedBox(
          width: 44,
          height: 44,
          child: Stack(
            clipBehavior: Clip.none,
            alignment: Alignment.center,
            children: [
              const Icon(
                Icons.notifications_rounded,
                color: AppColors.darkGrey,
                size: 22,
              ),
              if (unreadCount > 0)
                Positioned(
                  top: 6,
                  right: 7,
                  child: TweenAnimationBuilder<double>(
                    tween: Tween(begin: 0.7, end: 1),
                    duration: AppMotion.fast,
                    curve: AppMotion.standard,
                    builder: (context, scale, child) {
                      return Transform.scale(scale: scale, child: child);
                    },
                    child: Container(
                      constraints: const BoxConstraints(minWidth: 16, minHeight: 16),
                      padding: const EdgeInsets.symmetric(horizontal: 4),
                      alignment: Alignment.center,
                      decoration: BoxDecoration(
                        color: AppColors.tomato,
                        borderRadius: BorderRadius.circular(999),
                        border: Border.all(color: AppColors.yellow, width: 1.5),
                      ),
                      child: Text(
                        unreadCount > 9 ? '9+' : '$unreadCount',
                        style: const TextStyle(
                          color: Colors.white,
                          fontSize: 9,
                          fontWeight: FontWeight.w800,
                          height: 1,
                        ),
                      ),
                    ),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}
