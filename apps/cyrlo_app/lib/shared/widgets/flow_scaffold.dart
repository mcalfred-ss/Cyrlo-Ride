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
    this.scrollable = true,
  });

  final Widget child;
  final Widget? footer;
  final bool scrollable;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      body: CenteredFrame(
        child: TweenAnimationBuilder<double>(
          tween: Tween(begin: 0.94, end: 1),
          duration: AppMotion.fast,
          curve: AppMotion.standard,
          builder: (context, value, child) {
            return Opacity(
              opacity: value.clamp(0.0, 1.0),
              child: Transform.translate(
                offset: Offset(0, (1 - value) * 8),
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
                  child: scrollable
                      ? LayoutBuilder(
                          builder: (context, constraints) {
                            return SingleChildScrollView(
                              child: ConstrainedBox(
                                constraints: BoxConstraints(minHeight: constraints.maxHeight),
                                child: Center(child: child),
                              ),
                            );
                          },
                        )
                      : child,
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
