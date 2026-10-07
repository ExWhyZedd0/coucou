// Session card displaying live agent session in list.

import 'package:flutter/material.dart';
import '../models/session.dart';
import 'session_detail_screen.dart';

class SessionCard extends StatelessWidget {
  final SessionItem session;

  const SessionCard({super.key, required this.session});

  @override
  Widget build(BuildContext context) {
    final statusColor = session.state == BotState.working
        ? const Color(0xFF3B82F6)
        : session.state == BotState.approval
            ? const Color(0xFFF59E0B)
            : session.state == BotState.thinking
                ? const Color(0xFF8B5CF6)
                : session.state == BotState.finished
                    ? const Color(0xFF22C55E)
                    : session.state == BotState.error
                        ? const Color(0xFFEF4444)
                        : Colors.white38;

    return InkWell(
      onTap: () {
        Navigator.of(context).push(
          MaterialPageRoute(
            builder: (_) => SessionDetailScreen(session: session),
          ),
        );
      },
      borderRadius: BorderRadius.circular(14),
      child: Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: const Color(0xFF14161B),
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: Colors.white.withOpacity(0.06)),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Container(
                  width: 10,
                  height: 10,
                  decoration: BoxDecoration(
                    color: session.color,
                    shape: BoxShape.circle,
                  ),
                ),
                const SizedBox(width: 8),
                Text(
                  session.pillName,
                  style: const TextStyle(
                    color: Colors.white,
                    fontWeight: FontWeight.w600,
                    fontSize: 14,
                  ),
                ),
                const Spacer(),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                  decoration: BoxDecoration(
                    color: statusColor.withOpacity(0.16),
                    borderRadius: BorderRadius.circular(6),
                    border: Border.all(color: statusColor.withOpacity(0.3)),
                  ),
                  child: Text(
                    session.state.label,
                    style: TextStyle(
                      color: statusColor,
                      fontSize: 11,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),
            Text(
              session.currentStep ?? 'Waiting for prompts…',
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(
                color: session.currentStep != null ? Colors.white70 : Colors.white30,
                fontSize: 12.5,
              ),
            ),
            if (session.cwd != null && session.cwd!.isNotEmpty) ...[
              const SizedBox(height: 6),
              Text(
                session.cwd!,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(
                  color: Colors.white24,
                  fontFamily: 'monospace',
                  fontSize: 10.5,
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}
