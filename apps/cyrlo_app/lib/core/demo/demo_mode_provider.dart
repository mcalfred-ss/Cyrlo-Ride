import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Investor pitch mode — mock map riders, no real Paystack, optional pinned GPS.
const demoModePrefsKey = 'cyrlo.demo_mode';

/// Kumasi / Kokobin pilot pin used when Demo Mode overrides rider GPS.
const demoPilotLatitude = 6.6885;
const demoPilotLongitude = -1.6244;

final demoModeProvider =
    NotifierProvider<DemoModeController, bool>(DemoModeController.new);

class DemoModeController extends Notifier<bool> {
  @override
  bool build() {
    Future.microtask(_restore);
    return false;
  }

  Future<void> _restore() async {
    final prefs = await SharedPreferences.getInstance();
    if (!ref.mounted) return;
    state = prefs.getBool(demoModePrefsKey) ?? false;
  }

  Future<void> setEnabled(bool enabled) async {
    if (state == enabled) return;
    state = enabled;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool(demoModePrefsKey, enabled);
  }
}
