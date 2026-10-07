// Approval card mirroring ApprovalCard.swift on iPhone with Android Biometrics.

import 'package:flutter/material.dart';
import '../models/approval.dart';
import '../services/biometric_service.dart';
import '../services/sync_client.dart';

class ApprovalCard extends StatefulWidget {
  final ApprovalRequest request;

  const ApprovalCard({super.key, required this.request});

  @override
  State<ApprovalCard> createState() => _ApprovalCardState();
}

class _ApprovalCardState extends State<ApprovalCard> {
  bool _sending = false;
  Decision? _sent;
  String? _error;

  Future<void> _handleDecision(Decision decision) async {
    setState(() {
      _sending = true;
      _error = null;
    });

    if (decision == Decision.allow) {
      final confirmed = await BiometricService.authenticate(
        reason: 'Allow this command on your computer',
      );
      if (!confirmed) {
        if (mounted) {
          setState(() {
            _sending = false;
            _error = 'Biometrics cancelled. Nothing was sent.';
          });
        }
        return;
      }
    }

    try {
      await SyncClient.instance.sendApprovalDecision(
        requestId: widget.request.requestId,
        decision: decision.name,
        fingerprint: widget.request.fingerprint,
        biometricVerified: decision == Decision.allow,
      );
      if (mounted) {
        setState(() {
          _sending = false;
          _sent = decision;
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _sending = false;
          _error = 'Failed to transmit decision: $e';
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Container(
      decoration: BoxDecoration(
        color: const Color(0xFF16181D),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: const Color(0xFFF59E0B).withOpacity(0.65),
          width: 1.5,
        ),
        boxShadow: [
          BoxShadow(
            color: const Color(0xFFF59E0B).withOpacity(0.08),
            blurRadius: 16,
            spreadRadius: 2,
          ),
        ],
      ),
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                decoration: BoxDecoration(
                  color: const Color(0xFFF59E0B).withOpacity(0.2),
                  borderRadius: BorderRadius.circular(6),
                ),
                child: const Text(
                  'PERMISSION REQUEST',
                  style: TextStyle(
                    color: Color(0xFFF59E0B),
                    fontSize: 11,
                    fontWeight: FontWeight.w700,
                    letterSpacing: 0.5,
                  ),
                ),
              ),
              const Spacer(),
              Text(
                widget.request.tool,
                style: const TextStyle(
                  color: Colors.white70,
                  fontSize: 12,
                  fontWeight: FontWeight.w500,
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Text(
            'Waiting for your OK',
            style: theme.textTheme.titleMedium?.copyWith(
              color: const Color(0xFFF59E0B),
              fontWeight: FontWeight.w600,
            ),
          ),
          const SizedBox(height: 8),
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: const Color(0xFF0F1115),
              borderRadius: BorderRadius.circular(10),
              border: Border.all(color: Colors.white.withOpacity(0.06)),
            ),
            child: SelectableText(
              widget.request.command.isNotEmpty
                  ? widget.request.command
                  : 'Execute tool: ${widget.request.tool}',
              style: const TextStyle(
                fontFamily: 'monospace',
                fontSize: 12.5,
                color: Color(0xFFE2E8F0),
              ),
            ),
          ),
          const SizedBox(height: 12),
          if (_sent != null)
            Row(
              children: [
                Icon(
                  _sent == Decision.allow ? Icons.check_circle : Icons.cancel,
                  color: _sent == Decision.allow ? const Color(0xFF22C55E) : const Color(0xFFEF4444),
                  size: 20,
                ),
                const SizedBox(width: 8),
                Text(
                  _sent == Decision.allow
                      ? 'Allowed, sent to your computer'
                      : 'Denied, sent to your computer',
                  style: TextStyle(
                    color: _sent == Decision.allow ? const Color(0xFF22C55E) : const Color(0xFFEF4444),
                    fontWeight: FontWeight.w600,
                    fontSize: 13,
                  ),
                ),
              ],
            )
          else ...[
            Row(
              children: [
                Expanded(
                  child: OutlinedButton.icon(
                    onPressed: _sending ? null : () => _handleDecision(Decision.deny),
                    icon: const Icon(Icons.close, size: 16),
                    label: const Text('Deny'),
                    style: OutlinedButton.styleFrom(
                      foregroundColor: const Color(0xFFEF4444),
                      side: const BorderSide(color: Color(0xFFEF4444)),
                      padding: const EdgeInsets.symmetric(vertical: 12),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                    ),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: ElevatedButton.icon(
                    onPressed: _sending ? null : () => _handleDecision(Decision.allow),
                    icon: const Icon(Icons.fingerprint, size: 18),
                    label: const Text('Allow'),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: const Color(0xFF22C55E),
                      foregroundColor: Colors.white,
                      padding: const EdgeInsets.symmetric(vertical: 12),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 6),
            const Text(
              'Allow requires Fingerprint / Face Unlock verification.',
              style: TextStyle(color: Colors.white38, fontSize: 11),
            ),
          ],
          if (_error != null) ...[
            const SizedBox(height: 8),
            Text(
              _error!,
              style: const TextStyle(color: Color(0xFFEF4444), fontSize: 11.5),
            ),
          ],
        ],
      ),
    );
  }
}
