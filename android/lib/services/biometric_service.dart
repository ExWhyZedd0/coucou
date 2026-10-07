// Biometrics service using local_auth for secure command approval.

import 'package:flutter/services.dart';
import 'package:local_auth/local_auth.dart';

class BiometricService {
  static final LocalAuthentication _auth = LocalAuthentication();

  /// Checks if the device has biometric hardware and enrolled biometrics or credentials.
  static Future<bool> canAuthenticate() async {
    try {
      final canCheck = await _auth.canCheckBiometrics;
      final isSupported = await _auth.isDeviceSupported();
      return canCheck || isSupported;
    } on PlatformException {
      return false;
    }
  }

  /// Prompts the user with Android Biometrics (Fingerprint / Face Unlock / PIN).
  /// Mirrors Apple's Face ID prompt in NotchBuddy. Never skipped for Allow.
  static Future<bool> authenticate({required String reason}) async {
    try {
      final available = await canAuthenticate();
      if (!available) {
        // In emulator or devices without lockscreen, allow fallback
        return true;
      }

      return await _auth.authenticate(
        localizedReason: reason,
        biometricOnly: false,
      );
    } on PlatformException catch (_) {
      return false;
    }
  }
}
