import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/constants/app_colors.dart';
import '../../../core/routing/app_routes.dart';
import '../../../core/theme/app_motion.dart';
import '../../../core/theme/app_radii.dart';
import '../../../core/theme/app_spacing.dart';
import '../../map/presentation/top_down_vehicle_painter.dart';
import '../application/passenger_notifications_provider.dart';
import '../domain/passenger_notification.dart';

Future<void> showPassengerNotificationsSheet(BuildContext context) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    isDismissible: true,
    enableDrag: true,
    backgroundColor: Colors.transparent,
    barrierColor: Colors.black.withValues(alpha: 0.35),
    builder: (context) => const PassengerNotificationsSheet(),
  );
}

class PassengerNotificationsSheet extends ConsumerWidget {
  const PassengerNotificationsSheet({super.key});

  void _openAction(
    BuildContext context,
    PassengerNotificationAction action,
  ) {
    Navigator.of(context).pop();
    switch (action) {
      case PassengerNotificationAction.home:
        context.go(AppRoutes.passengerHome);
      case PassengerNotificationAction.map:
        context.go(AppRoutes.passengerMap);
      case PassengerNotificationAction.none:
        break;
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final notifications = ref.watch(passengerNotificationsProvider);
    final unread = notifications.where((item) => !item.read).length;
    final theme = Theme.of(context);
    final height = MediaQuery.sizeOf(context).height * 0.72;

    return GestureDetector(
      onTap: () => Navigator.of(context).pop(),
      behavior: HitTestBehavior.opaque,
      child: Align(
        alignment: Alignment.bottomCenter,
        child: GestureDetector(
          onTap: () {},
          child: ConstrainedBox(
            constraints: BoxConstraints(maxHeight: height, maxWidth: 520),
            child: Material(
              color: AppColors.surface,
              borderRadius: const BorderRadius.vertical(top: Radius.circular(28)),
              clipBehavior: Clip.antiAlias,
              child: SafeArea(
                top: false,
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const SizedBox(height: 10),
                    Container(
                      width: 42,
                      height: 4,
                      decoration: BoxDecoration(
                        color: AppColors.border,
                        borderRadius: BorderRadius.circular(AppRadii.pill),
                      ),
                    ),
                    Padding(
                      padding: const EdgeInsets.fromLTRB(20, 16, 12, 8),
                      child: Row(
                        children: [
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  'Notifications',
                                  style: theme.textTheme.titleLarge?.copyWith(
                                    fontWeight: FontWeight.w800,
                                    color: AppColors.textPrimary,
                                  ),
                                ),
                                const SizedBox(height: 2),
                                Text(
                                  notifications.isEmpty
                                      ? 'Ride updates will show up here'
                                      : unread == 0
                                          ? 'You’re all caught up'
                                          : unread == 1
                                              ? '1 new update'
                                              : '$unread new updates',
                                  style: theme.textTheme.bodyMedium?.copyWith(
                                    color: AppColors.textSecondary,
                                    fontWeight: FontWeight.w500,
                                  ),
                                ),
                              ],
                            ),
                          ),
                          if (unread > 0)
                            TextButton(
                              key: const Key('mark-notifications-read'),
                              onPressed: () {
                                ref
                                    .read(passengerNotificationsProvider.notifier)
                                    .markAllRead();
                              },
                              child: const Text('Mark all read'),
                            ),
                        ],
                      ),
                    ),
                    Flexible(
                      child: notifications.isEmpty
                          ? Padding(
                              padding: const EdgeInsets.fromLTRB(24, 28, 24, 40),
                              child: Column(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  Icon(
                                    Icons.notifications_none_rounded,
                                    size: 40,
                                    color: AppColors.textSecondary,
                                  ),
                                  const SizedBox(height: 12),
                                  Text(
                                    'No ride updates yet',
                                    textAlign: TextAlign.center,
                                    style: theme.textTheme.titleSmall?.copyWith(
                                      fontWeight: FontWeight.w800,
                                      color: AppColors.textPrimary,
                                    ),
                                  ),
                                  const SizedBox(height: 6),
                                  Text(
                                    'When you request a ride, or a rider accepts / finishes, you’ll see it here.',
                                    textAlign: TextAlign.center,
                                    style: theme.textTheme.bodyMedium?.copyWith(
                                      color: AppColors.textSecondary,
                                      height: 1.4,
                                      fontWeight: FontWeight.w500,
                                    ),
                                  ),
                                ],
                              ),
                            )
                          : ListView.separated(
                              padding: const EdgeInsets.fromLTRB(16, 4, 16, 20),
                              shrinkWrap: true,
                              itemCount: notifications.length,
                              separatorBuilder: (context, index) =>
                                  const SizedBox(height: AppSpacing.sm),
                              itemBuilder: (context, index) {
                                final item = notifications[index];
                                return _NotificationTile(
                                  notification: item,
                                  onTap: () {
                                    ref
                                        .read(
                                          passengerNotificationsProvider.notifier,
                                        )
                                        .markRead(item.id);
                                    _openAction(context, item.action);
                                  },
                                );
                              },
                            ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _NotificationTile extends StatelessWidget {
  const _NotificationTile({
    required this.notification,
    required this.onTap,
  });

  final PassengerNotification notification;
  final VoidCallback onTap;

  IconData get _icon => switch (notification.kind) {
        PassengerNotificationKind.riderNearby => Icons.two_wheeler_rounded,
        PassengerNotificationKind.rideUpdate => Icons.route_rounded,
        PassengerNotificationKind.promo => Icons.auto_awesome_rounded,
      };

  Color get _iconBg {
    final kind = notification.vehicleKind;
    if (kind != null) return MapVehicleColors.primary(kind);
    return switch (notification.kind) {
      PassengerNotificationKind.riderNearby => MapVehicleColors.pragya,
      PassengerNotificationKind.rideUpdate => AppColors.darkGrey,
      PassengerNotificationKind.promo => AppColors.brandLight,
    };
  }

  Color get _iconColor {
    if (notification.vehicleKind != null) return Colors.white;
    return switch (notification.kind) {
      PassengerNotificationKind.riderNearby => Colors.white,
      PassengerNotificationKind.rideUpdate => AppColors.yellow,
      PassengerNotificationKind.promo => AppColors.onBrandLight,
    };
  }

  String get _timeLabel {
    final diff = DateTime.now().difference(notification.createdAt);
    if (diff.inMinutes < 1) return 'Just now';
    if (diff.inMinutes < 60) return '${diff.inMinutes}m ago';
    if (diff.inHours < 24) return '${diff.inHours}h ago';
    if (diff.inDays == 1) return 'Yesterday';
    return '${diff.inDays}d ago';
  }

  String? get _actionHint => switch (notification.action) {
        PassengerNotificationAction.home => 'Open Home',
        PassengerNotificationAction.map => 'Open Map',
        PassengerNotificationAction.none => null,
      };

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final unread = !notification.read;

    return TweenAnimationBuilder<double>(
      tween: Tween(begin: 0.96, end: 1),
      duration: AppMotion.normal,
      curve: AppMotion.standard,
      builder: (context, scale, child) {
        return Transform.scale(scale: scale, child: child);
      },
      child: Material(
        color: unread ? AppColors.brandLight.withValues(alpha: 0.55) : AppColors.field,
        borderRadius: BorderRadius.circular(AppRadii.lg),
        child: InkWell(
          key: Key('notification-${notification.id}'),
          onTap: onTap,
          borderRadius: BorderRadius.circular(AppRadii.lg),
          child: Padding(
            padding: const EdgeInsets.all(14),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Container(
                  width: 42,
                  height: 42,
                  decoration: BoxDecoration(
                    color: _iconBg,
                    borderRadius: BorderRadius.circular(14),
                  ),
                  child: Icon(_icon, color: _iconColor, size: 20),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Expanded(
                            child: Text(
                              notification.title,
                              style: theme.textTheme.titleSmall?.copyWith(
                                color: AppColors.textPrimary,
                                fontWeight: FontWeight.w800,
                              ),
                            ),
                          ),
                          if (unread)
                            Container(
                              width: 8,
                              height: 8,
                              margin: const EdgeInsets.only(left: 8, top: 4),
                              decoration: const BoxDecoration(
                                color: AppColors.tomato,
                                shape: BoxShape.circle,
                              ),
                            ),
                        ],
                      ),
                      const SizedBox(height: 4),
                      Text(
                        notification.body,
                        style: theme.textTheme.bodyMedium?.copyWith(
                          color: AppColors.textSecondary,
                          height: 1.35,
                          fontWeight: FontWeight.w500,
                        ),
                      ),
                      const SizedBox(height: 8),
                      Row(
                        children: [
                          Text(
                            _timeLabel,
                            style: theme.textTheme.labelMedium?.copyWith(
                              color: AppColors.textSecondary,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                          if (_actionHint != null) ...[
                            const SizedBox(width: 10),
                            Text(
                              _actionHint!,
                              style: theme.textTheme.labelMedium?.copyWith(
                                color: AppColors.textPrimary,
                                fontWeight: FontWeight.w800,
                              ),
                            ),
                          ],
                        ],
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
