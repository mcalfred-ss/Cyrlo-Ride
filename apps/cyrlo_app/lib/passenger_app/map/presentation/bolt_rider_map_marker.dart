import 'package:flutter/material.dart';

import '../../../core/constants/app_colors.dart';
import '../../../core/theme/app_radii.dart';
import '../../../features/auth/application/signup_draft.dart';
import '../../../shared/widgets/illustration_view.dart';
import '../../home/domain/nearby_rider.dart';

/// Bolt-style elevated vehicle pin: illustration floats above a soft ground shadow.
class BoltRiderMapMarker extends StatelessWidget {
  const BoltRiderMapMarker({
    super.key,
    required this.rider,
    this.selected = false,
    this.headingRadians = 0,
  });

  final NearbyRider rider;
  final bool selected;
  final double headingRadians;

  static String assetFor(DriverKind kind) => switch (kind) {
        DriverKind.okada => AppIllustrations.vehicleOkada,
        DriverKind.pragya => AppIllustrations.vehiclePragya,
        DriverKind.aboboyaa => AppIllustrations.vehicleAboboyaa,
      };

  @override
  Widget build(BuildContext context) {
    final size = selected ? 64.0 : 54.0;
    final opacity = rider.canRequest ? 1.0 : 0.55;

    return SizedBox(
      width: size + 8,
      height: size + 14,
      child: Opacity(
        opacity: opacity,
        child: Stack(
          alignment: Alignment.bottomCenter,
          clipBehavior: Clip.none,
          children: [
            // Ground shadow — reads as “on top” of the map.
            Positioned(
              bottom: 0,
              child: Container(
                width: size * 0.72,
                height: 10,
                decoration: BoxDecoration(
                  color: Colors.black.withValues(alpha: selected ? 0.28 : 0.18),
                  borderRadius: BorderRadius.circular(20),
                  boxShadow: [
                    BoxShadow(
                      color: Colors.black.withValues(alpha: 0.22),
                      blurRadius: selected ? 10 : 7,
                      spreadRadius: 0.5,
                    ),
                  ],
                ),
              ),
            ),
            Positioned(
              bottom: 6,
              child: Transform.rotate(
                angle: headingRadians,
                child: AnimatedContainer(
                  duration: const Duration(milliseconds: 180),
                  width: size,
                  height: size * 0.78,
                  padding: const EdgeInsets.all(3),
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(AppRadii.md),
                    border: Border.all(
                      color: selected ? AppColors.yellow : Colors.white,
                      width: selected ? 2.4 : 1.2,
                    ),
                    boxShadow: [
                      BoxShadow(
                        color: Colors.black.withValues(alpha: 0.22),
                        blurRadius: selected ? 14 : 10,
                        offset: const Offset(0, 5),
                      ),
                    ],
                  ),
                  child: ClipRRect(
                    borderRadius: BorderRadius.circular(10),
                    child: ColoredBox(
                      color: const Color(0xFFF4F4F4),
                      child: Image.asset(
                        assetFor(rider.kind),
                        fit: BoxFit.cover,
                        alignment: Alignment.center,
                        filterQuality: FilterQuality.high,
                        gaplessPlayback: true,
                        errorBuilder: (context, error, stackTrace) {
                          return Icon(
                            Icons.two_wheeler_rounded,
                            color: AppColors.darkGrey,
                            size: size * 0.4,
                          );
                        },
                      ),
                    ),
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
