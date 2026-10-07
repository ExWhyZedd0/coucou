// Coucou Android Companion Home Screen.
// Displays connected computer, hero Mochi, pending approvals, questions, and active sessions.

import 'package:flutter/material.dart';
import '../models/session.dart';
import '../mochi/mochi_outfits.dart';
import '../mochi/mochi_widget.dart';
import '../services/sync_client.dart';
import 'approval_card.dart';
import 'decisions_screen.dart';
import 'question_card.dart';
import 'scanner_screen.dart';
import 'session_card.dart';
import 'wardrobe_screen.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  final SyncClient _sync = SyncClient.instance;
  MochiOutfit _mochiOutfit = MochiOutfit.auto;

  @override
  void initState() {
    super.initState();
    _sync.addListener(_onSyncUpdate);
  }

  @override
  void dispose() {
    _sync.removeListener(_onSyncUpdate);
    super.dispose();
  }

  void _onSyncUpdate() {
    if (mounted) setState(() {});
  }

  BotState _deriveMochiState() {
    if (_sync.pendingApproval != null) return BotState.approval;
    if (_sync.pendingQuestion != null) return BotState.question;
    for (final s in _sync.sessions) {
      if (s.state == BotState.working) return BotState.working;
      if (s.state == BotState.thinking) return BotState.thinking;
      if (s.state == BotState.error) return BotState.error;
    }
    return BotState.idle;
  }

  @override
  Widget build(BuildContext context) {
    final mochiState = _deriveMochiState();
    final isConnected = _sync.status == SyncConnectionStatus.connected;
    final isConnecting = _sync.status == SyncConnectionStatus.connecting;

    return Scaffold(
      backgroundColor: const Color(0xFF0B0C0E),
      appBar: AppBar(
        backgroundColor: const Color(0xFF0B0C0E),
        elevation: 0,
        title: Row(
          children: [
            Container(
              width: 9,
              height: 9,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: isConnected
                    ? const Color(0xFF22C55E)
                    : isConnecting
                        ? const Color(0xFFF59E0B)
                        : const Color(0xFF6B7280),
              ),
            ),
            const SizedBox(width: 8),
            Text(
              isConnected
                  ? (_sync.connectedDeviceName ?? 'Coucou Computer')
                  : isConnecting
                      ? 'Connecting…'
                      : 'Coucou Companion',
              style: const TextStyle(
                color: Colors.white,
                fontSize: 15,
                fontWeight: FontWeight.w600,
              ),
            ),
          ],
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.check_circle_outline, color: Colors.white70, size: 20),
            tooltip: 'Decisions Log',
            onPressed: () {
              Navigator.of(context).push(
                MaterialPageRoute(builder: (_) => const DecisionsScreen()),
              );
            },
          ),
          IconButton(
            icon: const Icon(Icons.style_outlined, color: Colors.white70, size: 20),
            tooltip: 'Wardrobe',
            onPressed: () {
              Navigator.of(context).push(
                MaterialPageRoute(
                  builder: (_) => WardrobeScreen(
                    currentOutfit: _mochiOutfit,
                    onOutfitChanged: (o) => setState(() => _mochiOutfit = o),
                  ),
                ),
              );
            },
          ),
          IconButton(
            icon: const Icon(Icons.qr_code_scanner, color: Color(0xFF22C55E), size: 22),
            tooltip: 'Scan QR Code',
            onPressed: () {
              Navigator.of(context).push(
                MaterialPageRoute(builder: (_) => const ScannerScreen()),
              );
            },
          ),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
        children: [
          // Connection status card if not connected
          if (!isConnected)
            Container(
              margin: const EdgeInsets.only(bottom: 16),
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                color: const Color(0xFF14161B),
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: Colors.white.withOpacity(0.06)),
              ),
              child: Row(
                children: [
                  const Icon(Icons.wifi_off, color: Color(0xFFF59E0B), size: 20),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          _sync.pairedConfig != null
                              ? 'Waiting for PC (${_sync.pairedConfig!.ip})'
                              : 'Not paired with computer',
                          style: const TextStyle(color: Colors.white, fontSize: 13, fontWeight: FontWeight.w600),
                        ),
                        const SizedBox(height: 2),
                        const Text(
                          'Open Settings in Coucou Windows & scan QR code',
                          style: TextStyle(color: Colors.white38, fontSize: 11),
                        ),
                      ],
                    ),
                  ),
                  ElevatedButton(
                    onPressed: () {
                      Navigator.of(context).push(
                        MaterialPageRoute(builder: (_) => const ScannerScreen()),
                      );
                    },
                    style: ElevatedButton.styleFrom(
                      backgroundColor: const Color(0xFF22C55E),
                      foregroundColor: Colors.white,
                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                      minimumSize: Size.zero,
                    ),
                    child: const Text('Pair', style: TextStyle(fontSize: 12)),
                  ),
                ],
              ),
            ),

          // Hero Mochi companion
          Center(
            child: Padding(
              padding: const EdgeInsets.symmetric(vertical: 8),
              child: MochiWidget(
                size: 140,
                state: mochiState,
                outfit: _mochiOutfit,
              ),
            ),
          ),
          Center(
            child: Text(
              mochiState.label,
              style: TextStyle(
                color: mochiState == BotState.idle ? Colors.white38 : const Color(0xFF22C55E),
                fontSize: 12,
                fontWeight: FontWeight.w600,
                letterSpacing: 0.4,
              ),
            ),
          ),
          const SizedBox(height: 20),

          // Urgent Approval Request Card
          if (_sync.pendingApproval != null) ...[
            ApprovalCard(request: _sync.pendingApproval!),
            const SizedBox(height: 16),
          ],

          // Agent Question Card
          if (_sync.pendingQuestion != null) ...[
            QuestionCard(request: _sync.pendingQuestion!),
            const SizedBox(height: 16),
          ],

          // Active Agent Sessions
          Row(
            children: [
              const Text(
                'Active Agent Sessions',
                style: TextStyle(
                  color: Colors.white,
                  fontWeight: FontWeight.bold,
                  fontSize: 14,
                ),
              ),
              const Spacer(),
              Text(
                '${_sync.sessions.length} sessions',
                style: const TextStyle(color: Colors.white38, fontSize: 12),
              ),
            ],
          ),
          const SizedBox(height: 10),

          if (_sync.sessions.isEmpty)
            Container(
              padding: const EdgeInsets.all(24),
              decoration: BoxDecoration(
                color: const Color(0xFF14161B),
                borderRadius: BorderRadius.circular(14),
                border: Border.all(color: Colors.white.withOpacity(0.04)),
              ),
              child: const Column(
                children: [
                  Icon(Icons.terminal, color: Colors.white24, size: 32),
                  SizedBox(height: 8),
                  Text(
                    'No active agent sessions',
                    style: TextStyle(color: Colors.white54, fontSize: 13, fontWeight: FontWeight.w500),
                  ),
                  SizedBox(height: 4),
                  Text(
                    'Claude Code, Gemini CLI, Antigravity, or Codex will stream here in real time.',
                    textAlign: TextAlign.center,
                    style: TextStyle(color: Colors.white24, fontSize: 11),
                  ),
                ],
              ),
            )
          else
            ..._sync.sessions.map((s) {
              return Padding(
                padding: const EdgeInsets.only(bottom: 10),
                child: SessionCard(session: s),
              );
            }),
        ],
      ),
    );
  }
}
