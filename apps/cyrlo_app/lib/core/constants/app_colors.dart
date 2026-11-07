import 'package:flutter/material.dart';

/// Yellow and dark grey. Surfaces follow the active brightness.
abstract final class AppColors {
  static Brightness _brightness = Brightness.light;

  static void applyBrightness(Brightness brightness) {
    _brightness = brightness;
  }

  static bool get isDark => _brightness == Brightness.dark;

  static const yellow = Color(0xFFF5C400);
  static const darkGrey = Color(0xFF2C2C2C);
  static const darkGreyDeep = Color(0xFF1A1A1A);
  static const darkGreyRaised = Color(0xFF3A3A3A);

  static const brand = yellow;
  static const brandForeground = darkGrey;
  static const brandDark = Color(0xFFC9A000);
  static const brandLightLight = Color(0xFFFFF4C2);
  /// Soft yellow nest in dark mode — stays bright enough for badges/pills.
  static const brandLightDark = Color(0xFF5C4E14);
  static const mango = yellow;
  static const mangoForeground = darkGrey;
  static const tomato = Color(0xFFEF4343);
  static const tomatoForeground = Color(0xFFFFFFFF);

  static const _surfaceLight = Color(0xFFFFFFFF);
  static const _surfaceDark = darkGrey;
  static const _surfaceAltLight = Color(0xFFF4F4F4);
  static const _surfaceAltDark = darkGreyDeep;
  static const _inkLight = darkGrey;
  static const _inkDark = Color(0xFFF5F5F5);
  static const _inkDimLight = Color(0xFF6F6F6F);
  static const _inkDimDark = Color(0xFFB5B5B5);
  static const _borderLight = Color(0xFFE4E4E4);
  static const _borderDark = Color(0xFF4A4A4A);
  static const _fieldLight = Color(0xFFF3F3F3);
  static const _fieldDark = darkGreyRaised;

  static Color get brandLight => isDark ? brandLightDark : brandLightLight;
  static Color get surface => isDark ? _surfaceDark : _surfaceLight;
  static Color get surfaceAlt => isDark ? _surfaceAltDark : _surfaceAltLight;
  static Color get ink => isDark ? _inkDark : _inkLight;
  static Color get inkDim => isDark ? _inkDimDark : _inkDimLight;
  static Color get border => isDark ? _borderDark : _borderLight;
  static Color get field => isDark ? _fieldDark : _fieldLight;
  static Color get background => surfaceAlt;
  static Color get textPrimary => ink;
  static Color get textSecondary => inkDim;
  static const primary = brand;
  static const error = tomato;

  /// Text/icons sitting on [brandLight] or yellow chips.
  static Color get onBrandLight => isDark ? _inkDark : darkGrey;

  /// Light nest for JPG illustrations that ship with a baked white board.
  /// Keeps art from flashing as a harsh white block on dark surfaces.
  static const illustrationNest = Color(0xFFF7F7F7);

  static Color get disabled =>
      isDark ? const Color(0xFF4A4A4A) : const Color(0xFFD6D6D6);
  static Color get onDisabled =>
      isDark ? const Color(0xFF9A9A9A) : const Color(0xFF8A8A8A);
  static Color get onBrandSoft => isDark ? yellow : brandDark;

  static Color elevationShadow({
    double lightAlpha = 0.07,
    double darkAlpha = 0.45,
  }) {
    return Colors.black.withValues(alpha: isDark ? darkAlpha : lightAlpha);
  }
}
