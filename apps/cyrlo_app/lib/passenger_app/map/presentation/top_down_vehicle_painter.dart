import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../../core/constants/app_colors.dart';
import '../../../features/auth/application/signup_draft.dart';

/// Flat bird’s-eye vehicle shapes for the map (no pin / no card container).
class TopDownVehiclePainter extends CustomPainter {
  TopDownVehiclePainter({
    required this.kind,
    required this.selected,
    required this.dimmed,
  });

  final DriverKind kind;
  final bool selected;
  final bool dimmed;

  @override
  void paint(Canvas canvas, Size size) {
    final cx = size.width / 2;
    final cy = size.height / 2;

    // Soft ground shadow under the vehicle.
    final shadow = Paint()
      ..color = Colors.black.withValues(alpha: selected ? 0.28 : 0.18)
      ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 3.5);
    canvas.drawOval(
      Rect.fromCenter(
        center: Offset(cx, cy + size.height * 0.06),
        width: size.width * 0.62,
        height: size.height * 0.22,
      ),
      shadow,
    );

    final body = Paint()
      ..color = AppColors.yellow.withValues(alpha: dimmed ? 0.72 : 1)
      ..style = PaintingStyle.fill;
    final accent = Paint()
      ..color = const Color(0xFF1F1F1F).withValues(alpha: dimmed ? 0.75 : 1)
      ..style = PaintingStyle.fill;
    final glass = Paint()
      ..color = const Color(0xFF9AD7FF).withValues(alpha: dimmed ? 0.55 : 0.9)
      ..style = PaintingStyle.fill;
    final outline = Paint()
      ..color = selected
          ? Colors.white.withValues(alpha: 0.95)
          : Colors.black.withValues(alpha: 0.35)
      ..style = PaintingStyle.stroke
      ..strokeWidth = selected ? 2.2 : 1.2;

    switch (kind) {
      case DriverKind.okada:
        _paintOkada(canvas, size, body, accent, glass, outline);
      case DriverKind.pragya:
        _paintPragya(canvas, size, body, accent, glass, outline);
      case DriverKind.aboboyaa:
        _paintAboboyaa(canvas, size, body, accent, glass, outline);
    }
  }

  /// Nose points “up” (toward negative Y). Marker rotation applies heading.
  void _paintOkada(
    Canvas canvas,
    Size size,
    Paint body,
    Paint accent,
    Paint glass,
    Paint outline,
  ) {
    final w = size.width;
    final h = size.height;
    final cx = w / 2;

    // Front wheel
    canvas.drawOval(
      Rect.fromCenter(
        center: Offset(cx, h * 0.18),
        width: w * 0.28,
        height: h * 0.16,
      ),
      accent,
    );
    // Rear wheel
    canvas.drawOval(
      Rect.fromCenter(
        center: Offset(cx, h * 0.82),
        width: w * 0.34,
        height: h * 0.18,
      ),
      accent,
    );

    final hull = Path()
      ..moveTo(cx, h * 0.12)
      ..quadraticBezierTo(w * 0.72, h * 0.28, w * 0.70, h * 0.48)
      ..lineTo(w * 0.74, h * 0.72)
      ..quadraticBezierTo(cx, h * 0.88, w * 0.26, h * 0.72)
      ..lineTo(w * 0.30, h * 0.48)
      ..quadraticBezierTo(w * 0.28, h * 0.28, cx, h * 0.12)
      ..close();
    canvas.drawPath(hull, body);
    canvas.drawPath(hull, outline);

    // Seat / tank dark strip
    canvas.drawRRect(
      RRect.fromRectAndRadius(
        Rect.fromCenter(
          center: Offset(cx, h * 0.52),
          width: w * 0.22,
          height: h * 0.28,
        ),
        const Radius.circular(6),
      ),
      accent,
    );

    // Handlebar
    canvas.drawRRect(
      RRect.fromRectAndRadius(
        Rect.fromCenter(
          center: Offset(cx, h * 0.26),
          width: w * 0.52,
          height: h * 0.07,
        ),
        const Radius.circular(4),
      ),
      accent,
    );

    // Headlight
    canvas.drawCircle(Offset(cx, h * 0.17), w * 0.07, glass);
  }

  void _paintPragya(
    Canvas canvas,
    Size size,
    Paint body,
    Paint accent,
    Paint glass,
    Paint outline,
  ) {
    final w = size.width;
    final h = size.height;
    final cx = w / 2;

    // Cabin roof (wider at rear — tuk-tuk top view)
    final cabin = Path()
      ..moveTo(cx, h * 0.10)
      ..lineTo(w * 0.72, h * 0.34)
      ..lineTo(w * 0.78, h * 0.78)
      ..quadraticBezierTo(cx, h * 0.90, w * 0.22, h * 0.78)
      ..lineTo(w * 0.28, h * 0.34)
      ..close();
    canvas.drawPath(cabin, body);
    canvas.drawPath(cabin, outline);

    // Dark roof band
    canvas.drawRRect(
      RRect.fromRectAndRadius(
        Rect.fromLTRB(w * 0.32, h * 0.36, w * 0.68, h * 0.62),
        const Radius.circular(5),
      ),
      accent,
    );

    // Windshield
    canvas.drawRRect(
      RRect.fromRectAndRadius(
        Rect.fromLTRB(w * 0.38, h * 0.18, w * 0.62, h * 0.30),
        const Radius.circular(3),
      ),
      glass,
    );

    // Wheels: 1 front + 2 rear
    canvas.drawOval(
      Rect.fromCenter(center: Offset(cx, h * 0.14), width: w * 0.20, height: h * 0.12),
      accent,
    );
    canvas.drawOval(
      Rect.fromCenter(center: Offset(w * 0.24, h * 0.78), width: w * 0.18, height: h * 0.12),
      accent,
    );
    canvas.drawOval(
      Rect.fromCenter(center: Offset(w * 0.76, h * 0.78), width: w * 0.18, height: h * 0.12),
      accent,
    );
  }

  void _paintAboboyaa(
    Canvas canvas,
    Size size,
    Paint body,
    Paint accent,
    Paint glass,
    Paint outline,
  ) {
    final w = size.width;
    final h = size.height;
    final cx = w / 2;

    // Front scooter nose
    final nose = Path()
      ..moveTo(cx, h * 0.08)
      ..lineTo(w * 0.66, h * 0.30)
      ..lineTo(w * 0.62, h * 0.46)
      ..lineTo(w * 0.38, h * 0.46)
      ..lineTo(w * 0.34, h * 0.30)
      ..close();
    canvas.drawPath(nose, body);
    canvas.drawPath(nose, outline);

    // Cargo bed
    final bed = RRect.fromRectAndRadius(
      Rect.fromLTRB(w * 0.22, h * 0.46, w * 0.78, h * 0.88),
      const Radius.circular(6),
    );
    canvas.drawRRect(bed, body);
    canvas.drawRRect(bed, outline);

    // Bed rails
    canvas.drawRRect(
      RRect.fromRectAndRadius(
        Rect.fromLTRB(w * 0.28, h * 0.52, w * 0.72, h * 0.82),
        const Radius.circular(4),
      ),
      accent,
    );

    canvas.drawRRect(
      RRect.fromRectAndRadius(
        Rect.fromLTRB(w * 0.40, h * 0.18, w * 0.60, h * 0.28),
        const Radius.circular(3),
      ),
      glass,
    );

    canvas.drawOval(
      Rect.fromCenter(center: Offset(cx, h * 0.12), width: w * 0.18, height: h * 0.10),
      accent,
    );
    canvas.drawOval(
      Rect.fromCenter(center: Offset(w * 0.28, h * 0.86), width: w * 0.16, height: h * 0.10),
      accent,
    );
    canvas.drawOval(
      Rect.fromCenter(center: Offset(w * 0.72, h * 0.86), width: w * 0.16, height: h * 0.10),
      accent,
    );
  }

  @override
  bool shouldRepaint(covariant TopDownVehiclePainter oldDelegate) {
    return oldDelegate.kind != kind ||
        oldDelegate.selected != selected ||
        oldDelegate.dimmed != dimmed;
  }
}

/// Convenience size helper for map marker hit targets.
Size topDownVehicleSize({required bool selected}) {
  final s = selected ? 52.0 : 44.0;
  return Size(s, s * 1.15);
}

double topDownHeadingCorrection(DriverKind kind) {
  // Painters face “up”; map heading uses atan2(lng, lat) from motion.
  // Small per-kind nudge if art needs it later.
  return switch (kind) {
    DriverKind.okada => 0,
    DriverKind.pragya => 0,
    DriverKind.aboboyaa => 0,
  };
}

Offset topDownAnchor(Size size) => Offset(size.width / 2, size.height / 2);

double normalizeHeading(double radians) {
  var v = radians;
  while (v > math.pi) {
    v -= 2 * math.pi;
  }
  while (v < -math.pi) {
    v += 2 * math.pi;
  }
  return v;
}
