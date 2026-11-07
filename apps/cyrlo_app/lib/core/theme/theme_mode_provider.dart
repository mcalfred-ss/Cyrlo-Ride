import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

enum AppThemePreference {
  system,
  light,
  dark,
}

extension AppThemePreferenceX on AppThemePreference {
  ThemeMode get themeMode => switch (this) {
        AppThemePreference.system => ThemeMode.system,
        AppThemePreference.light => ThemeMode.light,
        AppThemePreference.dark => ThemeMode.dark,
      };

  String get label => switch (this) {
        AppThemePreference.system => 'System',
        AppThemePreference.light => 'Light',
        AppThemePreference.dark => 'Dark',
      };

  IconData get icon => switch (this) {
        AppThemePreference.system => Icons.brightness_auto_rounded,
        AppThemePreference.light => Icons.light_mode_rounded,
        AppThemePreference.dark => Icons.dark_mode_rounded,
      };
}

final themePreferenceProvider =
    NotifierProvider<ThemePreferenceController, AppThemePreference>(
  ThemePreferenceController.new,
);

class ThemePreferenceController extends Notifier<AppThemePreference> {
  @override
  AppThemePreference build() => AppThemePreference.dark;

  void setPreference(AppThemePreference preference) {
    if (state == preference) return;
    state = preference;
  }
}
