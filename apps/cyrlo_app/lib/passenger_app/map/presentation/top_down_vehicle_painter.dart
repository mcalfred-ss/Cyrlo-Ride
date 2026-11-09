import 'dart:math' as math;
import 'dart:ui' as ui;

import 'package:flutter/material.dart';

import '../../../core/constants/app_colors.dart';
import '../../../features/auth/application/signup_draft.dart';

/// Polished bird’s-eye vehicle for the map (no pin / no card).
class TopDownVehiclePainter extends CustomPainter {
  TopDownVehiclePainter({
    required this.kind,
    required this.selected,
    required this.dimmed,
    this.pulse = 0,
  });

  final DriverKind kind;
  final bool selected;
  final bool dimmed;
  /// 0..1 selection halo pulse.
  final double pulse;

  @override
  void paint(Canvas canvas, Size size) {
    final cx = size.width / 2;
    final cy = size.height / 2;
    final alpha = dimmed ? 0.55 : 1.0;

    // Contrast disc so yellow reads on both light + dark map tiles.
    final discPaint = Paint()
      ..color = Colors.black.withValues(alpha: (selected ? 0.34 : 0.22) * alpha);
    canvas.drawCircle(
      Offset(cx, cy + size.height * 0.02),
      size.shortestSide * (selected ? 0.46 : 0.40),
      discPaint,
    );

    if (selected) {
      final glowR = size.shortestSide * (0.48 + pulse * 0.10);
      canvas.drawCircle(
        Offset(cx, cy),
        glowR,
        Paint()
          ..color = AppColors.yellow.withValues(alpha: 0.22 + pulse * 0.18)
          ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 8),
      );
      canvas.drawCircle(
        Offset(cx, cy),
        glowR * 0.92,
        Paint()
          ..color = AppColors.yellow.withValues(alpha: 0.85)
          ..style = PaintingStyle.stroke
          ..strokeWidth = 2.4,
      );
    }

    // Contact shadow
    canvas.drawOval(
      Rect.fromCenter(
        center: Offset(cx, cy + size.height * 0.10),
        width: size.width * 0.58,
        height: size.height * 0.18,
      ),
      Paint()
        ..color = Colors.black.withValues(alpha: 0.35 * alpha)
        ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 4),
    );

    canvas.saveLayer(
      Offset.zero & size,
      Paint()..color = Colors.white.withValues(alpha: alpha),
    );

    switch (kind) {
      case DriverKind.okada:
        _paintOkada(canvas, size);
      case DriverKind.pragya:
        _paintPragya(canvas, size);
      case DriverKind.aboboyaa:
        _paintAboboyaa(canvas, size);
    }

    canvas.restore();
  }

  Paint _body(Size size) => Paint()
    ..shader = ui.Gradient.linear(
      Offset(size.width * 0.3, 0),
      Offset(size.width * 0.7, size.height),
      const [
        Color(0xFFFFF0A3),
        Color(0xFFF5C400),
        Color(0xFFC99200),
      ],
      const [0, 0.42, 1],
    );

  static final _dark = Paint()..color = const Color(0xFF171717);
  static final _mid = Paint()..color = const Color(0xFF2C2C2C);
  static final _glass = Paint()..color = const Color(0xFF7EC8FF);
  static final _rim = Paint()
    ..color = const Color(0xFFFFFFFF)
    ..style = PaintingStyle.stroke
    ..strokeWidth = 1.8;
  static final _edge = Paint()
    ..color = const Color(0x8A000000)
    ..style = PaintingStyle.stroke
    ..strokeWidth = 1.2;

  void _paintOkada(Canvas canvas, Size size) {
    final w = size.width;
    final h = size.height;
    final cx = w / 2;

    // Wheels first (under body)
    _wheel(canvas, Offset(cx, h * 0.16), w * 0.30, h * 0.15);
    _wheel(canvas, Offset(cx, h * 0.84), w * 0.36, h * 0.17);

    final hull = Path()
      ..moveTo(cx, h * 0.10)
      ..cubicTo(w * 0.78, h * 0.22, w * 0.76, h * 0.42, w * 0.72, h * 0.55)
      ..lineTo(w * 0.76, h * 0.74)
      ..quadraticBezierTo(cx, h * 0.92, w * 0.24, h * 0.74)
      ..lineTo(w * 0.28, h * 0.55)
      ..cubicTo(w * 0.24, h * 0.42, w * 0.22, h * 0.22, cx, h * 0.10)
      ..close();
    canvas.drawPath(hull, _body(size));
    canvas.drawPath(hull, _edge);
    if (selected) canvas.drawPath(hull, _rim);

    // Center spine / seat
    canvas.drawRRect(
      RRect.fromRectAndRadius(
        Rect.fromCenter(center: Offset(cx, h * 0.52), width: w * 0.20, height: h * 0.34),
        const Radius.circular(8),
      ),
      _dark,
    );

    // Handlebars
    canvas.drawRRect(
      RRect.fromRectAndRadius(
        Rect.fromCenter(center: Offset(cx, h * 0.24), width: w * 0.58, height: h * 0.07),
        const Radius.circular(5),
      ),
      _mid,
    );
    canvas.drawCircle(Offset(w * 0.22, h * 0.24), w * 0.055, _dark);
    canvas.drawCircle(Offset(w * 0.78, h * 0.24), w * 0.055, _dark);

    // Headlight + highlight
    canvas.drawCircle(Offset(cx, h * 0.15), w * 0.09, _glass);
    canvas.drawCircle(
      Offset(cx - w * 0.02, h * 0.13),
      w * 0.03,
      Paint()..color = Colors.white.withValues(alpha: 0.75),
    );

    // Specular streak
    canvas.drawRRect(
      RRect.fromRectAndRadius(
        Rect.fromLTWH(w * 0.42, h * 0.30, w * 0.10, h * 0.34),
        const Radius.circular(6),
      ),
      Paint()..color = Colors.white.withValues(alpha: 0.28),
    );

    _noseArrow(canvas, Offset(cx, h * 0.06), w * 0.14);
  }

  void _paintPragya(Canvas canvas, Size size) {
    final w = size.width;
    final h = size.height;
    final cx = w / 2;

    _wheel(canvas, Offset(cx, h * 0.12), w * 0.22, h * 0.12);
    _wheel(canvas, Offset(w * 0.22, h * 0.80), w * 0.20, h * 0.12);
    _wheel(canvas, Offset(w * 0.78, h * 0.80), w * 0.20, h * 0.12);

    final cabin = Path()
      ..moveTo(cx, h * 0.08)
      ..lineTo(w * 0.74, h * 0.32)
      ..lineTo(w * 0.82, h * 0.78)
      ..quadraticBezierTo(cx, h * 0.92, w * 0.18, h * 0.78)
      ..lineTo(w * 0.26, h * 0.32)
      ..close();
    canvas.drawPath(cabin, _body(size));
    canvas.drawPath(cabin, _edge);
    if (selected) canvas.drawPath(cabin, _rim);

    // Roof plate
    canvas.drawRRect(
      RRect.fromRectAndRadius(
        Rect.fromLTRB(w * 0.30, h * 0.34, w * 0.70, h * 0.64),
        const Radius.circular(7),
      ),
      _dark,
    );
    // Roof ridge
    canvas.drawRRect(
      RRect.fromRectAndRadius(
        Rect.fromLTRB(w * 0.46, h * 0.36, w * 0.54, h * 0.62),
        const Radius.circular(4),
      ),
      Paint()..color = const Color(0xFF3A3A3A),
    );

    // Windshield
    final windshield = RRect.fromRectAndRadius(
      Rect.fromLTRB(w * 0.36, h * 0.16, w * 0.64, h * 0.30),
      const Radius.circular(4),
    );
    canvas.drawRRect(windshield, _glass);
    canvas.drawRRect(
      windshield,
      Paint()
        ..color = Colors.white.withValues(alpha: 0.35)
        ..style = PaintingStyle.stroke
        ..strokeWidth = 1,
    );

    _noseArrow(canvas, Offset(cx, h * 0.05), w * 0.12);
  }

  void _paintAboboyaa(Canvas canvas, Size size) {
    final w = size.width;
    final h = size.height;
    final cx = w / 2;

    _wheel(canvas, Offset(cx, h * 0.10), w * 0.20, h * 0.11);
    _wheel(canvas, Offset(w * 0.26, h * 0.88), w * 0.18, h * 0.11);
    _wheel(canvas, Offset(w * 0.74, h * 0.88), w * 0.18, h * 0.11);

    final nose = Path()
      ..moveTo(cx, h * 0.06)
      ..lineTo(w * 0.68, h * 0.28)
      ..lineTo(w * 0.64, h * 0.44)
      ..lineTo(w * 0.36, h * 0.44)
      ..lineTo(w * 0.32, h * 0.28)
      ..close();
    canvas.drawPath(nose, _body(size));
    canvas.drawPath(nose, _edge);

    final bed = RRect.fromRectAndRadius(
      Rect.fromLTRB(w * 0.18, h * 0.44, w * 0.82, h * 0.90),
      const Radius.circular(8),
    );
    canvas.drawRRect(bed, _body(size));
    canvas.drawRRect(bed, _edge);
    if (selected) canvas.drawRRect(bed, _rim);

    // Cargo well
    canvas.drawRRect(
      RRect.fromRectAndRadius(
        Rect.fromLTRB(w * 0.26, h * 0.52, w * 0.74, h * 0.82),
        const Radius.circular(5),
      ),
      _dark,
    );
    // Cross bars
    final bar = Paint()
      ..color = const Color(0xFF4A4A4A)
      ..strokeWidth = 2
      ..strokeCap = StrokeCap.round;
    canvas.drawLine(Offset(w * 0.30, h * 0.62), Offset(w * 0.70, h * 0.62), bar);
    canvas.drawLine(Offset(w * 0.30, h * 0.72), Offset(w * 0.70, h * 0.72), bar);

    canvas.drawRRect(
      RRect.fromRectAndRadius(
        Rect.fromLTRB(w * 0.38, h * 0.16, w * 0.62, h * 0.28),
        const Radius.circular(3),
      ),
      _glass,
    );

    _noseArrow(canvas, Offset(cx, h * 0.04), w * 0.11);
  }

  void _wheel(Canvas canvas, Offset center, double width, double height) {
    canvas.drawOval(
      Rect.fromCenter(center: center, width: width, height: height),
      _dark,
    );
    canvas.drawOval(
      Rect.fromCenter(center: center, width: width * 0.55, height: height * 0.55),
      Paint()..color = const Color(0xFF555555),
    );
  }

  void _noseArrow(Canvas canvas, Offset tip, double width) {
    final path = Path()
      ..moveTo(tip.dx, tip.dy)
      ..lineTo(tip.dx - width / 2, tip.dy + width * 0.7)
      ..lineTo(tip.dx + width / 2, tip.dy + width * 0.7)
      ..close();
    canvas.drawPath(
      path,
      Paint()..color = Colors.white.withValues(alpha: 0.92),
    );
    canvas.drawPath(
      path,
      Paint()
        ..color = Colors.black.withValues(alpha: 0.35)
        ..style = PaintingStyle.stroke
        ..strokeWidth = 0.8,
    );
  }

  @override
  bool shouldRepaint(covariant TopDownVehiclePainter oldDelegate) {
    return oldDelegate.kind != kind ||
        oldDelegate.selected != selected ||
        oldDelegate.dimmed != dimmed ||
        oldDelegate.pulse != pulse;
  }
}

Size topDownVehicleSize({required bool selected}) {
  final s = selected ? 68.0 : 58.0;
  return Size(s, s * 1.18);
}

double topDownHeadingCorrection(DriverKind kind) => 0;

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
