import 'package:flutter/material.dart';

import '../../core/constants/app_colors.dart';
import '../../core/theme/app_motion.dart';
import 'centered_frame.dart';
import 'cyrlo_card.dart';

class FlowScaffold extends StatelessWidget {
  const FlowScaffold({
    super.key,
    required this.child,
    this.footer,
  });

  final Widget child;
  final Widget? footer;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      body: CenteredFrame(
        child: TweenAnimationBuilder<double>(
          tween: Tween(begin: 0, end: 1),
          duration: AppMotion.normal,
          curve: AppMotion.standard,
          builder: (context, value, child) {
            return Opacity(
              opacity: value,
              child: Transform.translate(
                offset: Offset(0, (1 - value) * 18),
                child: child,
              ),
            );
          },
          child: CyrloCard(
            padding: const EdgeInsets.fromLTRB(24, 28, 24, 24),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Expanded(
                  child: Center(
                    child: SingleChildScrollView(
                      child: child,
                    ),
                  ),
                ),
                if (footer != null) ...[
                  const SizedBox(height: 20),
                  footer!,
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }
}
