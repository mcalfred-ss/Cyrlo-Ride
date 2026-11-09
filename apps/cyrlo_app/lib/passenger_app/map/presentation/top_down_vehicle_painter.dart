import 'dart:math' as math;
import 'dart:ui' as ui;

import 'package:flutter/material.dart';

import '../../../features/auth/application/signup_draft.dart';

/// Per-kind map colours — quick read without reading the silhouette.
abstract final class MapVehicleColors {
  /// Okada — red
  static const okada = Color(0xFFE53935);
  static const okadaLight = Color(0xFFFF8A80);
  static const okadaDark = Color(0xFFB71C1C);

  /// Pragya — yellow
  static const pragya = Color(0xFFF5C400);
  static const pragyaLight = Color(0xFFFFE98A);
  static const pragyaDark = Color(0xFFC99200);

  /// Aboboyaa — blue
  static const aboboyaa = Color(0xFF2563EB);
  static const aboboyaaLight = Color(0xFF60A5FA);
  static const aboboyaaDark = Color(0xFF1D4ED8);

  static Color primary(DriverKind kind) => switch (kind) {
        DriverKind.okada => okada,
        DriverKind.pragya => pragya,
        DriverKind.aboboyaa => aboboyaa,
      };

  static Color light(DriverKind kind) => switch (kind) {
        DriverKind.okada => okadaLight,
        DriverKind.pragya => pragyaLight,
        DriverKind.aboboyaa => aboboyaaLight,
      };

  static Color dark(DriverKind kind) => switch (kind) {
        DriverKind.okada => okadaDark,
        DriverKind.pragya => pragyaDark,
        DriverKind.aboboyaa => aboboyaaDark,
      };
}

/// Compact bird’s-eye vehicles — readable kinds, no pin/card.
///
/// - Okada: rider-on-bike (helmet + bars)
/// - Pragya: windshield + dark passenger roof
/// - Aboboyaa: moto nose + long open cargo bed (synthesized top-down)
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
    final accent = MapVehicleColors.primary(kind);

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
          ..color = accent.withValues(alpha: 0.18 + pulse * 0.12)
          ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 5),
      );
      canvas.drawCircle(
        Offset(cx, cy),
        r * 0.9,
        Paint()
          ..color = accent.withValues(alpha: 0.95)
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

  Paint _body(Size size) => Paint()
    ..shader = ui.Gradient.linear(
      Offset(size.width * 0.25, 0),
      Offset(size.width * 0.75, size.height),
      [
        MapVehicleColors.light(kind),
        MapVehicleColors.primary(kind),
        MapVehicleColors.dark(kind),
      ],
      const [0.0, 0.45, 1.0],
    );

  static final _black = Paint()..color = const Color(0xFF141414);
  static final _tyre = Paint()..color = const Color(0xFF0E0E0E);
  static final _glass = Paint()..color = const Color(0xFF6EBEF5);
  static final _stroke = Paint()
    ..color = const Color(0xCC000000)
    ..style = PaintingStyle.stroke
    ..strokeWidth = 1.0;
  static final _selectStroke = Paint()
    ..color = Colors.white
    ..style = PaintingStyle.stroke
    ..strokeWidth = 1.3;

  void _paintOkada(Canvas canvas, Size size) {
    final w = size.width;
    final h = size.height;
    final cx = w / 2;
    final body = _body(size);
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

    canvas.drawOval(
      Rect.fromCenter(center: Offset(cx, h * 0.07), width: w * 0.30, height: h * 0.09),
      _tyre,
    );

    final fairing = Path()
      ..moveTo(cx, h * 0.05)
      ..quadraticBezierTo(w * 0.70, h * 0.14, w * 0.62, h * 0.28)
      ..lineTo(w * 0.56, h * 0.38)
      ..lineTo(w * 0.44, h * 0.38)
      ..lineTo(w * 0.38, h * 0.28)
      ..quadraticBezierTo(w * 0.30, h * 0.14, cx, h * 0.05)
      ..close();
    canvas.drawPath(fairing, body);
    canvas.drawPath(fairing, _stroke);

    canvas.drawCircle(Offset(cx, h * 0.14), w * 0.08, _glass);

    final barPath = Path()
      ..moveTo(w * 0.14, h * 0.30)
      ..quadraticBezierTo(cx, h * 0.22, w * 0.86, h * 0.30);
    canvas.drawPath(barPath, bars);
    canvas.drawCircle(Offset(w * 0.14, h * 0.30), w * 0.045, _black);
    canvas.drawCircle(Offset(w * 0.86, h * 0.30), w * 0.045, _black);

    final armPaint = Paint()
      ..color = const Color(0xFF1F2933)
      ..style = PaintingStyle.stroke
      ..strokeWidth = math.max(2.0, w * 0.07)
      ..strokeCap = StrokeCap.round;
    canvas.drawLine(Offset(cx - w * 0.08, h * 0.42), Offset(w * 0.22, h * 0.31), armPaint);
    canvas.drawLine(Offset(cx + w * 0.08, h * 0.42), Offset(w * 0.78, h * 0.31), armPaint);

    final torso = Path()
      ..moveTo(cx, h * 0.36)
      ..quadraticBezierTo(w * 0.78, h * 0.42, w * 0.72, h * 0.56)
      ..quadraticBezierTo(cx, h * 0.64, w * 0.28, h * 0.56)
      ..quadraticBezierTo(w * 0.22, h * 0.42, cx, h * 0.36)
      ..close();
    canvas.drawPath(torso, jacket);
    canvas.drawPath(torso, _stroke);

    final helmetCenter = Offset(cx, h * 0.40);
    canvas.drawCircle(helmetCenter, w * 0.17, helmet);
    canvas.drawArc(
      Rect.fromCircle(center: helmetCenter, radius: w * 0.12),
      -0.55,
      1.1,
      false,
      visor,
    );

    canvas.drawRRect(
      RRect.fromRectAndRadius(
        Rect.fromCenter(center: Offset(cx, h * 0.68), width: w * 0.28, height: h * 0.14),
        const Radius.circular(5),
      ),
      _black,
    );

    final tail = Path()
      ..moveTo(w * 0.38, h * 0.72)
      ..lineTo(w * 0.62, h * 0.72)
      ..quadraticBezierTo(w * 0.66, h * 0.82, cx, h * 0.90)
      ..quadraticBezierTo(w * 0.34, h * 0.82, w * 0.38, h * 0.72)
      ..close();
    canvas.drawPath(tail, body);
    canvas.drawPath(tail, _stroke);
    if (selected) {
      canvas.drawPath(fairing, _selectStroke);
      canvas.drawPath(tail, _selectStroke);
    }

    canvas.drawOval(
      Rect.fromCenter(center: Offset(cx, h * 0.93), width: w * 0.34, height: h * 0.09),
      _tyre,
    );
  }

  void _paintPragya(Canvas canvas, Size size) {
    final w = size.width;
    final h = size.height;
    final cx = w / 2;
    final body = _body(size);
    final frame = Paint()..color = MapVehicleColors.dark(kind);
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

    canvas.drawOval(
      Rect.fromCenter(center: Offset(cx, h * 0.06), width: w * 0.22, height: h * 0.08),
      _tyre,
    );
    canvas.drawOval(
      Rect.fromCenter(center: Offset(w * 0.14, h * 0.86), width: w * 0.18, height: h * 0.11),
      _tyre,
    );
    canvas.drawOval(
      Rect.fromCenter(center: Offset(w * 0.86, h * 0.86), width: w * 0.18, height: h * 0.11),
      _tyre,
    );

    final cabin = Path()
      ..moveTo(cx, h * 0.05)
      ..quadraticBezierTo(w * 0.72, h * 0.12, w * 0.70, h * 0.28)
      ..lineTo(w * 0.78, h * 0.42)
      ..lineTo(w * 0.84, h * 0.88)
      ..quadraticBezierTo(cx, h * 0.95, w * 0.16, h * 0.88)
      ..lineTo(w * 0.22, h * 0.42)
      ..lineTo(w * 0.30, h * 0.28)
      ..quadraticBezierTo(w * 0.28, h * 0.12, cx, h * 0.05)
      ..close();
    canvas.drawPath(cabin, body);
    canvas.drawPath(cabin, _stroke);
    if (selected) canvas.drawPath(cabin, _selectStroke);

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
    canvas.drawLine(Offset(cx, h * 0.12), Offset(cx + w * 0.08, h * 0.22), wiper);

    canvas.drawCircle(Offset(w * 0.22, h * 0.22), w * 0.055, _black);
    canvas.drawCircle(Offset(w * 0.78, h * 0.22), w * 0.055, _black);

    canvas.drawRRect(
      RRect.fromRectAndRadius(
        Rect.fromLTRB(w * 0.34, h * 0.28, w * 0.66, h * 0.42),
        const Radius.circular(4),
      ),
      Paint()..color = const Color(0xFF2A2A2A),
    );

    final roofRect = RRect.fromRectAndRadius(
      Rect.fromLTRB(w * 0.24, h * 0.44, w * 0.76, h * 0.82),
      const Radius.circular(5),
    );
    canvas.drawRRect(roofRect, roof);
    canvas.drawRRect(roofRect, roofEdge);

    canvas.drawCircle(Offset(w * 0.28, h * 0.90), w * 0.045, lamp);
    canvas.drawCircle(Offset(w * 0.72, h * 0.90), w * 0.045, lamp);
  }

  /// Aboboyaa synthesized top-down from side/front/rear refs:
  /// moto nose + bars/mirrors → small seat → long slatted cargo bed → dual rear.
  void _paintAboboyaa(Canvas canvas, Size size) {
    final w = size.width;
    final h = size.height;
    final cx = w / 2;
    final body = _body(size);
    final frame = Paint()
      ..color = MapVehicleColors.dark(kind)
      ..style = PaintingStyle.stroke
      ..strokeWidth = math.max(1.3, w * 0.04)
      ..strokeCap = StrokeCap.round;
    final slat = Paint()
      ..color = MapVehicleColors.dark(kind).withValues(alpha: 0.55)
      ..strokeWidth = 1.1;
    final lamp = Paint()..color = const Color(0xFFE53935);
    final lampWhite = Paint()..color = const Color(0xFFF5F5F5);
    final amber = Paint()..color = const Color(0xFFF59E0B);

    // Front tyre
    canvas.drawOval(
      Rect.fromCenter(center: Offset(cx, h * 0.05), width: w * 0.24, height: h * 0.07),
      _tyre,
    );
    // Dual rear wheels (further back with the longer bed)
    canvas.drawOval(
      Rect.fromCenter(center: Offset(w * 0.18, h * 0.92), width: w * 0.18, height: h * 0.10),
      _tyre,
    );
    canvas.drawOval(
      Rect.fromCenter(center: Offset(w * 0.82, h * 0.92), width: w * 0.18, height: h * 0.10),
      _tyre,
    );

    // Motorcycle nose / tank (kept short so the bed can run longer)
    final nose = Path()
      ..moveTo(cx, h * 0.04)
      ..quadraticBezierTo(w * 0.66, h * 0.10, w * 0.60, h * 0.22)
      ..lineTo(w * 0.56, h * 0.30)
      ..lineTo(w * 0.44, h * 0.30)
      ..lineTo(w * 0.40, h * 0.22)
      ..quadraticBezierTo(w * 0.34, h * 0.10, cx, h * 0.04)
      ..close();
    canvas.drawPath(nose, body);
    canvas.drawPath(nose, _stroke);

    // Hex-ish headlight
    canvas.drawRRect(
      RRect.fromRectAndRadius(
        Rect.fromCenter(center: Offset(cx, h * 0.12), width: w * 0.16, height: h * 0.07),
        const Radius.circular(3),
      ),
      _glass,
    );
    // Amber indicators
    canvas.drawCircle(Offset(w * 0.30, h * 0.13), w * 0.035, amber);
    canvas.drawCircle(Offset(w * 0.70, h * 0.13), w * 0.035, amber);

    // Wide handlebars + mirrors (front-view cue)
    final bars = Paint()
      ..color = const Color(0xFF111111)
      ..style = PaintingStyle.stroke
      ..strokeWidth = math.max(1.5, w * 0.05)
      ..strokeCap = StrokeCap.round;
    canvas.drawLine(Offset(w * 0.12, h * 0.22), Offset(w * 0.88, h * 0.22), bars);
    canvas.drawCircle(Offset(w * 0.12, h * 0.18), w * 0.05, _black);
    canvas.drawCircle(Offset(w * 0.88, h * 0.18), w * 0.05, _black);

    // Driver seat
    canvas.drawRRect(
      RRect.fromRectAndRadius(
        Rect.fromCenter(center: Offset(cx, h * 0.32), width: w * 0.26, height: h * 0.08),
        const Radius.circular(4),
      ),
      _black,
    );

    // Roll-cage / frame arcs behind driver (rear+side cue)
    canvas.drawArc(
      Rect.fromLTRB(w * 0.28, h * 0.24, w * 0.72, h * 0.40),
      math.pi,
      math.pi,
      false,
      frame,
    );

    // Extended cargo bed — main aboboyaa cue
    final bed = RRect.fromRectAndRadius(
      Rect.fromLTRB(w * 0.14, h * 0.36, w * 0.86, h * 0.96),
      const Radius.circular(4),
    );
    canvas.drawRRect(bed, body);
    canvas.drawRRect(bed, _stroke);
    if (selected) canvas.drawRRect(bed, _selectStroke);

    // Open well + slatted sides (extra slat for the longer bed)
    canvas.drawRRect(
      RRect.fromRectAndRadius(
        Rect.fromLTRB(w * 0.22, h * 0.42, w * 0.78, h * 0.88),
        const Radius.circular(3),
      ),
      Paint()..color = MapVehicleColors.dark(kind).withValues(alpha: 0.35),
    );
    for (final t in [0.50, 0.60, 0.70, 0.80]) {
      canvas.drawLine(Offset(w * 0.26, h * t), Offset(w * 0.74, h * t), slat);
    }
    // Side rail posts
    canvas.drawLine(Offset(w * 0.18, h * 0.40), Offset(w * 0.18, h * 0.92), frame);
    canvas.drawLine(Offset(w * 0.82, h * 0.40), Offset(w * 0.82, h * 0.92), frame);

    // Tailgate lamps (rear view cue)
    canvas.drawRRect(
      RRect.fromRectAndRadius(
        Rect.fromCenter(center: Offset(w * 0.30, h * 0.97), width: w * 0.12, height: h * 0.035),
        const Radius.circular(1.5),
      ),
      lamp,
    );
    canvas.drawRRect(
      RRect.fromRectAndRadius(
        Rect.fromCenter(center: Offset(w * 0.70, h * 0.97), width: w * 0.12, height: h * 0.035),
        const Radius.circular(1.5),
      ),
      lamp,
    );
    canvas.drawCircle(Offset(w * 0.36, h * 0.97), w * 0.02, lampWhite);
    canvas.drawCircle(Offset(w * 0.76, h * 0.97), w * 0.02, lampWhite);
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
