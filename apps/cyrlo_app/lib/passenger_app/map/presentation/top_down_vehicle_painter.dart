import 'dart:math' as math;
import 'dart:ui' as ui;

import 'package:flutter/material.dart';

import '../../../core/constants/app_colors.dart';
import '../../../features/auth/application/signup_draft.dart';

/// Compact bird’s-eye vehicles — readable kinds, no pin/card.
///
/// Shape language (top-down):
/// - Okada: long thin 2-wheeler (wheels in one line) + rear box
/// - Pragya: 1 front + 2 rear wheels, wide cabin roof
/// - Aboboyaa: short nose + long rectangular cargo bed
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
  final double pulse;

  @override
  void paint(Canvas canvas, Size size) {
    final cx = size.width / 2;
    final cy = size.height / 2;
    final alpha = dimmed ? 0.58 : 1.0;

    // Tiny road contact shadow only — no big disc.
    canvas.drawOval(
      Rect.fromCenter(
        center: Offset(cx, cy + size.height * 0.08),
        width: size.width * 0.55,
        height: size.height * 0.16,
      ),
      Paint()
        ..color = Colors.black.withValues(alpha: 0.28 * alpha)
        ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 2.5),
    );

    if (selected) {
      final r = size.shortestSide * (0.48 + pulse * 0.06);
      canvas.drawCircle(
        Offset(cx, cy),
        r,
        Paint()
          ..color = AppColors.yellow.withValues(alpha: 0.18 + pulse * 0.12)
          ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 5),
      );
      canvas.drawCircle(
        Offset(cx, cy),
        r * 0.9,
        Paint()
          ..color = AppColors.yellow.withValues(alpha: 0.9)
          ..style = PaintingStyle.stroke
          ..strokeWidth = 1.6,
      );
    }

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

  Paint _yellow(Size size) => Paint()
    ..shader = ui.Gradient.linear(
      Offset(size.width * 0.25, 0),
      Offset(size.width * 0.75, size.height),
      const [Color(0xFFFFE98A), Color(0xFFF5C400), Color(0xFFC99200)],
      const [0.0, 0.45, 1.0],
    );

  static final _black = Paint()..color = const Color(0xFF141414);
  static final _tyre = Paint()..color = const Color(0xFF0E0E0E);
  static final _rim = Paint()..color = const Color(0xFF5A5A5A);
  static final _glass = Paint()..color = const Color(0xFF6EBEF5);
  static final _stroke = Paint()
    ..color = const Color(0xCC000000)
    ..style = PaintingStyle.stroke
    ..strokeWidth = 1.0;
  static final _selectStroke = Paint()
    ..color = Colors.white
    ..style = PaintingStyle.stroke
    ..strokeWidth = 1.3;

  /// Motorcycle from above: narrow hull, 2 inline wheels, rear delivery box.
  void _paintOkada(Canvas canvas, Size size) {
    final w = size.width;
    final h = size.height;
    final cx = w / 2;

    // Inline wheels (the “this is a motor” cue)
    _wheel(canvas, Offset(cx, h * 0.14), w * 0.34, h * 0.13);
    _wheel(canvas, Offset(cx, h * 0.78), w * 0.38, h * 0.14);

    // Narrow bike body
    final hull = Path()
      ..moveTo(cx, h * 0.10)
      ..quadraticBezierTo(w * 0.62, h * 0.22, w * 0.58, h * 0.42)
      ..lineTo(w * 0.56, h * 0.62)
      ..quadraticBezierTo(cx, h * 0.70, w * 0.44, h * 0.62)
      ..lineTo(w * 0.42, h * 0.42)
      ..quadraticBezierTo(w * 0.38, h * 0.22, cx, h * 0.10)
      ..close();
    canvas.drawPath(hull, _yellow(size));
    canvas.drawPath(hull, _stroke);
    if (selected) canvas.drawPath(hull, _selectStroke);

    // Seat strip
    canvas.drawRRect(
      RRect.fromRectAndRadius(
        Rect.fromCenter(
          center: Offset(cx, h * 0.46),
          width: w * 0.16,
          height: h * 0.28,
        ),
        const Radius.circular(4),
      ),
      _black,
    );

    // Handlebars (wide vs thin body = motorcycle)
    canvas.drawRRect(
      RRect.fromRectAndRadius(
        Rect.fromCenter(
          center: Offset(cx, h * 0.22),
          width: w * 0.62,
          height: h * 0.06,
        ),
        const Radius.circular(3),
      ),
      _black,
    );

    // Rear delivery box (okada signature)
    final box = RRect.fromRectAndRadius(
      Rect.fromCenter(
        center: Offset(cx, h * 0.86),
        width: w * 0.42,
        height: h * 0.16,
      ),
      const Radius.circular(3),
    );
    canvas.drawRRect(box, _yellow(size));
    canvas.drawRRect(box, _stroke);

    // Headlight
    canvas.drawCircle(Offset(cx, h * 0.12), w * 0.07, _glass);
  }

  /// Pragya / keke: triangular cabin, 1 front + 2 rear wheels.
  void _paintPragya(Canvas canvas, Size size) {
    final w = size.width;
    final h = size.height;
    final cx = w / 2;

    // Three-wheel footprint (the “this is pragya” cue)
    _wheel(canvas, Offset(cx, h * 0.12), w * 0.24, h * 0.11);
    _wheel(canvas, Offset(w * 0.20, h * 0.82), w * 0.22, h * 0.12);
    _wheel(canvas, Offset(w * 0.80, h * 0.82), w * 0.22, h * 0.12);

    // Wide rear cabin tapering to front nose
    final cabin = Path()
      ..moveTo(cx, h * 0.08)
      ..lineTo(w * 0.70, h * 0.34)
      ..lineTo(w * 0.84, h * 0.78)
      ..quadraticBezierTo(cx, h * 0.90, w * 0.16, h * 0.78)
      ..lineTo(w * 0.30, h * 0.34)
      ..close();
    canvas.drawPath(cabin, _yellow(size));
    canvas.drawPath(cabin, _stroke);
    if (selected) canvas.drawPath(cabin, _selectStroke);

    // Dark roof / passenger canopy
    canvas.drawRRect(
      RRect.fromRectAndRadius(
        Rect.fromLTRB(w * 0.30, h * 0.38, w * 0.70, h * 0.68),
        const Radius.circular(5),
      ),
      _black,
    );

    // Split windshield
    canvas.drawRRect(
      RRect.fromRectAndRadius(
        Rect.fromLTRB(w * 0.36, h * 0.16, w * 0.49, h * 0.30),
        const Radius.circular(2),
      ),
      _glass,
    );
    canvas.drawRRect(
      RRect.fromRectAndRadius(
        Rect.fromLTRB(w * 0.51, h * 0.16, w * 0.64, h * 0.30),
        const Radius.circular(2),
      ),
      _glass,
    );

    // Side open-door notches (tuk-tuk look)
    canvas.drawCircle(Offset(w * 0.24, h * 0.52), w * 0.05, _black);
    canvas.drawCircle(Offset(w * 0.76, h * 0.52), w * 0.05, _black);
  }

  /// Aboboyaa: scooter nose + long open cargo bed.
  void _paintAboboyaa(Canvas canvas, Size size) {
    final w = size.width;
    final h = size.height;
    final cx = w / 2;

    _wheel(canvas, Offset(cx, h * 0.10), w * 0.22, h * 0.10);
    _wheel(canvas, Offset(w * 0.24, h * 0.88), w * 0.20, h * 0.11);
    _wheel(canvas, Offset(w * 0.76, h * 0.88), w * 0.20, h * 0.11);

    // Short front (scooter)
    final nose = Path()
      ..moveTo(cx, h * 0.06)
      ..lineTo(w * 0.64, h * 0.26)
      ..lineTo(w * 0.60, h * 0.40)
      ..lineTo(w * 0.40, h * 0.40)
      ..lineTo(w * 0.36, h * 0.26)
      ..close();
    canvas.drawPath(nose, _yellow(size));
    canvas.drawPath(nose, _stroke);

    // Long cargo bed (the “this is aboboyaa” cue)
    final bed = RRect.fromRectAndRadius(
      Rect.fromLTRB(w * 0.16, h * 0.40, w * 0.84, h * 0.90),
      const Radius.circular(5),
    );
    canvas.drawRRect(bed, _yellow(size));
    canvas.drawRRect(bed, _stroke);
    if (selected) canvas.drawRRect(bed, _selectStroke);

    // Open bed interior + side rails
    canvas.drawRRect(
      RRect.fromRectAndRadius(
        Rect.fromLTRB(w * 0.24, h * 0.48, w * 0.76, h * 0.82),
        const Radius.circular(3),
      ),
      _black,
    );
    final rail = Paint()
      ..color = const Color(0xFF3D3D3D)
      ..strokeWidth = 1.6
      ..strokeCap = StrokeCap.round;
    canvas.drawLine(Offset(w * 0.28, h * 0.58), Offset(w * 0.72, h * 0.58), rail);
    canvas.drawLine(Offset(w * 0.28, h * 0.70), Offset(w * 0.72, h * 0.70), rail);

    // Driver windshield
    canvas.drawRRect(
      RRect.fromRectAndRadius(
        Rect.fromLTRB(w * 0.40, h * 0.14, w * 0.60, h * 0.26),
        const Radius.circular(2),
      ),
      _glass,
    );
  }

  void _wheel(Canvas canvas, Offset center, double width, double height) {
    canvas.drawOval(
      Rect.fromCenter(center: center, width: width, height: height),
      _tyre,
    );
    canvas.drawOval(
      Rect.fromCenter(
        center: center,
        width: width * 0.48,
        height: height * 0.48,
      ),
      _rim,
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

/// First-pass compact size (readable, not huge).
Size topDownVehicleSize({required bool selected}) {
  final s = selected ? 50.0 : 42.0;
  return Size(s, s * 1.2);
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
