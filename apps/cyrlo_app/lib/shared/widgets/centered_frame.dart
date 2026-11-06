import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../core/utils/responsive.dart';

/// Places a screen in the middle of the window and keeps it at phone width.
class CenteredFrame extends StatelessWidget {
  const CenteredFrame({
    super.key,
    required this.child,
    this.margin = 24,
  });

  final Widget child;
  final double margin;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final width = math.min(
          constraints.maxWidth - (margin * 2),
          Responsive.contentMaxWidth,
        );
        final height = math.max(0.0, constraints.maxHeight - (margin * 2));
        return SafeArea(
          child: Align(
            alignment: Alignment.center,
            child: SizedBox(
              width: width,
              height: height,
              child: child,
            ),
          ),
        );
      },
    );
  }
}
