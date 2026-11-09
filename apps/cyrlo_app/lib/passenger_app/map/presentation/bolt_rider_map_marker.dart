import 'package:flutter/material.dart';

import '../../../features/auth/application/signup_draft.dart';
import '../../home/domain/nearby_rider.dart';
import 'top_down_vehicle_painter.dart';

/// Bird’s-eye vehicle on the map — illustration only, with selection pulse.
class BoltRiderMapMarker extends StatefulWidget {
  const BoltRiderMapMarker({
    super.key,
    required this.rider,
    this.selected = false,
    this.headingRadians = 0,
  });

  final NearbyRider rider;
  final bool selected;
  final double headingRadians;

  @override
  State<BoltRiderMapMarker> createState() => _BoltRiderMapMarkerState();
}

class _BoltRiderMapMarkerState extends State<BoltRiderMapMarker>
    with SingleTickerProviderStateMixin {
  late final AnimationController _pulse;

  @override
  void initState() {
    super.initState();
    _pulse = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1100),
    );
    if (widget.selected) {
      _pulse.repeat(reverse: true);
    }
  }

  @override
  void didUpdateWidget(covariant BoltRiderMapMarker oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.selected && !_pulse.isAnimating) {
      _pulse.repeat(reverse: true);
    } else if (!widget.selected && _pulse.isAnimating) {
      _pulse
        ..stop()
        ..value = 0;
    }
  }

  @override
  void dispose() {
    _pulse.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final size = topDownVehicleSize(selected: widget.selected);
    final dimmed = !widget.rider.canRequest;

    return AnimatedBuilder(
      animation: _pulse,
      builder: (context, child) {
        return SizedBox(
          width: size.width,
          height: size.height,
          child: Transform.rotate(
            angle: widget.headingRadians +
                topDownHeadingCorrection(widget.rider.kind),
            child: CustomPaint(
              size: size,
              painter: TopDownVehiclePainter(
                kind: widget.rider.kind,
                selected: widget.selected,
                dimmed: dimmed,
                pulse: widget.selected ? _pulse.value : 0,
              ),
            ),
          ),
        );
      },
    );
  }
}

String vehicleAssetFor(DriverKind kind) => switch (kind) {
      DriverKind.okada => 'assets/illustrations/vehicle_okada.jpg',
      DriverKind.pragya => 'assets/illustrations/vehicle_pragya.jpg',
      DriverKind.aboboyaa => 'assets/illustrations/vehicle_aboboyaa.jpg',
    };
