import 'package:flutter/material.dart';

import '../../core/theme/app_motion.dart';

abstract final class AppIllustrations {
  static const welcomeRide = 'assets/illustrations/welcome_ride.jpg';
  static const bookRide = 'assets/illustrations/book_ride.jpg';
  static const nearbyMap = 'assets/illustrations/nearby_map.jpg';
  static const rideOrDrive = 'assets/illustrations/ride_or_drive.jpg';
  static const rolePassenger = 'assets/illustrations/role_passenger.jpg';
  static const roleRider = 'assets/illustrations/role_rider.jpg';
  static const vehiclePragya = 'assets/illustrations/vehicle_pragya.jpg';
  static const vehicleOkada = 'assets/illustrations/vehicle_okada.jpg';
  static const vehicleAboboyaa = 'assets/illustrations/vehicle_aboboyaa.jpg';
}

class IllustrationView extends StatelessWidget {
  const IllustrationView({
    super.key,
    required this.asset,
    this.height = 180,
  });

  final String asset;
  final double height;

  @override
  Widget build(BuildContext context) {
    return TweenAnimationBuilder<double>(
      tween: Tween(begin: 0.94, end: 1),
      duration: AppMotion.page,
      curve: AppMotion.standard,
      builder: (context, scale, child) {
        final t = ((scale - 0.94) / 0.06).clamp(0.0, 1.0);
        return Opacity(
          opacity: t,
          child: Transform.scale(scale: 0.94 + (t * 0.06), child: child),
        );
      },
      child: SizedBox(
        height: height,
        width: double.infinity,
        child: Image.asset(
          asset,
          height: height,
          fit: BoxFit.contain,
          alignment: Alignment.center,
          filterQuality: FilterQuality.high,
          semanticLabel: 'Illustration',
        ),
      ),
    );
  }
}
