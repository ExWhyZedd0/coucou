// Decisions history screen displaying permissions allowed or denied on phone.

import 'package:flutter/material.dart';
import '../models/approval.dart';

class DecisionsScreen extends StatefulWidget {
  const DecisionsScreen({super.key});

  @override
  State<DecisionsScreen> createState() => _DecisionsScreenState();
}

class _DecisionsScreenState extends State<DecisionsScreen> {
  List<DecisionLog> _logs = [];
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final list = await DecisionLog.loadHistory();
    if (mounted) {
      setState(() {
        _logs = list;
        _loading = false;
      });
    }
  }

  String _formatDate(DateTime dt) {
    return '${dt.hour.toString().padLeft(2, '0')}:${dt.minute.toString().padLeft(2, '0')} · ${dt.day}/${dt.month}';
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF0B0C0E),
      appBar: AppBar(
        backgroundColor: const Color(0xFF0B0C0E),
        elevation: 0,
        title: const Text('Decision History', style: TextStyle(color: Colors.white, fontSize: 16)),
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator(color: Color(0xFF22C55E)))
          : _logs.isEmpty
              ? const Center(
                  child: Text(
                    'No decisions recorded yet.',
                    style: TextStyle(color: Colors.white30, fontSize: 13),
                  ),
                )
              : ListView.separated(
                  padding: const EdgeInsets.all(16),
                  itemCount: _logs.length,
                  separatorBuilder: (context, index) => const SizedBox(height: 10),
                  itemBuilder: (context, index) {
                    final log = _logs[index];
                    final isAllow = log.decision == Decision.allow;
                    return Container(
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: const Color(0xFF14161B),
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(color: Colors.white.withOpacity(0.04)),
                      ),
                      child: Row(
                        children: [
                          Icon(
                            isAllow ? Icons.check_circle : Icons.cancel,
                            color: isAllow ? const Color(0xFF22C55E) : const Color(0xFFEF4444),
                            size: 20,
                          ),
                          const SizedBox(width: 10),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  log.summary,
                                  style: const TextStyle(
                                    color: Colors.white,
                                    fontSize: 13,
                                    fontWeight: FontWeight.w500,
                                  ),
                                ),
                                const SizedBox(height: 2),
                                Text(
                                  _formatDate(log.date),
                                  style: const TextStyle(color: Colors.white38, fontSize: 11),
                                ),
                              ],
                            ),
                          ),
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                            decoration: BoxDecoration(
                              color: isAllow
                                  ? const Color(0xFF22C55E).withOpacity(0.15)
                                  : const Color(0xFFEF4444).withOpacity(0.15),
                              borderRadius: BorderRadius.circular(6),
                            ),
                            child: Text(
                              isAllow ? 'ALLOWED' : 'DENIED',
                              style: TextStyle(
                                color: isAllow ? const Color(0xFF22C55E) : const Color(0xFFEF4444),
                                fontSize: 10.5,
                                fontWeight: FontWeight.bold,
                              ),
                            ),
                          ),
                        ],
                      ),
                    );
                  },
                ),
    );
  }
}
