import 'package:flutter_test/flutter_test.dart';
import 'package:coucou/models/approval.dart';
import 'package:coucou/models/pairing.dart';
import 'package:coucou/models/question.dart';
import 'package:coucou/models/session.dart';

void main() {
  group('Protocol and Model Parsing', () {
    test('SessionItem deserialization and state mapping', () {
      final json = {
        'id': 'agent_gemini',
        'name': 'Gemini CLI',
        'color': '#8AB4F8',
        'state': 'working',
        'step_index': 1,
        'steps': ['Analyzing codebase', 'Generating test files'],
        'needs_approval': false,
        'approval_command': '',
        'approval_fingerprint': '',
        'cwd': 'C:\\projects\\coucou',
        'updated_at': 1700000000000,
      };

      final session = SessionItem.fromJson(json);
      expect(session.id, 'agent_gemini');
      expect(session.pillName, 'Gemini CLI');
      expect(session.state, BotState.working);
      expect(session.steps.length, 2);
      expect(session.currentStep, 'Generating test files');
      expect(session.color.value, 0xFF8AB4F8);

      final outJson = session.toJson();
      expect(outJson['id'], 'agent_gemini');
      expect(outJson['state'], 'working');
    });

    test('ApprovalRequest deserialization', () {
      final json = {
        'request_id': 'req-1234',
        'session_id': 'sess-5678',
        'tool': 'Bash',
        'command': 'Bash · cargo test',
        'fingerprint': 'fp-abc',
        'created_at': 1700000000000,
      };

      final req = ApprovalRequest.fromJson(json);
      expect(req.requestId, 'req-1234');
      expect(req.tool, 'Bash');
      expect(req.command, 'Bash · cargo test');
      expect(req.fingerprint, 'fp-abc');

      final serialized = req.toJson();
      expect(serialized['request_id'], 'req-1234');
    });

    test('QuestionRequest parsing with options', () {
      final json = {
        'request_id': 'q-99',
        'session_id': 'sess-1',
        'question': 'Which database should we use?',
        'header': 'DATABASE',
        'options': [
          {'label': 'PostgreSQL', 'description': 'Relational DB'},
          {'label': 'SQLite', 'description': 'Embedded DB'},
        ],
        'multi_select': true,
      };

      final q = QuestionRequest.fromJson(json);
      expect(q.requestId, 'q-99');
      expect(q.header, 'DATABASE');
      expect(q.options.length, 2);
      expect(q.options[0].label, 'PostgreSQL');
      expect(q.multiSelect, true);
    });

    test('PairingConfig URI parsing', () {
      final uri = Uri.parse(
        'coucou://pair?v=1&ip=192.168.1.150&port=7654&secret=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef&id=win-test&name=Felix-PC',
      );

      final config = PairingConfig.fromUri(uri);
      expect(config, isNotNull);
      expect(config!.ip, '192.168.1.150');
      expect(config.port, 7654);
      expect(config.secret, '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef');
      expect(config.deviceName, 'Felix-PC');
      expect(config.wsUrl, 'ws://192.168.1.150:7654');
    });

    test('DecisionLog serialization round-trip', () {
      final log = DecisionLog(
        id: '123',
        decision: Decision.allow,
        pillId: 'approval',
        summary: 'Allowed via Biometrics',
        date: DateTime.fromMillisecondsSinceEpoch(1700000000000),
      );

      final json = log.toJson();
      final restored = DecisionLog.fromJson(json);
      expect(restored.id, '123');
      expect(restored.decision, Decision.allow);
      expect(restored.summary, 'Allowed via Biometrics');
    });

    test('PairingConfig robust parsing for URL variants and raw strings', () {
      // Variant 1: trailing slash in host
      final c1 = PairingConfig.fromRawString(
        '  coucou://pair/?v=1&ip=10.0.0.5&port=8080&secret=abc12345&id=win-1&name=Workstation  ',
      );
      expect(c1, isNotNull);
      expect(c1!.ip, '10.0.0.5');
      expect(c1.port, 8080);
      expect(c1.secret, 'abc12345');
      expect(c1.deviceName, 'Workstation');

      // Variant 2: invalid scheme fails cleanly
      final c2 = PairingConfig.fromRawString('http://example.com');
      expect(c2, isNull);

      // Variant 3: JSON string
      final c3 = PairingConfig.fromRawString('{"ip":"172.16.0.2","port":7654,"secret":"sec","device_id":"d1","device_name":"Laptop","paired_at":1000}');
      expect(c3, isNotNull);
      expect(c3!.ip, '172.16.0.2');

      // Variant 4: IPv6 address with brackets and case-insensitive scheme
      final c4 = PairingConfig.fromRawString(
        'COUCOU://pair?ip=[2001:db8::1]&port=7654&secret=sec12345&id=win-v6&name=IPv6-PC',
      );
      expect(c4, isNotNull);
      expect(c4!.ip, '2001:db8::1');
      expect(c4.wsUrl, 'ws://[2001:db8::1]:7654');

      // Variant 5: Invalid port out of range
      final c5 = PairingConfig.fromRawString(
        'coucou://pair?ip=127.0.0.1&port=99999&secret=sec&id=d&name=n',
      );
      expect(c5, isNull);
    });

    test('SessionItem state transitions between idle, approval, and working', () {
      final session = SessionItem(
        id: 'integration_claude',
        name: 'Claude Code',
        colorHex: '#F5F6F8',
        state: BotState.working,
        stepIndex: 0,
        steps: ['Run edit'],
        needsApproval: false,
        approvalCommand: '',
        approvalFingerprint: '',
        updatedAt: DateTime.now(),
      );

      // Transition to approval
      final approving = SessionItem(
        id: session.id,
        name: session.name,
        colorHex: session.colorHex,
        state: BotState.approval,
        stepIndex: session.stepIndex,
        steps: session.steps,
        needsApproval: true,
        approvalCommand: 'Write · file.txt',
        approvalFingerprint: 'req-999',
        updatedAt: DateTime.now(),
      );
      expect(approving.state, BotState.approval);
      expect(approving.needsApproval, isTrue);
      expect(approving.approvalCommand, 'Write · file.txt');

      // Transition back after resolution
      final resolved = SessionItem(
        id: session.id,
        name: session.name,
        colorHex: session.colorHex,
        state: BotState.working,
        stepIndex: session.stepIndex,
        steps: session.steps,
        needsApproval: false,
        approvalCommand: '',
        approvalFingerprint: '',
        updatedAt: DateTime.now(),
      );
      expect(resolved.state, BotState.working);
      expect(resolved.needsApproval, isFalse);
    });
  });
}
