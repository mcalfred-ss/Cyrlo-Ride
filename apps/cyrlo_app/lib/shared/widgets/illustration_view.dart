import 'package:flutter/material.dart';

import '../../core/constants/app_colors.dart';
import '../../core/theme/app_motion.dart';
import '../../core/theme/app_radii.dart';

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
  static const avatarMale1 = 'assets/illustrations/avatar_male_1.jpg';
  static const avatarMale2 = 'assets/illustrations/avatar_male_2.jpg';
  static const avatarFemale1 = 'assets/illustrations/avatar_female_1.jpg';
  static const avatarFemale2 = 'assets/illustrations/avatar_female_2.jpg';

  static const _darkByLight = {
    welcomeRide: 'assets/illustrations/welcome_ride_dark.jpg',
    bookRide: 'assets/illustrations/book_ride_dark.jpg',
    nearbyMap: 'assets/illustrations/nearby_map_dark.jpg',
    rideOrDrive: 'assets/illustrations/ride_or_drive_dark.jpg',
    rolePassenger: 'assets/illustrations/role_passenger_dark.jpg',
    roleRider: 'assets/illustrations/role_rider_dark.jpg',
    vehiclePragya: 'assets/illustrations/vehicle_pragya_dark.jpg',
    vehicleOkada: 'assets/illustrations/vehicle_okada_dark.jpg',
    vehicleAboboyaa: 'assets/illustrations/vehicle_aboboyaa_dark.jpg',
  };

  /// Picks the dark asset when available; otherwise falls back to [asset].
  static String forBrightness(String asset, Brightness brightness) {
    if (brightness != Brightness.dark) return asset;
    return _darkByLight[asset] ?? asset;
  }
}

/// Theme-aware nest behind illustrations.
/// Dark mode stays flush with the parent card (no second box).
class IllustrationPlate extends StatelessWidget {
  const IllustrationPlate({
    super.key,
    required this.child,
    this.borderRadius,
    this.padding = EdgeInsets.zero,
  });

  final Widget child;
  final BorderRadius? borderRadius;
  final EdgeInsetsGeometry padding;

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final radius = borderRadius ?? BorderRadius.circular(isDark ? 20 : AppRadii.lg);
    return ClipRRect(
      borderRadius: radius,
      child: ColoredBox(
        color: isDark ? Colors.transparent : AppColors.illustrationNest,
        child: Padding(padding: padding, child: child),
      ),
    );
  }
}

/// Shows light or dark illustration art based on the active theme.
class ThemedIllustrationImage extends StatelessWidget {
  const ThemedIllustrationImage({
    super.key,
    required this.asset,
    this.width,
    this.height,
    this.fit = BoxFit.contain,
    this.alignment = Alignment.center,
    this.semanticLabel,
  });

  final String asset;
  final double? width;
  final double? height;
  final BoxFit fit;
  final Alignment alignment;
  final String? semanticLabel;

  @override
  Widget build(BuildContext context) {
    final brightness = Theme.of(context).brightness;
    final resolved = AppIllustrations.forBrightness(asset, brightness);
    return Image.asset(
      resolved,
      width: width,
      height: height,
      fit: fit,
      alignment: alignment,
      filterQuality: FilterQuality.high,
      gaplessPlayback: true,
      semanticLabel: semanticLabel,
    );
  }
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
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final radius = BorderRadius.circular(isDark ? 20 : AppRadii.lg);

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
        child: ClipRRect(
          borderRadius: radius,
          child: ColoredBox(
            // Light: soft white nest. Dark: transparent so art fills the card cleanly.
            color: isDark ? Colors.transparent : AppColors.illustrationNest,
            child: ThemedIllustrationImage(
              asset: asset,
              height: height,
              width: double.infinity,
              // Cover fills the rounded box so dark art doesn’t sit as a second rectangle.
              fit: isDark ? BoxFit.cover : BoxFit.contain,
              semanticLabel: 'Illustration',
            ),
          ),
        ),
      ),
    );
  }
}
