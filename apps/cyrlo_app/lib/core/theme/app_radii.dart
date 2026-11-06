import 'package:flutter/material.dart';

abstract final class AppRadii {
  static const double sm = 12;
  static const double md = 14;
  static const double lg = 16;
  static const double xl = 18;
  static const double xxl = 24;
  static const double pill = 999;

  static BorderRadius get mdAll => BorderRadius.circular(md);
  static BorderRadius get lgAll => BorderRadius.circular(lg);
  static BorderRadius get pillAll => BorderRadius.circular(pill);

  static RoundedRectangleBorder get buttonShape =>
      RoundedRectangleBorder(borderRadius: BorderRadius.circular(28));

  static RoundedRectangleBorder get sheetShape => const RoundedRectangleBorder(
    borderRadius: BorderRadius.vertical(top: Radius.circular(xl)),
  );
}
