import 'package:flutter/animation.dart';

abstract final class AppMotion {
  static const Duration fast = Duration(milliseconds: 180);
  static const Duration normal = Duration(milliseconds: 260);
  static const Curve standard = Curves.easeOutCubic;
}
