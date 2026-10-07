// Mochi character CustomPainter rendering squircle body, eye tracking, emotes, and outfits.

import 'dart:math' as math;
import 'package:flutter/material.dart';
import '../models/session.dart';
import 'mochi_outfits.dart';

class MochiPainter extends CustomPainter {
  final BotState state;
  final Offset lookTarget; // normalized [-1.0, 1.0]
  final double blink; // 0.0 (open) to 1.0 (closed)
  final double breath; // subtle scale factor around 1.0
  final MochiOutfit outfit;
  final Color? tintOverride;

  MochiPainter({
    this.state = BotState.idle,
    this.lookTarget = Offset.zero,
    this.blink = 0.0,
    this.breath = 1.0,
    this.outfit = MochiOutfit.auto,
    this.tintOverride,
  });

  @override
  void paint(Canvas canvas, Size size) {
    final w = size.width;
    final h = size.height;
    final center = Offset(w / 2, h / 2);

    canvas.save();
    // Center scaling for breathing / squish
    canvas.translate(center.dx, center.dy);
    canvas.scale(breath, breath);
    canvas.translate(-center.dx, -center.dy);

    // 1. Draw Body Squircle
    _drawBody(canvas, size);

    // 2. Draw Cheeks / Blushes
    _drawCheeks(canvas, size);

    // 3. Draw Eyes with Tracking & Emote Shapes
    _drawEyes(canvas, size);

    // 4. Draw Badges / Particles
    _drawStateBadge(canvas, size);

    // 5. Draw 3D Attached Outfit Model
    final apexPoint = Offset(
      w * 0.5 + lookTarget.dx * w * 0.04,
      h * 0.13 + (1.0 - breath) * h * 0.08 + lookTarget.dy * h * 0.03,
    );
    final eyeLeft = Offset(
      w * 0.35 + lookTarget.dx * w * 0.04,
      h * 0.48 + lookTarget.dy * h * 0.04,
    );
    final eyeRight = Offset(
      w * 0.65 + lookTarget.dx * w * 0.04,
      h * 0.48 + lookTarget.dy * h * 0.04,
    );
    final neckPoint = Offset(
      w * 0.5 - lookTarget.dx * w * 0.02,
      h * 0.86 - lookTarget.dy * h * 0.02,
    );
    final skel = MochiSkeletalContext(
      size: size,
      apex: apexPoint,
      eyeLeft: eyeLeft,
      eyeRight: eyeRight,
      neck: neckPoint,
      breath: breath,
      tilt: lookTarget.dx * 0.12,
    );
    MochiOutfitPainter.draw(canvas, size, outfit, skel);

    canvas.restore();
  }

  void _drawBody(Canvas canvas, Size size) {
    final w = size.width;
    final h = size.height;
    final bodyRect = Rect.fromCenter(
      center: Offset(w / 2, h * 0.52),
      width: w * 0.88,
      height: h * 0.78,
    );

    // Continuous squircle superellipse approximation via RRect with corner radius ~ 38%
    final rrect = RRect.fromRectAndRadius(
      bodyRect,
      Radius.circular(w * 0.36),
    );

    // State tint colors matching macOS/Windows BotEngine
    Color tintColor;
    if (tintOverride != null) {
      tintColor = tintOverride!;
    } else {
      switch (state) {
        case BotState.working:
          tintColor = const Color(0xFF3B82F6);
          break;
        case BotState.thinking:
          tintColor = const Color(0xFF8B5CF6);
          break;
        case BotState.approval:
          tintColor = const Color(0xFFF59E0B);
          break;
        case BotState.question:
          tintColor = const Color(0xFF06B6D4);
          break;
        case BotState.finished:
          tintColor = const Color(0xFF22C55E);
          break;
        case BotState.error:
          tintColor = const Color(0xFFEF4444);
          break;
        case BotState.ratelimit:
          tintColor = const Color(0xFFF97316);
          break;
        case BotState.sleep:
          tintColor = const Color(0xFF94A3B8);
          break;
        case BotState.idle:
          tintColor = const Color(0xFFEDEDEF);
          break;
      }
    }

    final topColor = state == BotState.idle
        ? const Color(0xFFF8F9FA)
        : Color.lerp(const Color(0xFFF8F9FA), tintColor, 0.45)!;
    final bottomColor = state == BotState.idle
        ? const Color(0xFFC4C5CA)
        : Color.lerp(const Color(0xFFC4C5CA), tintColor, 0.65)!;

    // Drop shadow under body
    canvas.drawRRect(
      rrect.shift(const Offset(0, 4)),
      Paint()
        ..color = Colors.black.withOpacity(0.18)
        ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 8),
    );

    // Body Gradient
    final bodyPaint = Paint()
      ..shader = LinearGradient(
        begin: Alignment.topCenter,
        end: Alignment.bottomCenter,
        colors: [topColor, bottomColor],
      ).createShader(bodyRect);
    canvas.drawRRect(rrect, bodyPaint);

    // Subtle edge highlight (inner border)
    canvas.drawRRect(
      rrect,
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 1.2
        ..color = Colors.white.withOpacity(0.6),
    );
  }

  void _drawCheeks(Canvas canvas, Size size) {
    final w = size.width;
    final h = size.height;
    final cy = h * 0.58;
    final radius = w * 0.07;
    final cheekPaint = Paint()
      ..color = const Color(0xFFFF8DA1).withOpacity(state == BotState.finished ? 0.45 : 0.28)
      ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 4.5);

    canvas.drawCircle(Offset(w * 0.22, cy), radius, cheekPaint);
    canvas.drawCircle(Offset(w * 0.78, cy), radius, cheekPaint);
  }

  void _drawEyes(Canvas canvas, Size size) {
    if (blink > 0.85) {
      // Eyes closed during blink
      _drawClosedEyes(canvas, size);
      return;
    }

    switch (state) {
      case BotState.sleep:
        _drawSleepingEyes(canvas, size);
        break;
      case BotState.finished:
        _drawHappyEyes(canvas, size);
        break;
      case BotState.error:
        _drawFlatEyes(canvas, size);
        break;
      case BotState.approval:
        _drawWideEyes(canvas, size);
        break;
      case BotState.idle:
      case BotState.working:
      case BotState.thinking:
      case BotState.question:
      case BotState.ratelimit:
        _drawPillEyes(canvas, size);
        break;
    }
  }

  void _drawPillEyes(Canvas canvas, Size size) {
    final w = size.width;
    final h = size.height;
    final eyeW = w * 0.16;
    final eyeH = h * 0.22 * (1.0 - blink * 0.9);
    final leftX = w * 0.35 + lookTarget.dx * w * 0.04;
    final rightX = w * 0.65 + lookTarget.dx * w * 0.04;
    final eyeY = h * 0.48 + lookTarget.dy * h * 0.04;

    final inkPaint = Paint()..color = const Color(0xFF1A1412);

    final leftRect = RRect.fromRectAndRadius(
      Rect.fromCenter(center: Offset(leftX, eyeY), width: eyeW, height: eyeH),
      Radius.circular(eyeW / 2),
    );
    final rightRect = RRect.fromRectAndRadius(
      Rect.fromCenter(center: Offset(rightX, eyeY), width: eyeW, height: eyeH),
      Radius.circular(eyeW / 2),
    );

    canvas.drawRRect(leftRect, inkPaint);
    canvas.drawRRect(rightRect, inkPaint);

    // Pupil shine (cute white gleam in top right of each eye)
    if (blink < 0.3) {
      final shinePaint = Paint()..color = Colors.white;
      final shineR = eyeW * 0.22;
      canvas.drawCircle(Offset(leftX + eyeW * 0.18, eyeY - eyeH * 0.22), shineR, shinePaint);
      canvas.drawCircle(Offset(rightX + eyeW * 0.18, eyeY - eyeH * 0.22), shineR, shinePaint);
    }
  }

  void _drawWideEyes(Canvas canvas, Size size) {
    final w = size.width;
    final h = size.height;
    final eyeRadius = w * 0.11;
    final leftX = w * 0.35 + lookTarget.dx * w * 0.03;
    final rightX = w * 0.65 + lookTarget.dx * w * 0.03;
    final eyeY = h * 0.48 + lookTarget.dy * h * 0.03;

    final inkPaint = Paint()..color = const Color(0xFF1A1412);
    canvas.drawCircle(Offset(leftX, eyeY), eyeRadius, inkPaint);
    canvas.drawCircle(Offset(rightX, eyeY), eyeRadius, inkPaint);

    // Two sparkles per eye for eager/waiting approval look
    final shinePaint = Paint()..color = Colors.white;
    canvas.drawCircle(Offset(leftX + eyeRadius * 0.35, eyeY - eyeRadius * 0.35), eyeRadius * 0.32, shinePaint);
    canvas.drawCircle(Offset(leftX - eyeRadius * 0.25, eyeY + eyeRadius * 0.25), eyeRadius * 0.18, shinePaint);
    canvas.drawCircle(Offset(rightX + eyeRadius * 0.35, eyeY - eyeRadius * 0.35), eyeRadius * 0.32, shinePaint);
    canvas.drawCircle(Offset(rightX - eyeRadius * 0.25, eyeY + eyeRadius * 0.25), eyeRadius * 0.18, shinePaint);
  }

  void _drawHappyEyes(Canvas canvas, Size size) {
    final w = size.width;
    final h = size.height;
    final arcR = w * 0.10;
    final leftX = w * 0.35;
    final rightX = w * 0.65;
    final eyeY = h * 0.48;

    final paint = Paint()
      ..color = const Color(0xFF1A1412)
      ..style = PaintingStyle.stroke
      ..strokeWidth = 3.6
      ..strokeCap = StrokeCap.round;

    // Upward smiling arcs (∩)
    canvas.drawArc(
      Rect.fromCenter(center: Offset(leftX, eyeY), width: arcR * 2, height: arcR * 1.8),
      math.pi,
      math.pi,
      false,
      paint,
    );
    canvas.drawArc(
      Rect.fromCenter(center: Offset(rightX, eyeY), width: arcR * 2, height: arcR * 1.8),
      math.pi,
      math.pi,
      false,
      paint,
    );
  }

  void _drawClosedEyes(Canvas canvas, Size size) {
    final w = size.width;
    final h = size.height;
    final leftX = w * 0.35;
    final rightX = w * 0.65;
    final eyeY = h * 0.48;

    final paint = Paint()
      ..color = const Color(0xFF1A1412)
      ..style = PaintingStyle.stroke
      ..strokeWidth = 3.0
      ..strokeCap = StrokeCap.round;

    canvas.drawLine(Offset(leftX - w * 0.08, eyeY), Offset(leftX + w * 0.08, eyeY), paint);
    canvas.drawLine(Offset(rightX - w * 0.08, eyeY), Offset(rightX + w * 0.08, eyeY), paint);
  }

  void _drawSleepingEyes(Canvas canvas, Size size) {
    final w = size.width;
    final h = size.height;
    final arcR = w * 0.08;
    final leftX = w * 0.35;
    final rightX = w * 0.65;
    final eyeY = h * 0.48;

    final paint = Paint()
      ..color = const Color(0xFF1A1412)
      ..style = PaintingStyle.stroke
      ..strokeWidth = 3.0
      ..strokeCap = StrokeCap.round;

    // Gentle resting curved arcs (∪)
    canvas.drawArc(
      Rect.fromCenter(center: Offset(leftX, eyeY), width: arcR * 2, height: arcR * 1.5),
      0,
      math.pi,
      false,
      paint,
    );
    canvas.drawArc(
      Rect.fromCenter(center: Offset(rightX, eyeY), width: arcR * 2, height: arcR * 1.5),
      0,
      math.pi,
      false,
      paint,
    );
  }

  void _drawFlatEyes(Canvas canvas, Size size) {
    final w = size.width;
    final h = size.height;
    final leftX = w * 0.35;
    final rightX = w * 0.65;
    final eyeY = h * 0.48;

    final paint = Paint()
      ..color = const Color(0xFF1A1412)
      ..style = PaintingStyle.stroke
      ..strokeWidth = 3.8
      ..strokeCap = StrokeCap.round;

    canvas.drawLine(Offset(leftX - w * 0.07, eyeY), Offset(leftX + w * 0.07, eyeY), paint);
    canvas.drawLine(Offset(rightX - w * 0.07, eyeY), Offset(rightX + w * 0.07, eyeY), paint);
  }

  void _drawStateBadge(Canvas canvas, Size size) {
    final w = size.width;
    final h = size.height;
    final badgeCenter = Offset(w * 0.82, h * 0.20);

    if (state == BotState.approval) {
      // Exclamation badge (!)
      canvas.drawCircle(badgeCenter, 10, Paint()..color = const Color(0xFFF59E0B));
      final textPainter = TextPainter(
        text: const TextSpan(
          text: '!',
          style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 13),
        ),
        textDirection: TextDirection.ltr,
      )..layout();
      textPainter.paint(
        canvas,
        badgeCenter - Offset(textPainter.width / 2, textPainter.height / 2),
      );
    } else if (state == BotState.question) {
      // Question mark badge (?)
      canvas.drawCircle(badgeCenter, 10, Paint()..color = const Color(0xFF06B6D4));
      final textPainter = TextPainter(
        text: const TextSpan(
          text: '?',
          style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 12),
        ),
        textDirection: TextDirection.ltr,
      )..layout();
      textPainter.paint(
        canvas,
        badgeCenter - Offset(textPainter.width / 2, textPainter.height / 2),
      );
    } else if (state == BotState.sleep) {
      // Zzz floating text
      final textPainter = TextPainter(
        text: const TextSpan(
          text: 'z Z',
          style: TextStyle(color: Color(0xFF94A3B8), fontWeight: FontWeight.bold, fontSize: 13),
        ),
        textDirection: TextDirection.ltr,
      )..layout();
      textPainter.paint(canvas, Offset(w * 0.72, h * 0.12));
    }
  }

  @override
  bool shouldRepaint(covariant MochiPainter oldDelegate) {
    return oldDelegate.state != state ||
        oldDelegate.lookTarget != lookTarget ||
        oldDelegate.blink != blink ||
        oldDelegate.breath != breath ||
        oldDelegate.outfit != outfit ||
        oldDelegate.tintOverride != tintOverride;
  }
}
