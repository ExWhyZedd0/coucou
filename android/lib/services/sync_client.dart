// Sync Client managing LAN WebSocket connection, mDNS discovery, and real-time state.

import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'package:flutter/foundation.dart';
import 'package:multicast_dns/multicast_dns.dart';
import 'package:web_socket_channel/web_socket_channel.dart';
import '../models/approval.dart';
import '../models/pairing.dart';
import '../models/question.dart';
import '../models/session.dart';
import 'crypto_service.dart';
import 'notification_service.dart';

enum SyncConnectionStatus {
  disconnected,
  discovering,
  connecting,
  connected,
  authFailed,
}

class SyncClient extends ChangeNotifier {
  static final SyncClient instance = SyncClient._();
  SyncClient._();

  SyncConnectionStatus status = SyncConnectionStatus.disconnected;
  PairingConfig? pairedConfig;
  String? connectedDeviceName;
  String? connectionError;

  final Map<String, SessionItem> _sessions = {};
  List<SessionItem> get sessions => _sessions.values.toList();

  ApprovalRequest? pendingApproval;
  QuestionRequest? pendingQuestion;

  WebSocketChannel? _channel;
  StreamSubscription? _subscription;
  Timer? _reconnectTimer;
  Timer? _pingTimer;
  bool _manualDisconnect = false;

  Future<void> initialize() async {
    pairedConfig = await PairingConfig.load();
    if (pairedConfig != null) {
      connect(pairedConfig!);
    }
  }

  void connect(PairingConfig config) {
    _manualDisconnect = false;
    pairedConfig = config;
    PairingConfig.save(config);

    _reconnectTimer?.cancel();
    _subscription?.cancel();
    _channel?.sink.close();

    status = SyncConnectionStatus.connecting;
    connectionError = null;
    notifyListeners();

    try {
      final uri = Uri.parse(config.wsUrl);
      _channel = WebSocketChannel.connect(uri);

      _subscription = _channel!.stream.listen(
        _onMessageReceived,
        onDone: _onDisconnected,
        onError: (err) {
          connectionError = err.toString();
          _onDisconnected();
        },
        cancelOnError: true,
      );

      // Send Auth Handshake
      final authMsg = {
        'type': 'auth',
        'client_id': 'android-${Platform.localHostname}',
        'client_name': 'Android Companion',
        'secret': config.secret,
      };
      _channel!.sink.add(jsonEncode(authMsg));

      _startPingHeartbeat();
    } catch (e) {
      status = SyncConnectionStatus.disconnected;
      connectionError = e.toString();
      notifyListeners();
      _scheduleReconnect();
    }
  }

  void disconnect() {
    _manualDisconnect = true;
    _reconnectTimer?.cancel();
    _pingTimer?.cancel();
    _subscription?.cancel();
    _channel?.sink.close();
    _channel = null;

    status = SyncConnectionStatus.disconnected;
    pendingApproval = null;
    pendingQuestion = null;
    NotificationService.clearDynamicIsland();
    NotificationService.clearApprovalAlert();
    notifyListeners();
  }

  void unpair() {
    disconnect();
    pairedConfig = null;
    PairingConfig.clear();
    _sessions.clear();
    notifyListeners();
  }

  void _startPingHeartbeat() {
    _pingTimer?.cancel();
    _pingTimer = Timer.periodic(const Duration(seconds: 15), (_) {
      if (status == SyncConnectionStatus.connected && _channel != null) {
        final ping = {'type': 'ping', 'timestamp': DateTime.now().millisecondsSinceEpoch};
        _channel!.sink.add(jsonEncode(ping));
      }
    });
  }

  void _onDisconnected() {
    _pingTimer?.cancel();
    if (status != SyncConnectionStatus.authFailed) {
      status = SyncConnectionStatus.disconnected;
    }
    notifyListeners();
    if (!_manualDisconnect) {
      _scheduleReconnect();
    }
  }

  int _failedReconnects = 0;

  void _scheduleReconnect() {
    if (_manualDisconnect || pairedConfig == null) return;
    _reconnectTimer?.cancel();
    _reconnectTimer = Timer(const Duration(seconds: 4), () async {
      if (pairedConfig != null && status != SyncConnectionStatus.connected) {
        _failedReconnects++;
        if (_failedReconnects >= 3) {
          try {
            final found = await discoverViaMdns(timeout: const Duration(seconds: 2));
            for (final d in found) {
              if (d.deviceId == pairedConfig!.deviceId && d.ip != pairedConfig!.ip) {
                pairedConfig = PairingConfig(
                  ip: d.ip,
                  port: d.port,
                  secret: pairedConfig!.secret,
                  deviceId: pairedConfig!.deviceId,
                  deviceName: d.deviceName,
                  pairedAt: pairedConfig!.pairedAt,
                );
                await PairingConfig.save(pairedConfig!);
                _failedReconnects = 0;
                break;
              }
            }
          } catch (_) {}
        }
        connect(pairedConfig!);
      }
    });
  }

  Future<void> _onMessageReceived(dynamic raw) async {
    if (raw is! String) return;
    try {
      final map = jsonDecode(raw) as Map<String, dynamic>;
      final type = map['type'] as String?;

      switch (type) {
        case 'auth_ok':
          _failedReconnects = 0;
          status = SyncConnectionStatus.connected;
          connectedDeviceName = map['server_name'] as String? ?? 'Coucou Computer';
          connectionError = null;
          notifyListeners();
          break;

        case 'auth_error':
          status = SyncConnectionStatus.authFailed;
          connectionError = map['reason'] as String? ?? 'Authentication rejected';
          notifyListeners();
          break;

        case 'pong':
          // Heartbeat ack
          break;

        case 'encrypted':
          final iv = map['iv'] as String?;
          final payloadB64 = map['payload'] as String?;
          if (iv != null && payloadB64 != null && pairedConfig != null) {
            final decrypted = await CryptoService.decrypt(
              pairedConfig!.secret,
              iv,
              payloadB64,
            );
            final innerJson = jsonDecode(utf8.decode(decrypted)) as Map<String, dynamic>;
            _handleSyncPayload(innerJson);
          }
          break;

        default:
          break;
      }
    } catch (e) {
      debugPrint('[coucou sync] error handling message: $e');
    }
  }

  void _handleSyncPayload(Map<String, dynamic> payload) {
    final type = payload['type'] as String?;
    switch (type) {
      case 'sync_state':
        final rawSessions = payload['sessions'] as List<dynamic>? ?? [];
        _sessions.clear();
        for (final s in rawSessions) {
          final item = SessionItem.fromJson(s as Map<String, dynamic>);
          _sessions[item.id] = item;
        }

        if (payload['pending_approval'] != null) {
          pendingApproval = ApprovalRequest.fromJson(
            payload['pending_approval'] as Map<String, dynamic>,
          );
          NotificationService.showApprovalAlert(
            tool: pendingApproval!.tool,
            command: pendingApproval!.command,
            requestId: pendingApproval!.requestId,
          );
        } else {
          pendingApproval = null;
          NotificationService.clearApprovalAlert();
        }

        if (payload['pending_question'] != null) {
          pendingQuestion = QuestionRequest.fromJson(
            payload['pending_question'] as Map<String, dynamic>,
          );
        } else {
          pendingQuestion = null;
        }

        _syncDynamicIslandNotification();
        notifyListeners();
        break;

      case 'session_update':
        final item = SessionItem.fromJson(payload);
        _sessions[item.id] = item;
        _syncDynamicIslandNotification();
        notifyListeners();
        break;

      case 'approval_request':
        pendingApproval = ApprovalRequest.fromJson(payload);
        final sessId = pendingApproval!.sessionId;
        if (sessId.isNotEmpty && _sessions.containsKey(sessId)) {
          final old = _sessions[sessId]!;
          _sessions[sessId] = SessionItem(
            id: old.id,
            name: old.name,
            colorHex: old.colorHex,
            state: BotState.approval,
            stepIndex: old.stepIndex,
            steps: old.steps,
            needsApproval: true,
            approvalCommand: pendingApproval!.command,
            approvalFingerprint: pendingApproval!.fingerprint,
            cwd: old.cwd,
            updatedAt: DateTime.now(),
          );
        }
        NotificationService.showApprovalAlert(
          tool: pendingApproval!.tool,
          command: pendingApproval!.command,
          requestId: pendingApproval!.requestId,
        );
        _syncDynamicIslandNotification();
        notifyListeners();
        break;

      case 'approval_cleared':
        final reqId = payload['request_id'] as String?;
        if (pendingApproval?.requestId == reqId) {
          pendingApproval = null;
          NotificationService.clearApprovalAlert();
          for (final key in _sessions.keys) {
            final old = _sessions[key]!;
            if (old.approvalFingerprint == reqId || old.needsApproval) {
              _sessions[key] = SessionItem(
                id: old.id,
                name: old.name,
                colorHex: old.colorHex,
                state: old.state == BotState.approval ? BotState.working : old.state,
                stepIndex: old.stepIndex,
                steps: old.steps,
                needsApproval: false,
                approvalCommand: '',
                approvalFingerprint: '',
                cwd: old.cwd,
                updatedAt: DateTime.now(),
              );
            }
          }
          _syncDynamicIslandNotification();
          notifyListeners();
        }
        break;

      case 'question_request':
        pendingQuestion = QuestionRequest.fromJson(payload);
        notifyListeners();
        break;

      case 'question_cleared':
        final reqId = payload['request_id'] as String?;
        if (pendingQuestion?.requestId == reqId) {
          pendingQuestion = null;
          notifyListeners();
        }
        break;

      default:
        break;
    }
  }

  void _syncDynamicIslandNotification() {
    // Find active agent session
    final active = _sessions.values.firstWhere(
      (s) => s.state != BotState.idle,
      orElse: () => _sessions.values.isNotEmpty
          ? _sessions.values.first
          : SessionItem(
              id: 'none',
              name: 'Coucou',
              colorHex: '#22C55E',
              state: BotState.idle,
              stepIndex: 0,
              steps: [],
              needsApproval: false,
              approvalCommand: '',
              approvalFingerprint: '',
              updatedAt: DateTime.now(),
            ),
    );

    if (active.state == BotState.idle && _sessions.values.every((s) => s.state == BotState.idle)) {
      NotificationService.clearDynamicIsland();
    } else {
      NotificationService.updateDynamicIsland(
        agentName: active.pillName,
        status: active.state.label,
        step: active.currentStep,
        colorHex: active.colorHex,
      );
    }
  }

  Future<void> sendApprovalDecision({
    required String requestId,
    required String decision,
    required String fingerprint,
    required bool biometricVerified,
  }) async {
    if (_channel == null || pairedConfig == null) return;

    final payload = {
      'type': 'approval_decision',
      'request_id': requestId,
      'decision': decision,
      'fingerprint': fingerprint,
      'biometric_verified': biometricVerified,
    };

    final encrypted = await CryptoService.encrypt(
      pairedConfig!.secret,
      utf8.encode(jsonEncode(payload)),
    );

    final wire = {
      'type': 'encrypted',
      'iv': encrypted['iv'],
      'payload': encrypted['payload'],
    };

    _channel!.sink.add(jsonEncode(wire));

    // Keep pending approval visible for 1200ms so the user gets clear visual confirmation
    Future.delayed(const Duration(milliseconds: 1200), () {
      if (pendingApproval?.requestId == requestId) {
        pendingApproval = null;
        NotificationService.clearApprovalAlert();
        notifyListeners();
      }
    });

    // Save decision to local device history
    final log = DecisionLog(
      id: requestId,
      decision: Decision.fromString(decision),
      pillId: 'approval',
      summary: decision == 'allow' ? 'Allowed via Biometrics' : 'Denied',
      date: DateTime.now(),
    );
    await DecisionLog.addEntry(log);
  }

  Future<void> sendQuestionResponse({
    required String requestId,
    String? answer,
    List<String>? answers,
  }) async {
    if (_channel == null || pairedConfig == null) return;

    final payload = {
      'type': 'question_response',
      'request_id': requestId,
      'answer': answer,
      'answers': answers,
    };

    final encrypted = await CryptoService.encrypt(
      pairedConfig!.secret,
      utf8.encode(jsonEncode(payload)),
    );

    final wire = {
      'type': 'encrypted',
      'iv': encrypted['iv'],
      'payload': encrypted['payload'],
    };

    _channel!.sink.add(jsonEncode(wire));

    // Keep pending question visible for 1200ms for visual feedback
    Future.delayed(const Duration(milliseconds: 1200), () {
      if (pendingQuestion?.requestId == requestId) {
        pendingQuestion = null;
        notifyListeners();
      }
    });
  }

  /// Discovers Coucou Windows instances on the LAN via mDNS (_coucou._tcp).
  static Future<List<PairingConfig>> discoverViaMdns({Duration timeout = const Duration(seconds: 4)}) async {
    final results = <PairingConfig>[];
    final mdns = MDnsClient();
    try {
      await mdns.start();
      await for (final ptr in mdns.lookup<PtrResourceRecord>(
        ResourceRecordQuery.serverPointer('_coucou._tcp.local'),
      ).timeout(timeout, onTimeout: (sink) => sink.close())) {
        await for (final srv in mdns.lookup<SrvResourceRecord>(
          ResourceRecordQuery.service(ptr.domainName),
        )) {
          await for (final ip in mdns.lookup<IPAddressResourceRecord>(
            ResourceRecordQuery.addressIPv4(srv.target),
          )) {
            final config = PairingConfig(
              ip: ip.address.address,
              port: srv.port,
              secret: '',
              deviceId: srv.target,
              deviceName: ptr.domainName.split('.').first,
              pairedAt: DateTime.now(),
            );
            results.add(config);
          }
        }
      }
    } catch (_) {} finally {
      mdns.stop();
    }
    return results;
  }
}
