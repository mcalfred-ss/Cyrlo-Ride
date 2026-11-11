import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

import '../constants/app_colors.dart';
import 'app_motion.dart';
import 'app_radii.dart';
import 'app_spacing.dart';

abstract final class CyrloTheme {
  static ThemeData get light => _build(Brightness.light);
  static ThemeData get dark => _build(Brightness.dark);

  static ThemeData _build(Brightness brightness) {
    final isDark = brightness == Brightness.dark;
    final background = isDark ? AppColors.darkGreyDeep : const Color(0xFFF4F4F4);
    final surface = isDark ? AppColors.darkGrey : const Color(0xFFFFFFFF);
    final onSurface = isDark ? const Color(0xFFF5F5F5) : AppColors.darkGrey;
    final onSurfaceVariant = isDark ? const Color(0xFFB5B5B5) : const Color(0xFF6F6F6F);
    final border = isDark ? const Color(0xFF333333) : const Color(0xFFEEEEEE);
    final brandContainer = isDark ? AppColors.brandLightDark : AppColors.brandLightLight;
    final field = isDark ? AppColors.darkGreyRaised : const Color(0xFFF3F3F3);

    final colorScheme = ColorScheme(
      brightness: brightness,
      primary: AppColors.brand,
      onPrimary: AppColors.brandForeground,
      primaryContainer: brandContainer,
      onPrimaryContainer: isDark ? AppColors.brand : AppColors.brandDark,
      secondary: AppColors.mango,
      onSecondary: AppColors.mangoForeground,
      error: AppColors.tomato,
      onError: AppColors.tomatoForeground,
      surface: surface,
      onSurface: onSurface,
      onSurfaceVariant: onSurfaceVariant,
    );

    final family = GoogleFonts.plusJakartaSans().fontFamily;
    final baseText = ThemeData(brightness: brightness, useMaterial3: true).textTheme.apply(
      fontFamily: family,
      bodyColor: onSurface,
      displayColor: onSurface,
    );
    final textTheme = baseText.copyWith(
          headlineMedium: baseText.headlineMedium?.copyWith(
            color: onSurface,
            fontWeight: FontWeight.w800,
            letterSpacing: -0.6,
          ),
          headlineSmall: baseText.headlineSmall?.copyWith(
            color: onSurface,
            fontWeight: FontWeight.w800,
          ),
          titleLarge: baseText.titleLarge?.copyWith(
            color: onSurface,
            fontWeight: FontWeight.w800,
          ),
          titleMedium: baseText.titleMedium?.copyWith(
            color: onSurface,
            fontWeight: FontWeight.w800,
          ),
          titleSmall: baseText.titleSmall?.copyWith(
            color: onSurface,
            fontWeight: FontWeight.w700,
          ),
          bodyLarge: baseText.bodyLarge?.copyWith(color: onSurface),
          bodyMedium: baseText.bodyMedium?.copyWith(color: onSurface),
          bodySmall: baseText.bodySmall?.copyWith(color: onSurfaceVariant),
          labelLarge: baseText.labelLarge?.copyWith(
            color: onSurface,
            fontWeight: FontWeight.w700,
          ),
        );

    ButtonStyle filledStyle({required Color background, required Color foreground}) {
      return ButtonStyle(
        minimumSize: const WidgetStatePropertyAll(
          Size(AppSpacing.touchTarget, AppSpacing.buttonHeight),
        ),
        shape: WidgetStatePropertyAll(AppRadii.buttonShape),
        textStyle: WidgetStatePropertyAll(
          textTheme.labelLarge?.copyWith(
            fontWeight: FontWeight.w800,
            color: foreground,
          ),
        ),
        backgroundColor: WidgetStateProperty.resolveWith((states) {
          if (states.contains(WidgetState.disabled)) return AppColors.disabled;
          return background;
        }),
        foregroundColor: WidgetStateProperty.resolveWith((states) {
          if (states.contains(WidgetState.disabled)) return AppColors.onDisabled;
          return foreground;
        }),
        animationDuration: AppMotion.fast,
      );
    }

    return ThemeData(
      useMaterial3: true,
      brightness: brightness,
      colorScheme: colorScheme,
      scaffoldBackgroundColor: background,
      textTheme: textTheme,
      iconTheme: IconThemeData(color: onSurface),
      dividerColor: border,
      appBarTheme: AppBarTheme(
        backgroundColor: background,
        foregroundColor: onSurface,
        elevation: 0,
        scrolledUnderElevation: 0,
        centerTitle: true,
        titleTextStyle: textTheme.titleLarge?.copyWith(
          fontWeight: FontWeight.w800,
          color: onSurface,
        ),
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: filledStyle(
          background: AppColors.brand,
          foreground: AppColors.brandForeground,
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: filledStyle(
          background: Colors.transparent,
          foreground: isDark ? AppColors.brand : AppColors.brandDark,
        ).copyWith(
          backgroundColor: const WidgetStatePropertyAll(Colors.transparent),
          side: WidgetStatePropertyAll(
            BorderSide(color: isDark ? AppColors.brand : AppColors.brandDark),
          ),
        ),
      ),
      textButtonTheme: TextButtonThemeData(
        style: TextButton.styleFrom(
          foregroundColor: AppColors.onBrandSoft,
          textStyle: textTheme.labelLarge?.copyWith(fontWeight: FontWeight.w800),
        ),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: field,
        hintStyle: textTheme.bodyMedium?.copyWith(
          color: onSurfaceVariant.withValues(alpha: 0.7),
        ),
        border: OutlineInputBorder(
          borderRadius: AppRadii.mdAll,
          borderSide: BorderSide.none,
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: AppRadii.mdAll,
          borderSide: BorderSide(color: border),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: AppRadii.mdAll,
          borderSide: const BorderSide(color: AppColors.brand, width: 1.5),
        ),
        errorBorder: OutlineInputBorder(
          borderRadius: AppRadii.mdAll,
          borderSide: const BorderSide(color: AppColors.tomato),
        ),
        contentPadding: const EdgeInsets.symmetric(
          horizontal: AppSpacing.md,
          vertical: AppSpacing.md,
        ),
      ),
      navigationBarTheme: NavigationBarThemeData(
        height: 64,
        backgroundColor: AppColors.darkGrey,
        indicatorColor: AppColors.yellow.withValues(alpha: 0.22),
        surfaceTintColor: Colors.transparent,
        iconTheme: WidgetStateProperty.resolveWith((states) {
          final selected = states.contains(WidgetState.selected);
          return IconThemeData(
            color: selected ? AppColors.yellow : const Color(0xFFC8C8C8),
          );
        }),
        labelTextStyle: WidgetStateProperty.resolveWith((states) {
          final selected = states.contains(WidgetState.selected);
          return textTheme.labelSmall?.copyWith(
            color: selected ? AppColors.yellow : const Color(0xFFC8C8C8),
            fontWeight: selected ? FontWeight.w900 : FontWeight.w700,
          );
        }),
      ),
      progressIndicatorTheme: const ProgressIndicatorThemeData(color: AppColors.brand),
    );
  }
}
