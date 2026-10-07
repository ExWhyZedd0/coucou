// Session Detail Screen showing complete turn history and steps.

import 'package:flutter/material.dart';
import '../models/session.dart';
import '../mochi/mochi_widget.dart';

class SessionDetailScreen extends StatelessWidget {
  final SessionItem session;

  const SessionDetailScreen({super.key, required this.session});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF0B0C0E),
      appBar: AppBar(
        backgroundColor: const Color(0xFF0B0C0E),
        elevation: 0,
        title: Text(
          session.pillName,
          style: const TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.w600),
        ),
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Center(
            child: MochiWidget(
              size: 110,
              state: session.state,
              tintOverride: session.color,
            ),
          ),
          const SizedBox(height: 16),
          Center(
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
              decoration: BoxDecoration(
                color: session.color.withOpacity(0.18),
                borderRadius: BorderRadius.circular(12),
              ),
              child: Text(
                session.state.label,
                style: TextStyle(color: session.color, fontWeight: FontWeight.w600),
              ),
            ),
          ),
          if (session.cwd != null && session.cwd!.isNotEmpty) ...[
            const SizedBox(height: 12),
            Container(
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(
                color: const Color(0xFF14161B),
                borderRadius: BorderRadius.circular(8),
              ),
              child: Text(
                'Folder: ${session.cwd}',
                style: const TextStyle(fontFamily: 'monospace', fontSize: 11, color: Colors.white54),
              ),
            ),
          ],
          const SizedBox(height: 20),
          const Text(
            'Session History',
            style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 14),
          ),
          const SizedBox(height: 10),
          if (session.steps.isEmpty)
            const Text('No steps recorded yet.', style: TextStyle(color: Colors.white30))
          else
            ...session.steps.reversed.map((step) {
              return Container(
                margin: const EdgeInsets.only(bottom: 8),
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: const Color(0xFF14161B),
                  borderRadius: BorderRadius.circular(10),
                  border: Border.all(color: Colors.white.withOpacity(0.04)),
                ),
                child: Text(
                  step,
                  style: const TextStyle(color: Colors.white70, fontSize: 12.5),
                ),
              );
            }),
        ],
      ),
    );
  }
}
