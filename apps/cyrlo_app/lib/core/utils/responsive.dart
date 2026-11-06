import 'package:flutter/material.dart';

abstract final class Responsive {
  static const double compactMax = 400;
  static const double mediumMax = 600;

  static double widthOf(BuildContext context) => MediaQuery.sizeOf(context).width;

  static double pagePadding(BuildContext context) {
    final width = widthOf(context);
    if (width <= compactMax) return 12;
    if (width < mediumMax) return 16;
    return 20;
  }

  static EdgeInsets pageInsets(
    BuildContext context, {
    double top = 0,
    double bottom = 0,
  }) {
    final gutter = pagePadding(context);
    return EdgeInsets.fromLTRB(gutter, top, gutter, bottom);
  }

  static double formMaxWidth(BuildContext context) {
    final shortest = MediaQuery.sizeOf(context).shortestSide;
    if (shortest >= 600) return 520;
    return 460;
  }
}
