import 'package:flutter/material.dart';

import '../../core/constants/app_colors.dart';
import '../../core/theme/app_motion.dart';

/// Yellow circle + check burst used after a successful step.
class SuccessCheckAnimation extends StatefulWidget {
  const SuccessCheckAnimation({
    super.key,
    this.size = 96,
    this.label = 'Verified',
  });

  final double size;
  final String label;

  @override
  State<SuccessCheckAnimation> createState() => _SuccessCheckAnimationState();
}

class _SuccessCheckAnimationState extends State<SuccessCheckAnimation>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 900),
  );

  late final Animation<double> _ring = CurvedAnimation(
    parent: _controller,
    curve: const Interval(0, 0.45, curve: AppMotion.standard),
  );
  late final Animation<double> _check = CurvedAnimation(
    parent: _controller,
    curve: const Interval(0.35, 0.85, curve: AppMotion.standard),
  );
  late final Animation<double> _label = CurvedAnimation(
    parent: _controller,
    curve: const Interval(0.55, 1, curve: AppMotion.standard),
  );

  @override
  void initState() {
    super.initState();
    _controller.forward();
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return AnimatedBuilder(
      animation: _controller,
      builder: (context, child) {
        return Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            SizedBox(
              width: widget.size,
              height: widget.size,
              child: Stack(
                alignment: Alignment.center,
                children: [
                  Transform.scale(
                    scale: 0.72 + (_ring.value * 0.28),
                    child: Opacity(
                      opacity: _ring.value.clamp(0.0, 1.0),
                      child: Container(
                        width: widget.size,
                        height: widget.size,
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          color: AppColors.yellow.withValues(alpha: 0.18),
                          border: Border.all(color: AppColors.yellow, width: 3),
                        ),
                      ),
                    ),
                  ),
                  Transform.scale(
                    scale: 0.55 + (_check.value * 0.45),
                    child: Opacity(
                      opacity: _check.value.clamp(0.0, 1.0),
                      child: Container(
                        width: widget.size * 0.62,
                        height: widget.size * 0.62,
                        decoration: const BoxDecoration(
                          shape: BoxShape.circle,
                          color: AppColors.yellow,
                        ),
                        child: Icon(
                          Icons.check_rounded,
                          size: widget.size * 0.36,
                          color: AppColors.darkGrey,
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 16),
            Opacity(
              opacity: _label.value.clamp(0.0, 1.0),
              child: Transform.translate(
                offset: Offset(0, (1 - _label.value) * 8),
                child: Text(
                  widget.label,
                  style: theme.textTheme.titleMedium?.copyWith(
                    color: AppColors.textPrimary,
                    fontWeight: FontWeight.w800,
                  ),
                ),
              ),
            ),
          ],
        );
      },
    );
  }
}
