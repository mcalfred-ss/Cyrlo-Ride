import 'package:flutter/widgets.dart';

import '../utils/responsive.dart';

/// 4 · 8 · 12 · 16 · 20 · 24 · 32 · 40 · 48
abstract final class AppSpacing {
  static const double xxs = 4;
  static const double xs = 8;
  static const double sm = 12;
  static const double md = 16;
  static const double mdPlus = 20;
  static const double lg = 24;
  static const double xl = 32;
  static const double xxl = 40;
  static const double xxxl = 48;
  static const double touchTarget = 48;
  static const double buttonHeight = 52;

  static const EdgeInsets allXs = EdgeInsets.all(xs);
  static const EdgeInsets allSm = EdgeInsets.all(sm);
  static const EdgeInsets allMd = EdgeInsets.all(md);
  static const EdgeInsets allLg = EdgeInsets.all(lg);
  static const EdgeInsets allXl = EdgeInsets.all(xl);

  static EdgeInsets page(
    BuildContext context, {
    double top = 0,
    double bottom = 0,
  }) => Responsive.pageInsets(context, top: top, bottom: bottom);
}
