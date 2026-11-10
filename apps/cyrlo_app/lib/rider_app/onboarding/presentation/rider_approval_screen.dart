import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/constants/app_colors.dart';
import '../../../core/errors/api_exception.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../features/auth/application/signup_controller.dart';
import '../../../shared/widgets/choice_card.dart';
import '../../../shared/widgets/cyrlo_button.dart';
import '../../../shared/widgets/flow_scaffold.dart';
import '../../../shared/widgets/screen_header.dart';

class RiderApprovalScreen extends ConsumerStatefulWidget {
  const RiderApprovalScreen({super.key});

  @override
  ConsumerState<RiderApprovalScreen> createState() =>
      _RiderApprovalScreenState();
}

class _RiderApprovalScreenState extends ConsumerState<RiderApprovalScreen> {
  Timer? _timer;
  var _checking = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    Future.microtask(_refresh);
    _timer = Timer.periodic(const Duration(seconds: 15), (_) => _refresh());
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  Future<void> _refresh() async {
    if (_checking) return;
    setState(() {
      _checking = true;
      _error = null;
    });
    try {
      await ref.read(signupProvider.notifier).refreshRiderApplicationStatus();
    } on ApiException catch (error) {
      if (mounted) setState(() => _error = error.message);
    } catch (_) {
      if (mounted) {
        setState(() => _error = 'Could not refresh status. Trying again…');
      }
    } finally {
      if (mounted) setState(() => _checking = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final draft = ref.watch(signupProvider);
    final name = draft.riderName ?? 'Your application';
    final rejected = draft.riderRejectionReason != null &&
        draft.riderRejectionReason!.trim().isNotEmpty &&
        !draft.riderApproved;

    return FlowScaffold(
      footer: rejected
          ? CyrloButton(
              key: const Key('rider-resubmit'),
              label: 'Edit and resubmit',
              onPressed: () =>
                  ref.read(signupProvider.notifier).resetForResubmit(),
            )
          : CyrloButton(
              key: const Key('rider-refresh-status'),
              label: _checking ? 'Checking…' : 'Check status',
              onPressed: _checking ? null : _refresh,
            ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          IconBadge(
            icon: rejected
                ? Icons.error_outline_rounded
                : Icons.hourglass_top_rounded,
          ),
          const SizedBox(height: AppSpacing.lg),
          ScreenHeader(
            title: rejected ? 'Application needs changes' : 'Waiting for approval',
            subtitle: rejected
                ? (draft.riderRejectionReason ??
                    'Your application was rejected. Update your details and resubmit.')
                : '$name is with the Cyrlo team. This screen stays here until you are accepted, then your rider home opens.',
          ),
          if (_error != null) ...[
            const SizedBox(height: AppSpacing.md),
            Text(
              _error!,
              textAlign: TextAlign.center,
              style: const TextStyle(color: AppColors.error),
            ),
          ],
        ],
      ),
    );
  }
}
