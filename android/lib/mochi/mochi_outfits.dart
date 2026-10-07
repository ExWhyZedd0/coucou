// Mochi Outfits and accessories painter for Coucou Android Companion.
// Integrated 3D Skeletal Attached Model:
// Outfits physically bind to Mochi's squircle vertices, rotating with head
// tilt/pitch, deforming with breath dynamics, and casting ambient contact shadows.

import 'package:flutter/material.dart';

enum MochiOutfit {
  auto,
  none,
  partyHat,
  beanie,
  crown,
  sunglasses,
  roundGlasses,
  bow,
  scarf,
  witchHat,
  pumpkin,
  santaHat,
  bunnyEars;

  String get label {
    switch (this) {
      case MochiOutfit.auto:
        return 'Auto (Seasonal)';
      case MochiOutfit.none:
        return 'None';
      case MochiOutfit.partyHat:
        return 'Party Hat';
      case MochiOutfit.beanie:
        return 'Beanie';
      case MochiOutfit.crown:
        return 'Crown';
      case MochiOutfit.sunglasses:
        return 'Sunglasses';
      case MochiOutfit.roundGlasses:
        return 'Round Glasses';
      case MochiOutfit.bow:
        return 'Bow';
      case MochiOutfit.scarf:
        return 'Scarf';
      case MochiOutfit.witchHat:
        return 'Witch Hat';
      case MochiOutfit.pumpkin:
        return 'Pumpkin';
      case MochiOutfit.santaHat:
        return 'Santa Hat';
      case MochiOutfit.bunnyEars:
        return 'Bunny Ears';
    }
  }

  String get emoji {
    switch (this) {
      case MochiOutfit.auto:
        return '✨';
      case MochiOutfit.none:
        return '⚪';
      case MochiOutfit.partyHat:
        return '🎉';
      case MochiOutfit.beanie:
        return '🧶';
      case MochiOutfit.crown:
        return '👑';
      case MochiOutfit.sunglasses:
        return '🕶️';
      case MochiOutfit.roundGlasses:
        return '👓';
      case MochiOutfit.bow:
        return '🎀';
      case MochiOutfit.scarf:
        return '🧣';
      case MochiOutfit.witchHat:
        return '🧙';
      case MochiOutfit.pumpkin:
        return '🎃';
      case MochiOutfit.santaHat:
        return '🎅';
      case MochiOutfit.bunnyEars:
        return '🐰';
    }
  }

  static MochiOutfit resolveAuto() {
    final now = DateTime.now();
    final m = now.month;
    final d = now.day;
    if (m == 12 && d >= 15 && d <= 26) return MochiOutfit.santaHat;
    if (m == 10 && d >= 24 && d <= 31) return MochiOutfit.witchHat;
    if ((m == 12 && d >= 30) || (m == 1 && d <= 2)) return MochiOutfit.partyHat;
    if (m == 6 || m == 7 || m == 8) return MochiOutfit.sunglasses;
    if (m == 11 || m == 12 || m == 1 || m == 2) return MochiOutfit.beanie;
    return MochiOutfit.none;
  }
}

class MochiSkeletalContext {
  final Size size;
  final Offset apex;
  final Offset eyeLeft;
  final Offset eyeRight;
  final Offset neck;
  final double breath;
  final double tilt;

  const MochiSkeletalContext({
    required this.size,
    required this.apex,
    required this.eyeLeft,
    required this.eyeRight,
    required this.neck,
    this.breath = 1.0,
    this.tilt = 0.0,
  });
}

class MochiOutfitPainter {
  static void draw(Canvas canvas, Size size, MochiOutfit outfit, [MochiSkeletalContext? skel]) {
    var actual = outfit;
    if (actual == MochiOutfit.auto) {
      actual = MochiOutfit.resolveAuto();
    }
    if (actual == MochiOutfit.none) return;

    final w = size.width;
    final h = size.height;

    // Use passed skeletal context or compute default
    final apex = skel?.apex ?? Offset(w * 0.5, h * 0.15);
    final eyeLeft = skel?.eyeLeft ?? Offset(w * 0.35, h * 0.48);
    final eyeRight = skel?.eyeRight ?? Offset(w * 0.65, h * 0.48);
    final neck = skel?.neck ?? Offset(w * 0.5, h * 0.85);
    final tilt = skel?.tilt ?? 0.0;

    switch (actual) {
      case MochiOutfit.partyHat:
        _drawPartyHat(canvas, apex, w, tilt);
        break;
      case MochiOutfit.crown:
        _drawCrown(canvas, apex, w, tilt);
        break;
      case MochiOutfit.beanie:
        _drawBeanie(canvas, apex, w, tilt);
        break;
      case MochiOutfit.sunglasses:
        _drawSunglasses(canvas, eyeLeft, eyeRight, w, tilt);
        break;
      case MochiOutfit.roundGlasses:
        _drawRoundGlasses(canvas, eyeLeft, eyeRight, w, tilt);
        break;
      case MochiOutfit.bow:
        _drawBow(canvas, Offset(apex.dx + w * 0.22, apex.dy + h * 0.08), w);
        break;
      case MochiOutfit.scarf:
        _drawScarf(canvas, neck, w, tilt);
        break;
      case MochiOutfit.witchHat:
        _drawWitchHat(canvas, apex, w, tilt);
        break;
      case MochiOutfit.pumpkin:
        _drawPumpkin(canvas, apex, w, tilt);
        break;
      case MochiOutfit.santaHat:
        _drawSantaHat(canvas, apex, w, tilt);
        break;
      case MochiOutfit.bunnyEars:
        _drawBunnyEars(canvas, apex, w, tilt);
        break;
      default:
        break;
    }
  }

  static void _drawContactShadow(Canvas canvas, Offset center, double w, double h, [double alpha = 0.22]) {
    final rect = Rect.fromCenter(center: center, width: w, height: h);
    final paint = Paint()
      ..shader = RadialGradient(
        colors: [
          Color.fromRGBO(18, 14, 28, alpha),
          Color.fromRGBO(22, 18, 32, alpha * 0.4),
          const Color.fromRGBO(0, 0, 0, 0),
        ],
      ).createShader(rect);
    canvas.drawOval(rect, paint);
  }

  static void _drawPartyHat(Canvas canvas, Offset apex, double w, double tilt) {
    final hatW = w * 0.36;
    final hatH = w * 0.48;

    // Contact shadow
    _drawContactShadow(canvas, Offset(apex.dx, apex.dy + 3), hatW * 0.85, 12, 0.28);

    canvas.save();
    canvas.translate(apex.dx, apex.dy);
    if (tilt != 0) canvas.rotate(tilt);

    final path = Path()
      ..moveTo(0, -hatH)
      ..lineTo(hatW / 2, 0)
      ..quadraticBezierTo(0, 4, -hatW / 2, 0)
      ..close();

    final paint = Paint()
      ..shader = const LinearGradient(
        colors: [Color(0xFFFF5252), Color(0xFFFFD740)],
      ).createShader(Rect.fromLTWH(-hatW / 2, -hatH, hatW, hatH));
    canvas.drawPath(path, paint);

    // Pom pom on top
    canvas.drawCircle(Offset(0, -hatH), 5.5, Paint()..color = const Color(0xFFFFFF8D));
    canvas.restore();
  }

  static void _drawCrown(Canvas canvas, Offset apex, double w, double tilt) {
    final crW = w * 0.44;
    final crH = w * 0.24;

    _drawContactShadow(canvas, Offset(apex.dx, apex.dy + 2), crW * 0.9, 10, 0.25);

    canvas.save();
    canvas.translate(apex.dx, apex.dy);
    if (tilt != 0) canvas.rotate(tilt);

    final path = Path()
      ..moveTo(-crW / 2, 0)
      ..lineTo(-crW / 2, -crH * 0.8)
      ..lineTo(-crW * 0.25, -crH * 0.4)
      ..lineTo(0, -crH)
      ..lineTo(crW * 0.25, -crH * 0.4)
      ..lineTo(crW / 2, -crH * 0.8)
      ..lineTo(crW / 2, 0)
      ..quadraticBezierTo(0, 3, -crW / 2, 0)
      ..close();

    final paint = Paint()..color = const Color(0xFFFFD700);
    canvas.drawPath(path, paint);

    // Jewels
    final jPaint = Paint()..color = const Color(0xFFE91E63);
    canvas.drawCircle(Offset(0, -crH * 0.65), 3.0, jPaint);
    canvas.drawCircle(Offset(-crW * 0.35, -crH * 0.5), 2.2, Paint()..color = const Color(0xFF10B981));
    canvas.drawCircle(Offset(crW * 0.35, -crH * 0.5), 2.2, Paint()..color = const Color(0xFF10B981));
    canvas.restore();
  }

  static void _drawBeanie(Canvas canvas, Offset apex, double w, double tilt) {
    final bW = w * 0.54;
    final bH = w * 0.32;

    _drawContactShadow(canvas, Offset(apex.dx, apex.dy + 3), bW * 0.95, 12, 0.3);

    canvas.save();
    canvas.translate(apex.dx, apex.dy);
    if (tilt != 0) canvas.rotate(tilt);

    final rect = Rect.fromCenter(center: Offset(0, -bH * 0.45), width: bW, height: bH);
    final rrect = RRect.fromRectAndRadius(rect, const Radius.circular(18));
    canvas.drawRRect(rrect, Paint()..color = const Color(0xFF2563EB));

    // Brim fold
    final brimRect = Rect.fromCenter(center: Offset(0, 0), width: bW * 1.05, height: bH * 0.4);
    canvas.drawRRect(
      RRect.fromRectAndRadius(brimRect, const Radius.circular(8)),
      Paint()..color = const Color(0xFF1D4ED8),
    );

    // Pom pom
    canvas.drawCircle(Offset(0, -bH * 0.95), 6.5, Paint()..color = const Color(0xFFDBEAFE));
    canvas.restore();
  }

  static void _drawSunglasses(Canvas canvas, Offset eyeLeft, Offset eyeRight, double w, double tilt) {
    final gW = w * 0.23;
    final gH = w * 0.14;
    final paint = Paint()..color = const Color(0xFF0F172A);

    _drawContactShadow(canvas, Offset(eyeLeft.dx, eyeLeft.dy + gH * 0.3), gW * 1.05, gH * 0.6, 0.25);
    _drawContactShadow(canvas, Offset(eyeRight.dx, eyeRight.dy + gH * 0.3), gW * 1.05, gH * 0.6, 0.25);

    // Left lens
    canvas.drawRRect(
      RRect.fromRectAndRadius(
        Rect.fromCenter(center: eyeLeft, width: gW, height: gH),
        const Radius.circular(6),
      ),
      paint,
    );
    // Right lens
    canvas.drawRRect(
      RRect.fromRectAndRadius(
        Rect.fromCenter(center: eyeRight, width: gW, height: gH),
        const Radius.circular(6),
      ),
      paint,
    );
    // Arched Bridge
    final bridgePath = Path()
      ..moveTo(eyeLeft.dx + gW * 0.35, eyeLeft.dy - gH * 0.15)
      ..quadraticBezierTo(
        (eyeLeft.dx + eyeRight.dx) / 2,
        (eyeLeft.dy + eyeRight.dy) / 2 - 4,
        eyeRight.dx - gW * 0.35,
        eyeRight.dy - gH * 0.15,
      );
    canvas.drawPath(
      bridgePath,
      Paint()
        ..color = paint.color
        ..strokeWidth = 3.2
        ..style = PaintingStyle.stroke,
    );
  }

  static void _drawRoundGlasses(Canvas canvas, Offset eyeLeft, Offset eyeRight, double w, double tilt) {
    final r = w * 0.12;
    final paint = Paint()
      ..color = const Color(0xFF475569)
      ..style = PaintingStyle.stroke
      ..strokeWidth = 2.4;

    _drawContactShadow(canvas, Offset(eyeLeft.dx, eyeLeft.dy + r * 0.4), r * 1.2, r * 0.5, 0.2);
    _drawContactShadow(canvas, Offset(eyeRight.dx, eyeRight.dy + r * 0.4), r * 1.2, r * 0.5, 0.2);

    canvas.drawCircle(eyeLeft, r, paint);
    canvas.drawCircle(eyeRight, r, paint);

    // Arched bridge
    final bridgePath = Path()
      ..moveTo(eyeLeft.dx + r * 0.9, eyeLeft.dy - r * 0.2)
      ..quadraticBezierTo(
        (eyeLeft.dx + eyeRight.dx) / 2,
        (eyeLeft.dy + eyeRight.dy) / 2 - r * 0.4,
        eyeRight.dx - r * 0.9,
        eyeRight.dy - r * 0.2,
      );
    canvas.drawPath(bridgePath, paint);
  }

  static void _drawBow(Canvas canvas, Offset pos, double w) {
    final bSize = w * 0.16;
    final path = Path()
      ..moveTo(pos.dx, pos.dy)
      ..lineTo(pos.dx - bSize, pos.dy - bSize * 0.6)
      ..lineTo(pos.dx - bSize, pos.dy + bSize * 0.6)
      ..close()
      ..moveTo(pos.dx, pos.dy)
      ..lineTo(pos.dx + bSize, pos.dy - bSize * 0.6)
      ..lineTo(pos.dx + bSize, pos.dy + bSize * 0.6)
      ..close();

    final paint = Paint()..color = const Color(0xFFF06292);
    canvas.drawPath(path, paint);
    canvas.drawCircle(pos, 3.8, Paint()..color = const Color(0xFFC2185B));
  }

  static void _drawScarf(Canvas canvas, Offset neck, double w, double tilt) {
    final scarfW = w * 0.72;
    final scarfH = w * 0.14;

    _drawContactShadow(canvas, Offset(neck.dx, neck.dy + 4), scarfW * 1.05, scarfH * 0.7, 0.32);

    final rect = Rect.fromCenter(center: neck, width: scarfW, height: scarfH);
    canvas.drawRRect(
      RRect.fromRectAndRadius(rect, const Radius.circular(10)),
      Paint()..color = const Color(0xFFDC2626),
    );

    // Hanging tail
    final tailRect = Rect.fromLTWH(neck.dx + scarfW * 0.15, neck.dy, w * 0.15, w * 0.22);
    canvas.drawRRect(
      RRect.fromRectAndRadius(tailRect, const Radius.circular(6)),
      Paint()..color = const Color(0xFFB91C1C),
    );
  }

  static void _drawWitchHat(Canvas canvas, Offset apex, double w, double tilt) {
    final brimW = w * 0.76;
    final brimH = w * 0.18;
    final coneH = w * 0.58;

    _drawContactShadow(canvas, Offset(apex.dx, apex.dy + 3), brimW * 0.95, brimH * 0.9, 0.35);

    canvas.save();
    canvas.translate(apex.dx, apex.dy);
    if (tilt != 0) canvas.rotate(tilt);

    // Brim
    canvas.drawOval(
      Rect.fromCenter(center: Offset.zero, width: brimW, height: brimH),
      Paint()..color = const Color(0xFF1E1B4B),
    );
    // Cone
    final path = Path()
      ..moveTo(-brimW * 0.35, 0)
      ..quadraticBezierTo(w * 0.05, -coneH * 0.5, w * 0.14, -coneH)
      ..quadraticBezierTo(0, -coneH * 0.5, brimW * 0.35, 0)
      ..close();
    canvas.drawPath(path, Paint()..color = const Color(0xFF312E81));

    // Gold band
    canvas.drawOval(
      Rect.fromCenter(center: const Offset(0, -2), width: brimW * 0.42, height: brimH * 0.5),
      Paint()..color = const Color(0xFFF59E0B),
    );
    canvas.restore();
  }

  static void _drawPumpkin(Canvas canvas, Offset apex, double w, double tilt) {
    final pR = w * 0.24;

    _drawContactShadow(canvas, Offset(apex.dx, apex.dy + 3), pR * 1.2, 12, 0.28);

    canvas.save();
    canvas.translate(apex.dx, apex.dy - pR * 0.6);
    if (tilt != 0) canvas.rotate(tilt);

    // Left and right lobes
    canvas.drawCircle(Offset(-pR * 0.38, 0), pR * 0.72, Paint()..color = const Color(0xFFEA580C));
    canvas.drawCircle(Offset(pR * 0.38, 0), pR * 0.72, Paint()..color = const Color(0xFFC2410C));
    // Center lobe
    canvas.drawCircle(Offset.zero, pR * 0.84, Paint()..color = const Color(0xFFFB923C));

    // Green stem
    final stemRect = Rect.fromCenter(center: Offset(0, -pR * 0.9), width: w * 0.06, height: w * 0.12);
    canvas.drawRRect(
      RRect.fromRectAndRadius(stemRect, const Radius.circular(3)),
      Paint()..color = const Color(0xFF16A34A),
    );
    canvas.restore();
  }

  static void _drawSantaHat(Canvas canvas, Offset apex, double w, double tilt) {
    final brimW = w * 0.56;
    final brimH = w * 0.13;
    final hatH = w * 0.45;

    _drawContactShadow(canvas, Offset(apex.dx, apex.dy + 3), brimW * 1.05, 12, 0.3);

    canvas.save();
    canvas.translate(apex.dx, apex.dy);
    if (tilt != 0) canvas.rotate(tilt);

    // Red cap curving over
    final path = Path()
      ..moveTo(-brimW / 2, 0)
      ..quadraticBezierTo(0, -hatH * 1.2, brimW * 0.55, -hatH * 0.65)
      ..quadraticBezierTo(0, -hatH * 0.8, brimW / 2, 0)
      ..close();
    canvas.drawPath(path, Paint()..color = const Color(0xFFDC2626));

    // White fur brim
    canvas.drawRRect(
      RRect.fromRectAndRadius(
        Rect.fromCenter(center: Offset.zero, width: brimW, height: brimH),
        const Radius.circular(8),
      ),
      Paint()..color = Colors.white,
    );

    // Fluffy pom pom
    canvas.drawCircle(Offset(brimW * 0.55, -hatH * 0.65), 7.0, Paint()..color = Colors.white);
    canvas.restore();
  }

  static void _drawBunnyEars(Canvas canvas, Offset apex, double w, double tilt) {
    final earW = w * 0.14;
    final earH = w * 0.52;
    final spacing = w * 0.18;

    _drawContactShadow(canvas, Offset(apex.dx - spacing, apex.dy + 2), earW * 1.2, 8, 0.2);
    _drawContactShadow(canvas, Offset(apex.dx + spacing, apex.dy + 2), earW * 1.2, 8, 0.2);

    canvas.save();
    canvas.translate(apex.dx, apex.dy);
    if (tilt != 0) canvas.rotate(tilt);

    for (final s in [-1, 1]) {
      final ex = s * spacing;
      canvas.save();
      canvas.translate(ex, 0);
      canvas.rotate(s * 0.12);

      // Outer ear
      final outerRect = Rect.fromCenter(center: Offset(0, -earH * 0.5), width: earW, height: earH);
      canvas.drawRRect(RRect.fromRectAndRadius(outerRect, Radius.circular(earW / 2)), Paint()..color = Colors.white);

      // Inner pink
      final innerRect = Rect.fromCenter(center: Offset(0, -earH * 0.5), width: earW * 0.58, height: earH * 0.72);
      canvas.drawRRect(RRect.fromRectAndRadius(innerRect, Radius.circular(earW * 0.29)), Paint()..color = const Color(0xFFF472B6));
      canvas.restore();
    }
    canvas.restore();
  }
}
