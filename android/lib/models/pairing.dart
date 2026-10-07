// Pairing configuration and persistence for Coucou Android Companion.

import 'dart:convert';
import 'package:shared_preferences/shared_preferences.dart';

class PairingConfig {
  final String ip;
  final int port;
  final String secret;
  final String deviceId;
  final String deviceName;
  final DateTime pairedAt;

  PairingConfig({
    required this.ip,
    required this.port,
    required this.secret,
    required this.deviceId,
    required this.deviceName,
    required this.pairedAt,
  });

  String get wsUrl {
    final cleanIp = ip.trim();
    if (cleanIp.contains(':') && !cleanIp.startsWith('[')) {
      return 'ws://[$cleanIp]:$port';
    }
    return 'ws://$cleanIp:$port';
  }

  static PairingConfig? fromUri(Uri uri) {
    if (uri.scheme.toLowerCase() != 'coucou') return null;
    final hostLower = uri.host.toLowerCase();
    final pathLower = uri.path.toLowerCase();
    final isPairHost = hostLower == 'pair';
    final isPairPath = pathLower == 'pair' || pathLower.startsWith('/pair');
    if (!isPairHost && !isPairPath) return null;

    final params = uri.queryParameters;
    var ip = params['ip']?.trim();
    final portStr = params['port']?.trim();
    final secret = params['secret']?.trim();
    if (ip == null || ip.isEmpty || portStr == null || secret == null || secret.isEmpty) {
      return null;
    }

    if (ip.startsWith('[') && ip.endsWith(']')) {
      ip = ip.substring(1, ip.length - 1).trim();
    }

    final parsedPort = int.tryParse(portStr);
    if (parsedPort == null || parsedPort <= 0 || parsedPort > 65535) {
      return null;
    }

    final deviceId = (params['id']?.trim().isNotEmpty == true)
        ? params['id']!.trim()
        : 'win-unknown';
    final deviceName = (params['name']?.trim().isNotEmpty == true)
        ? params['name']!.trim()
        : 'Coucou Computer';

    return PairingConfig(
      ip: ip,
      port: parsedPort,
      secret: secret,
      deviceId: deviceId,
      deviceName: deviceName,
      pairedAt: DateTime.now(),
    );
  }

  static PairingConfig? fromRawString(String raw) {
    final clean = raw.trim();
    if (clean.isEmpty) return null;

    if (clean.startsWith('{')) {
      try {
        final decoded = jsonDecode(clean);
        if (decoded is Map<String, dynamic>) {
          return PairingConfig.fromJson(decoded);
        }
      } catch (_) {}
    }

    try {
      final uri = Uri.tryParse(clean);
      if (uri != null && uri.scheme.toLowerCase() == 'coucou') {
        return fromUri(uri);
      }
    } catch (_) {}

    return null;
  }

  factory PairingConfig.fromJson(Map<String, dynamic> json) {
    return PairingConfig(
      ip: json['ip'] as String? ?? '127.0.0.1',
      port: json['port'] as int? ?? 7654,
      secret: json['secret'] as String? ?? '',
      deviceId: json['device_id'] as String? ?? 'win-device',
      deviceName: json['device_name'] as String? ?? 'Coucou PC',
      pairedAt: DateTime.fromMillisecondsSinceEpoch(json['paired_at'] as int? ?? 0),
    );
  }

  Map<String, dynamic> toJson() => {
    'ip': ip,
    'port': port,
    'secret': secret,
    'device_id': deviceId,
    'device_name': deviceName,
    'paired_at': pairedAt.millisecondsSinceEpoch,
  };

  static const String _storageKey = 'coucou_paired_config';

  static Future<PairingConfig?> load() async {
    final prefs = await SharedPreferences.getInstance();
    final str = prefs.getString(_storageKey);
    if (str == null) return null;
    try {
      return PairingConfig.fromJson(jsonDecode(str) as Map<String, dynamic>);
    } catch (_) {
      return null;
    }
  }

  static Future<void> save(PairingConfig config) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_storageKey, jsonEncode(config.toJson()));
  }

  static Future<void> clear() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_storageKey);
  }
}
