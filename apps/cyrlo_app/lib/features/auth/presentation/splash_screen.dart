import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/theme/app_motion.dart';
import '../application/signup_controller.dart' show authBootstrapProvider, signupProvider;

class SplashScreen extends ConsumerStatefulWidget {
  const SplashScreen({super.key});

  static const asset = 'assets/Splash/cyrlo-ride.png';

  @override
  ConsumerState<SplashScreen> createState() => _SplashScreenState();
}

class _SplashScreenState extends ConsumerState<SplashScreen>
    with SingleTickerProviderStateMixin {
  late final AnimationController _fade;
  var _leaving = false;

  @override
  void initState() {
    super.initState();
    _fade = AnimationController(
      vsync: this,
      duration: AppMotion.page,
      value: 0,
    )..forward();
    Future<void>.delayed(const Duration(milliseconds: 1800), _fadeOutAndContinue);
  }

  Future<void> _fadeOutAndContinue() async {
    if (!mounted || _leaving) return;
    // Wait for session/draft restore so returning users skip Create account.
    final ready = ref.read(authBootstrapProvider);
    if (!ready) {
      Future<void>.delayed(const Duration(milliseconds: 100), _fadeOutAndContinue);
      return;
    }
    _leaving = true;
    await _fade.reverse();
    if (!mounted) return;
    ref.read(signupProvider.notifier).finishSplash();
  }

  @override
  void dispose() {
    _fade.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      body: FadeTransition(
        opacity: _fade,
        child: SizedBox.expand(
          child: Image.asset(
            SplashScreen.asset,
            fit: BoxFit.cover,
            alignment: Alignment.center,
            filterQuality: FilterQuality.high,
            gaplessPlayback: true,
            semanticLabel: 'Cyrlo Ride',
          ),
        ),
      ),
    );
  }
}
