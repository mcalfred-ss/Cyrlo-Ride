import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/constants/app_colors.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../features/auth/application/signup_controller.dart';
import '../../../shared/widgets/choice_card.dart';
import '../../../shared/widgets/flow_scaffold.dart';
import '../../../shared/widgets/illustration_view.dart';
import '../../../shared/widgets/screen_header.dart';
import '../data/rider_onboarding_models.dart';

class DriverTypeScreen extends ConsumerWidget {
  const DriverTypeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return FlowScaffold(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const ScreenHeader(
            title: 'What do you drive?',
            subtitle: 'Choose the vehicle you will use for rides.',
          ),
          const SizedBox(height: AppSpacing.xl),
          ChoiceCard(
            key: const Key('driver-okada'),
            illustrationAsset: AppIllustrations.vehicleOkada,
            title: 'Okada',
            subtitle: 'Motorcycle',
            onTap: () => ref
                .read(signupProvider.notifier)
                .chooseVehicleCategory(VehicleCategory.okada),
          ),
          const SizedBox(height: AppSpacing.sm),
          ChoiceCard(
            key: const Key('driver-pragya'),
            illustrationAsset: AppIllustrations.vehiclePragya,
            title: 'Pragya',
            subtitle: 'Three-wheeler',
            onTap: () => ref
                .read(signupProvider.notifier)
                .chooseVehicleCategory(VehicleCategory.pragya),
          ),
          const SizedBox(height: AppSpacing.sm),
          ChoiceCard(
            key: const Key('driver-aboboyaa'),
            illustrationAsset: AppIllustrations.vehicleAboboyaa,
            title: 'Aboboyaa',
            subtitle: 'Cargo three-wheeler',
            onTap: () => ref
                .read(signupProvider.notifier)
                .chooseVehicleCategory(VehicleCategory.aboboyaa),
          ),
          const SizedBox(height: AppSpacing.lg),
          Center(
            child: Material(
              color: AppColors.field,
              shape: const CircleBorder(),
              child: InkWell(
                key: const Key('driver-type-back'),
                customBorder: const CircleBorder(),
                onTap: () => ref.read(signupProvider.notifier).clearRole(),
                child: SizedBox(
                  width: 48,
                  height: 48,
                  child: Icon(
                    Icons.arrow_back_rounded,
                    color: AppColors.textPrimary,
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
