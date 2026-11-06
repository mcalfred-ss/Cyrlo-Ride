import 'package:flutter/animation.dart';

abstract final class AppMotion {
  static const Duration fast = Duration(milliseconds: 180);
  static const Duration normal = Duration(milliseconds: 280);
  static const Duration page = Duration(milliseconds: 420);
  static const Curve standard = Curves.easeOutCubic;
  static const Curve exit = Curves.easeInCubic;
}
