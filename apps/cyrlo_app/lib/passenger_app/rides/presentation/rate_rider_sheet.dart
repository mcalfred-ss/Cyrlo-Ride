import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/constants/app_colors.dart';
import '../../../core/theme/app_radii.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../features/auth/application/signup_controller.dart';
import '../../../shared/ride_session/pending_ride_review.dart';
import '../../../shared/widgets/cyrlo_button.dart';
import '../../home/application/rider_review_extras_provider.dart';
import '../../home/domain/nearby_rider.dart';
import '../application/passenger_rides_provider.dart';

Future<void> showRateRiderSheet(
  BuildContext context,
  WidgetRef ref, {
  required PendingRideReview pending,
}) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    isDismissible: true,
    backgroundColor: Colors.transparent,
    barrierColor: Colors.black.withValues(alpha: 0.35),
    builder: (context) => _RateRiderSheet(pending: pending),
  );
}

/// Opens the rate sheet whenever a completed trip is waiting for a review.
void listenForPendingRideReview(WidgetRef ref, BuildContext context) {
  ref.listen<PendingRideReview?>(pendingRideReviewProvider, (previous, next) {
    if (next == null) return;
    WidgetsBinding.instance.addPostFrameCallback((_) async {
      if (!context.mounted) return;
      await showRateRiderSheet(context, ref, pending: next);
      if (!context.mounted) return;
      final stillPending = ref.read(pendingRideReviewProvider);
      if (stillPending?.rideId == next.rideId) {
        ref.read(pendingRideReviewProvider.notifier).clear();
        ref
            .read(passengerRidesProvider.notifier)
            .dismissReviewPrompt(next.rideId);
      }
    });
  });
}

class _RateRiderSheet extends ConsumerStatefulWidget {
  const _RateRiderSheet({required this.pending});

  final PendingRideReview pending;

  @override
  ConsumerState<_RateRiderSheet> createState() => _RateRiderSheetState();
}

class _RateRiderSheetState extends ConsumerState<_RateRiderSheet> {
  var _rating = 0;
  final _commentController = TextEditingController();
  String? _error;

  @override
  void dispose() {
    _commentController.dispose();
    super.dispose();
  }

  void _submit() {
    if (_rating < 1) {
      setState(() => _error = 'Tap a star rating first.');
      return;
    }

    final draft = ref.read(signupProvider);
    final passengerName = draft.passengerFirstName?.trim().isNotEmpty == true
        ? draft.passengerFirstName!.trim()
        : (draft.passengerName?.trim().isNotEmpty == true
            ? draft.passengerName!.split(RegExp(r'\s+')).first
            : 'Passenger');

    final comment = _commentController.text.trim();
    ref.read(passengerRidesProvider.notifier).submitReview(
          rideId: widget.pending.rideId,
          rating: _rating,
          comment: comment.isEmpty ? null : comment,
        );

    ref.read(riderReviewExtrasProvider.notifier).add(
          widget.pending.riderId,
          RiderReview(
            id: 'rev-${widget.pending.rideId}',
            passengerName: passengerName,
            rating: _rating.toDouble(),
            comment: comment.isEmpty ? 'Rated $_rating stars' : comment,
            occurredAt: DateTime.now(),
          ),
        );

    ref.read(pendingRideReviewProvider.notifier).clear();
    Navigator.of(context).pop();
  }

  void _later() {
    ref
        .read(passengerRidesProvider.notifier)
        .dismissReviewPrompt(widget.pending.rideId);
    ref.read(pendingRideReviewProvider.notifier).clear();
    Navigator.of(context).pop();
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final pending = widget.pending;
    final bottomInset = MediaQuery.viewInsetsOf(context).bottom;

    return Padding(
      padding: EdgeInsets.only(bottom: bottomInset),
      child: Align(
        alignment: Alignment.bottomCenter,
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 520),
          child: Material(
            color: AppColors.surface,
            borderRadius: const BorderRadius.vertical(top: Radius.circular(28)),
            clipBehavior: Clip.antiAlias,
            child: SafeArea(
              top: false,
              child: SingleChildScrollView(
                padding: const EdgeInsets.fromLTRB(20, 10, 20, 20),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Center(
                      child: Container(
                        width: 42,
                        height: 4,
                        decoration: BoxDecoration(
                          color: AppColors.border,
                          borderRadius: BorderRadius.circular(AppRadii.pill),
                        ),
                      ),
                    ),
                    const SizedBox(height: 18),
                    Text(
                      'Rate your rider',
                      style: theme.textTheme.titleLarge?.copyWith(
                        color: AppColors.textPrimary,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                    const SizedBox(height: 6),
                    Text(
                      'How was ${pending.riderDisplayName}? Your rating helps other passengers.',
                      style: theme.textTheme.bodyMedium?.copyWith(
                        color: AppColors.textSecondary,
                        height: 1.4,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                    const SizedBox(height: AppSpacing.lg),
                    Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        for (var i = 1; i <= 5; i++)
                          IconButton(
                            key: Key('rate-star-$i'),
                            onPressed: () => setState(() {
                              _rating = i;
                              _error = null;
                            }),
                            iconSize: 36,
                            icon: Icon(
                              i <= _rating
                                  ? Icons.star_rounded
                                  : Icons.star_outline_rounded,
                              color: i <= _rating
                                  ? AppColors.yellow
                                  : AppColors.textSecondary,
                            ),
                          ),
                      ],
                    ),
                    const SizedBox(height: AppSpacing.md),
                    TextField(
                      key: const Key('rate-rider-comment'),
                      controller: _commentController,
                      maxLines: 3,
                      maxLength: 160,
                      decoration: InputDecoration(
                        hintText: 'Optional short review',
                        filled: true,
                        fillColor: AppColors.field,
                        border: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(AppRadii.md),
                          borderSide: BorderSide(color: AppColors.border),
                        ),
                        enabledBorder: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(AppRadii.md),
                          borderSide: BorderSide(color: AppColors.border),
                        ),
                      ),
                    ),
                    if (_error != null) ...[
                      const SizedBox(height: AppSpacing.sm),
                      Text(
                        _error!,
                        style: const TextStyle(
                          color: AppColors.error,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ],
                    const SizedBox(height: AppSpacing.lg),
                    CyrloButton(
                      key: const Key('submit-rider-rating'),
                      label: 'Submit rating',
                      onPressed: _submit,
                    ),
                    const SizedBox(height: AppSpacing.sm),
                    CyrloButton(
                      key: const Key('rate-rider-later'),
                      label: 'Maybe later',
                      variant: CyrloButtonVariant.outlined,
                      onPressed: _later,
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
