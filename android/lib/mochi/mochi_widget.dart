// Interactive animated Mochi widget with eye tracking and breathing.

import 'dart:async';
import 'dart:math' as math;
import 'package:flutter/material.dart';
import '../models/session.dart';
import 'mochi_outfits.dart';
import 'mochi_painter.dart';

class MochiWidget extends StatefulWidget {
  final double size;
  final BotState state;
  final MochiOutfit outfit;
  final Color? tintOverride;
  final VoidCallback? onTap;

  const MochiWidget({
    super.key,
    this.size = 140,
    this.state = BotState.idle,
    this.outfit = MochiOutfit.auto,
    this.tintOverride,
    this.onTap,
  });

  @override
  State<MochiWidget> createState() => _MochiWidgetState();
}

class _MochiWidgetState extends State<MochiWidget>
    with SingleTickerProviderStateMixin {
  late AnimationController _controller;
  Offset _lookTarget = Offset.zero;
  double _blink = 0.0;
  Timer? _blinkTimer;
  Timer? _wanderTimer;
  double _squish = 1.0;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 2400),
    )..repeat(reverse: true);

    _scheduleNextBlink();
    _scheduleEyeWander();
  }

  void _scheduleNextBlink() {
    final nextMs = 2200 + math.Random().nextInt(2800);
    _blinkTimer = Timer(Duration(milliseconds: nextMs), () {
      if (!mounted) return;
      setState(() => _blink = 1.0);
      Future.delayed(const Duration(milliseconds: 140), () {
        if (!mounted) return;
        setState(() => _blink = 0.0);
        _scheduleNextBlink();
      });
    });
  }

  void _scheduleEyeWander() {
    final nextMs = 1800 + math.Random().nextInt(2400);
    _wanderTimer = Timer(Duration(milliseconds: nextMs), () {
      if (!mounted) return;
      if (widget.state == BotState.idle) {
        final rx = (math.Random().nextDouble() - 0.5) * 1.2;
        final ry = (math.Random().nextDouble() - 0.5) * 0.8;
        setState(() => _lookTarget = Offset(rx, ry));
      }
      _scheduleEyeWander();
    });
  }

  @override
  void dispose() {
    _controller.dispose();
    _blinkTimer?.cancel();
    _wanderTimer?.cancel();
    super.dispose();
  }

  void _handlePointerHover(PointerEvent event, BoxConstraints constraints) {
    final center = Offset(constraints.maxWidth / 2, constraints.maxHeight / 2);
    final dx = (event.localPosition.dx - center.dx) / (constraints.maxWidth / 2);
    final dy = (event.localPosition.dy - center.dy) / (constraints.maxHeight / 2);
    setState(() {
      _lookTarget = Offset(dx.clamp(-1.0, 1.0), dy.clamp(-1.0, 1.0));
    });
  }

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        return GestureDetector(
          onTapDown: (_) => setState(() => _squish = 0.92),
          onTapUp: (_) {
            setState(() => _squish = 1.0);
            widget.onTap?.call();
          },
          onTapCancel: () => setState(() => _squish = 1.0),
          child: MouseRegion(
            onHover: (e) => _handlePointerHover(e, constraints),
            child: AnimatedBuilder(
              animation: _controller,
              builder: (context, child) {
                // Subtle breathing curve
                final breath = 1.0 + math.sin(_controller.value * math.pi) * 0.02 * _squish;
                return CustomPaint(
                  size: Size(widget.size, widget.size),
                  painter: MochiPainter(
                    state: widget.state,
                    lookTarget: _lookTarget,
                    blink: _blink,
                    breath: breath,
                    outfit: widget.outfit,
                    tintOverride: widget.tintOverride,
                  ),
                );
              },
            ),
          ),
        );
      },
    );
  }
}
