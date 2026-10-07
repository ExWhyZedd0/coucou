// Approval models and decision history for Coucou Android Companion.

import 'dart:convert';
import 'package:shared_preferences/shared_preferences.dart';

enum Decision {
  allow,
  deny;

  static Decision fromString(String val) {
    return val.toLowerCase() == 'allow' ? Decision.allow : Decision.deny;
  }
}

class ApprovalRequest {
  final String requestId;
  final String sessionId;
  final String tool;
  final String command;
  final String fingerprint;
  final DateTime createdAt;

  ApprovalRequest({
    required this.requestId,
    required this.sessionId,
    required this.tool,
    required this.command,
    required this.fingerprint,
    required this.createdAt,
  });

  factory ApprovalRequest.fromJson(Map<String, dynamic> json) {
    DateTime created;
    if (json['created_at'] is int) {
      created = DateTime.fromMillisecondsSinceEpoch(json['created_at'] as int);
    } else {
      created = DateTime.now();
    }

    return ApprovalRequest(
      requestId: json['request_id'] as String? ?? '',
      sessionId: json['session_id'] as String? ?? '',
      tool: json['tool'] as String? ?? 'Tool',
      command: json['command'] as String? ?? '',
      fingerprint: json['fingerprint'] as String? ?? '',
      createdAt: created,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'request_id': requestId,
      'session_id': sessionId,
      'tool': tool,
      'command': command,
      'fingerprint': fingerprint,
      'created_at': createdAt.millisecondsSinceEpoch,
    };
  }
}

class DecisionLog {
  final String id;
  final Decision decision;
  final String pillId;
  final String summary;
  final DateTime date;

  DecisionLog({
    required this.id,
    required this.decision,
    required this.pillId,
    required this.summary,
    required this.date,
  });

  factory DecisionLog.fromJson(Map<String, dynamic> json) {
    return DecisionLog(
      id: json['id'] as String? ?? '',
      decision: Decision.fromString(json['decision'] as String? ?? 'deny'),
      pillId: json['pill_id'] as String? ?? '',
      summary: json['summary'] as String? ?? '',
      date: DateTime.fromMillisecondsSinceEpoch(json['date'] as int? ?? 0),
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'decision': decision.name,
      'pill_id': pillId,
      'summary': summary,
      'date': date.millisecondsSinceEpoch,
    };
  }

  static const String _storageKey = 'coucou_decision_history';

  static Future<List<DecisionLog>> loadHistory() async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getStringList(_storageKey);
    if (raw == null) return [];
    return raw
        .map((str) {
          try {
            return DecisionLog.fromJson(jsonDecode(str) as Map<String, dynamic>);
          } catch (_) {
            return null;
          }
        })
        .whereType<DecisionLog>()
        .toList();
  }

  static Future<void> saveHistory(List<DecisionLog> history) async {
    final prefs = await SharedPreferences.getInstance();
    final strings = history.map((e) => jsonEncode(e.toJson())).toList();
    await prefs.setStringList(_storageKey, strings);
  }

  static Future<void> addEntry(DecisionLog entry) async {
    final list = await loadHistory();
    list.insert(0, entry);
    // Keep last 50 decisions
    if (list.length > 50) {
      list.removeRange(50, list.length);
    }
    await saveHistory(list);
  }
}
