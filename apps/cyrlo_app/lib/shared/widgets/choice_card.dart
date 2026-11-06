import 'package:flutter/material.dart';

import '../../core/constants/app_colors.dart';
import '../../core/theme/app_motion.dart';

class ChoiceCard extends StatelessWidget {
  const ChoiceCard({
    super.key,
    required this.title,
    required this.subtitle,
    this.icon,
    this.onTap,
    this.enabled = true,
  });

  final String title;
  final String subtitle;
  final IconData? icon;
  final VoidCallback? onTap;
  final bool enabled;

  @override
  Widget build(BuildContext context) {
    return Opacity(
      opacity: enabled ? 1 : 0.55,
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: enabled ? onTap : null,
          borderRadius: BorderRadius.circular(20),
          child: Ink(
            decoration: BoxDecoration(
              color: AppColors.field,
              borderRadius: BorderRadius.circular(20),
              border: Border.all(color: AppColors.border),
            ),
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Row(
                children: [
                  if (icon != null) ...[
                    Container(
                      width: 48,
                      height: 48,
                      decoration: BoxDecoration(
                        color: AppColors.surface,
                        borderRadius: BorderRadius.circular(16),
                      ),
                      child: Icon(icon, color: AppColors.darkGrey),
                    ),
                    const SizedBox(width: 14),
                  ],
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          title,
                          style: Theme.of(context).textTheme.titleMedium?.copyWith(
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                        const SizedBox(height: 2),
                        Text(
                          subtitle,
                          style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                            color: enabled ? AppColors.textSecondary : AppColors.darkGrey,
                            fontWeight: enabled ? FontWeight.w600 : FontWeight.w800,
                          ),
                        ),
                      ],
                    ),
                  ),
                  if (enabled)
                    const Icon(Icons.chevron_right_rounded, color: AppColors.darkGrey),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class IconBadge extends StatelessWidget {
  const IconBadge({super.key, required this.icon});

  final IconData icon;

  @override
  Widget build(BuildContext context) {
    return TweenAnimationBuilder<double>(
      tween: Tween(begin: 0.92, end: 1),
      duration: AppMotion.page,
      curve: AppMotion.standard,
      builder: (context, scale, child) => Transform.scale(scale: scale, child: child),
      child: Container(
        width: 88,
        height: 88,
        decoration: BoxDecoration(
          color: AppColors.brandLight,
          borderRadius: BorderRadius.circular(28),
        ),
        child: Icon(icon, size: 40, color: AppColors.darkGrey),
      ),
    );
  }
}
