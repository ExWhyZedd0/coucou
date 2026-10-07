// Agent session models for Coucou Android Companion.

import 'dart:ui';

enum BotState {
  idle,
  thinking,
  working,
  approval,
  question,
  finished,
  error,
  ratelimit,
  sleep;

  static BotState fromString(String? str) {
    switch (str?.toLowerCase()) {
      case 'thinking':
        return BotState.thinking;
      case 'working':
        return BotState.working;
      case 'approval':
        return BotState.approval;
      case 'question':
        return BotState.question;
      case 'finished':
        return BotState.finished;
      case 'error':
        return BotState.error;
      case 'ratelimit':
        return BotState.ratelimit;
      case 'sleep':
        return BotState.sleep;
      case 'idle':
      default:
        return BotState.idle;
    }
  }

  String get label {
    switch (this) {
      case BotState.idle:
        return 'Idle';
      case BotState.thinking:
        return 'Thinking…';
      case BotState.working:
        return 'Working';
      case BotState.approval:
        return 'Needs Approval';
      case BotState.question:
        return 'Waiting for Answer';
      case BotState.finished:
        return 'Finished';
      case BotState.error:
        return 'Error';
      case BotState.ratelimit:
        return 'Rate Limited';
      case BotState.sleep:
        return 'Sleeping';
    }
  }
}

class SessionItem {
  final String id;
  final String name;
  final String colorHex;
  final BotState state;
  final int stepIndex;
  final List<String> steps;
  final bool needsApproval;
  final String approvalCommand;
  final String approvalFingerprint;
  final String? cwd;
  final DateTime updatedAt;

  SessionItem({
    required this.id,
    required this.name,
    required this.colorHex,
    required this.state,
    required this.stepIndex,
    required this.steps,
    required this.needsApproval,
    required this.approvalCommand,
    required this.approvalFingerprint,
    this.cwd,
    required this.updatedAt,
  });

  Color get color {
    final hex = colorHex.replaceFirst('#', '');
    if (hex.length == 6) {
      return Color(int.parse('FF$hex', radix: 16));
    }
    return const Color(0xFF22C55E);
  }

  String get pillName {
    if (id == 'integration_claude') return 'Claude Code';
    if (id == 'agent_gemini') return 'Gemini CLI';
    if (id == 'agent_antigravity') return 'Antigravity';
    if (id == 'agent_codex') return 'Codex';
    return name.isNotEmpty ? name : id;
  }

  String? get currentStep {
    if (steps.isEmpty) return null;
    if (stepIndex >= 0 && stepIndex < steps.length) {
      return steps[stepIndex];
    }
    return steps.last;
  }

  factory SessionItem.fromJson(Map<String, dynamic> json) {
    final rawSteps = json['steps'] as List<dynamic>? ?? [];
    final steps = rawSteps.map((e) => e.toString()).toList();

    DateTime updated;
    if (json['updated_at'] is int) {
      updated = DateTime.fromMillisecondsSinceEpoch(json['updated_at'] as int);
    } else {
      updated = DateTime.now();
    }

    return SessionItem(
      id: json['id'] as String? ?? 'unknown',
      name: json['name'] as String? ?? '',
      colorHex: json['color'] as String? ?? '#22C55E',
      state: BotState.fromString(json['state'] as String?),
      stepIndex: json['step_index'] as int? ?? (steps.isNotEmpty ? steps.length - 1 : 0),
      steps: steps,
      needsApproval: json['needs_approval'] as bool? ?? false,
      approvalCommand: json['approval_command'] as String? ?? '',
      approvalFingerprint: json['approval_fingerprint'] as String? ?? '',
      cwd: json['cwd'] as String?,
      updatedAt: updated,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'name': name,
      'color': colorHex,
      'state': state.name,
      'step_index': stepIndex,
      'steps': steps,
      'needs_approval': needsApproval,
      'approval_command': approvalCommand,
      'approval_fingerprint': approvalFingerprint,
      'cwd': cwd,
      'updated_at': updatedAt.millisecondsSinceEpoch,
    };
  }
}
