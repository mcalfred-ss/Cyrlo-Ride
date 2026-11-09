import 'dart:math' as math;
import 'dart:ui' as ui;

import 'package:flutter/material.dart';

import '../../../core/constants/app_colors.dart';
import '../../../features/auth/application/signup_draft.dart';

/// Compact bird’s-eye vehicles — readable kinds, no pin/card.
///
/// Shape language (top-down):
/// - Okada: rider-on-bike (helmet + shoulders + bars) from map-sprite refs
/// - Pragya: blueprint top-down — windshield, mirrors, dark passenger roof
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

  /// Okada from above — same language as the rider-on-bike map sprites:
  /// front tyre tip → fairing/headlight → handlebars → helmet → shoulders →
  /// seat/tail → rear tyre.
  void _paintOkada(Canvas canvas, Size size) {
    final w = size.width;
    final h = size.height;
    final cx = w / 2;

    final yellow = _yellow(size);
    final jacket = Paint()..color = const Color(0xFF1F2933);
    final helmet = Paint()..color = const Color(0xFF111111);
    final visor = Paint()
      ..color = const Color(0xFF6B7280)
      ..style = PaintingStyle.stroke
      ..strokeWidth = math.max(1.4, w * 0.04)
      ..strokeCap = StrokeCap.round;
    final bars = Paint()
      ..color = const Color(0xFF111111)
      ..style = PaintingStyle.stroke
      ..strokeWidth = math.max(1.6, w * 0.055)
      ..strokeCap = StrokeCap.round
      ..strokeJoin = StrokeJoin.round;

    // --- Front tyre (only the tip shows, like the ref) ---
    canvas.drawOval(
      Rect.fromCenter(
        center: Offset(cx, h * 0.07),
        width: w * 0.30,
        height: h * 0.09,
      ),
      _tyre,
    );

    // --- Front fairing / tank (yellow body) ---
    final fairing = Path()
      ..moveTo(cx, h * 0.05)
      ..quadraticBezierTo(w * 0.70, h * 0.14, w * 0.62, h * 0.28)
      ..lineTo(w * 0.56, h * 0.38)
      ..lineTo(w * 0.44, h * 0.38)
      ..lineTo(w * 0.38, h * 0.28)
      ..quadraticBezierTo(w * 0.30, h * 0.14, cx, h * 0.05)
      ..close();
    canvas.drawPath(fairing, yellow);
    canvas.drawPath(fairing, _stroke);

    // Round headlight (ref: yellow bike with circular lamp)
    canvas.drawCircle(Offset(cx, h * 0.14), w * 0.08, _glass);
    canvas.drawCircle(
      Offset(cx, h * 0.14),
      w * 0.08,
      Paint()
        ..color = Colors.white.withValues(alpha: 0.55)
        ..style = PaintingStyle.stroke
        ..strokeWidth = 0.8,
    );

    // --- Curved handlebars ---
    final barPath = Path()
      ..moveTo(w * 0.14, h * 0.30)
      ..quadraticBezierTo(cx, h * 0.22, w * 0.86, h * 0.30);
    canvas.drawPath(barPath, bars);
    // Grips
    canvas.drawCircle(Offset(w * 0.14, h * 0.30), w * 0.045, _black);
    canvas.drawCircle(Offset(w * 0.86, h * 0.30), w * 0.045, _black);

    // --- Rider arms to the bars ---
    final armPaint = Paint()
      ..color = const Color(0xFF1F2933)
      ..style = PaintingStyle.stroke
      ..strokeWidth = math.max(2.0, w * 0.07)
      ..strokeCap = StrokeCap.round;
    canvas.drawLine(Offset(cx - w * 0.08, h * 0.42), Offset(w * 0.22, h * 0.31), armPaint);
    canvas.drawLine(Offset(cx + w * 0.08, h * 0.42), Offset(w * 0.78, h * 0.31), armPaint);

    // --- Rider torso / shoulders (rounded back) ---
    final torso = Path()
      ..moveTo(cx, h * 0.36)
      ..quadraticBezierTo(w * 0.78, h * 0.42, w * 0.72, h * 0.56)
      ..quadraticBezierTo(cx, h * 0.64, w * 0.28, h * 0.56)
      ..quadraticBezierTo(w * 0.22, h * 0.42, cx, h * 0.36)
      ..close();
    canvas.drawPath(torso, jacket);
    canvas.drawPath(torso, _stroke);

    // --- Helmet (focal point of the ref) ---
    final helmetCenter = Offset(cx, h * 0.40);
    canvas.drawCircle(helmetCenter, w * 0.17, helmet);
    canvas.drawCircle(
      helmetCenter,
      w * 0.17,
      Paint()
        ..color = Colors.white.withValues(alpha: 0.12)
        ..style = PaintingStyle.stroke
        ..strokeWidth = 1,
    );
    // Visor band
    canvas.drawArc(
      Rect.fromCircle(center: helmetCenter, radius: w * 0.12),
      -0.55,
      1.1,
      false,
      visor,
    );

    // --- Seat behind rider ---
    canvas.drawRRect(
      RRect.fromRectAndRadius(
        Rect.fromCenter(
          center: Offset(cx, h * 0.68),
          width: w * 0.28,
          height: h * 0.14,
        ),
        const Radius.circular(5),
      ),
      _black,
    );

    // --- Rear tail / fender (yellow) ---
    final tail = Path()
      ..moveTo(w * 0.38, h * 0.72)
      ..lineTo(w * 0.62, h * 0.72)
      ..quadraticBezierTo(w * 0.66, h * 0.82, cx, h * 0.90)
      ..quadraticBezierTo(w * 0.34, h * 0.82, w * 0.38, h * 0.72)
      ..close();
    canvas.drawPath(tail, yellow);
    canvas.drawPath(tail, _stroke);
    if (selected) {
      canvas.drawPath(fairing, _selectStroke);
      canvas.drawPath(tail, _selectStroke);
    }

    // --- Rear tyre tip ---
    canvas.drawOval(
      Rect.fromCenter(
        center: Offset(cx, h * 0.93),
        width: w * 0.34,
        height: h * 0.09,
      ),
      _tyre,
    );
  }

  /// Pragya from above — matched to the top-down blueprint:
  /// nose wheel → curved windshield + mirrors → driver bay →
  /// wide dark passenger roof → dual rear wheels + red lamps.
  void _paintPragya(Canvas canvas, Size size) {
    final w = size.width;
    final h = size.height;
    final cx = w / 2;
    final yellow = _yellow(size);
    final frame = Paint()..color = const Color(0xFFE8A317);
    final roof = Paint()..color = const Color(0xFF1A1A1A);
    final roofEdge = Paint()
      ..color = const Color(0xFF3A3A3A)
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1.0;
    final wiper = Paint()
      ..color = const Color(0xFF222222)
      ..strokeWidth = math.max(1.1, w * 0.035)
      ..strokeCap = StrokeCap.round;
    final lamp = Paint()..color = const Color(0xFFE53935);

    // --- Front wheel tip ---
    canvas.drawOval(
      Rect.fromCenter(
        center: Offset(cx, h * 0.06),
        width: w * 0.22,
        height: h * 0.08,
      ),
      _tyre,
    );

    // --- Dual rear wheels (outside the body — tricycle footprint) ---
    canvas.drawOval(
      Rect.fromCenter(
        center: Offset(w * 0.14, h * 0.86),
        width: w * 0.18,
        height: h * 0.11,
      ),
      _tyre,
    );
    canvas.drawOval(
      Rect.fromCenter(
        center: Offset(w * 0.86, h * 0.86),
        width: w * 0.18,
        height: h * 0.11,
      ),
      _tyre,
    );
    canvas.drawOval(
      Rect.fromCenter(
        center: Offset(w * 0.14, h * 0.86),
        width: w * 0.08,
        height: h * 0.05,
      ),
      _rim,
    );
    canvas.drawOval(
      Rect.fromCenter(
        center: Offset(w * 0.86, h * 0.86),
        width: w * 0.08,
        height: h * 0.05,
      ),
      _rim,
    );

    // --- Body: tapered nose → rectangular rear (blueprint silhouette) ---
    final body = Path()
      ..moveTo(cx, h * 0.05)
      ..quadraticBezierTo(w * 0.72, h * 0.12, w * 0.70, h * 0.28)
      ..lineTo(w * 0.78, h * 0.42)
      ..lineTo(w * 0.84, h * 0.88)
      ..quadraticBezierTo(cx, h * 0.95, w * 0.16, h * 0.88)
      ..lineTo(w * 0.22, h * 0.42)
      ..lineTo(w * 0.30, h * 0.28)
      ..quadraticBezierTo(w * 0.28, h * 0.12, cx, h * 0.05)
      ..close();
    canvas.drawPath(body, yellow);
    canvas.drawPath(body, _stroke);
    if (selected) canvas.drawPath(body, _selectStroke);

    // --- Curved windshield with warm frame ---
    final glassRect = RRect.fromRectAndRadius(
      Rect.fromLTRB(w * 0.32, h * 0.10, w * 0.68, h * 0.26),
      const Radius.circular(8),
    );
    canvas.drawRRect(
      RRect.fromRectAndRadius(
        Rect.fromLTRB(w * 0.30, h * 0.09, w * 0.70, h * 0.27),
        const Radius.circular(9),
      ),
      frame,
    );
    canvas.drawRRect(glassRect, _glass);
    canvas.drawRRect(
      glassRect,
      Paint()
        ..color = Colors.white.withValues(alpha: 0.35)
        ..style = PaintingStyle.stroke
        ..strokeWidth = 0.9,
    );
    // Single centre wiper
    canvas.drawLine(
      Offset(cx, h * 0.12),
      Offset(cx + w * 0.08, h * 0.22),
      wiper,
    );

    // --- Side mirrors ---
    canvas.drawCircle(Offset(w * 0.22, h * 0.22), w * 0.055, _black);
    canvas.drawCircle(Offset(w * 0.78, h * 0.22), w * 0.055, _black);
    canvas.drawCircle(Offset(w * 0.22, h * 0.22), w * 0.025, _rim);
    canvas.drawCircle(Offset(w * 0.78, h * 0.22), w * 0.025, _rim);

    // --- Driver / engine bay (mid section) ---
    canvas.drawRRect(
      RRect.fromRectAndRadius(
        Rect.fromLTRB(w * 0.34, h * 0.28, w * 0.66, h * 0.42),
        const Radius.circular(4),
      ),
      Paint()..color = const Color(0xFF2A2A2A),
    );
    // Tiny steering bar cue
    canvas.drawLine(
      Offset(w * 0.38, h * 0.34),
      Offset(w * 0.62, h * 0.34),
      Paint()
        ..color = const Color(0xFF555555)
        ..strokeWidth = 1.4
        ..strokeCap = StrokeCap.round,
    );

    // --- Large flat dark passenger roof (rear half — main pragya cue) ---
    final roofRect = RRect.fromRectAndRadius(
      Rect.fromLTRB(w * 0.24, h * 0.44, w * 0.76, h * 0.82),
      const Radius.circular(5),
    );
    canvas.drawRRect(roofRect, roof);
    canvas.drawRRect(roofRect, roofEdge);
    // Roof ridge / panel lines
    canvas.drawLine(
      Offset(cx, h * 0.46),
      Offset(cx, h * 0.80),
      Paint()
        ..color = const Color(0xFF2E2E2E)
        ..strokeWidth = 1.2,
    );
    canvas.drawLine(
      Offset(w * 0.30, h * 0.63),
      Offset(w * 0.70, h * 0.63),
      Paint()
        ..color = const Color(0xFF2E2E2E)
        ..strokeWidth = 1.0,
    );

    // --- Rear red lamps ---
    canvas.drawCircle(Offset(w * 0.28, h * 0.90), w * 0.045, lamp);
    canvas.drawCircle(Offset(w * 0.72, h * 0.90), w * 0.045, lamp);
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

/// Compact size — okada sprite is taller than wide (bike + rider).
Size topDownVehicleSize({required bool selected}) {
  final s = selected ? 48.0 : 40.0;
  return Size(s, s * 1.35);
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
