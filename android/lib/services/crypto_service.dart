// AES-256-GCM End-to-End Encryption Service matching Coucou Windows Rust backend.

import 'dart:convert';
import 'dart:typed_data';
import 'package:cryptography/cryptography.dart';

class CryptoService {
  static final AesGcm _algorithm = AesGcm.with256bits();

  /// Converts a 64-char hex string to 32 bytes. Fallbacks to hashing/padding if different.
  static List<int> parseKey(String secret) {
    final clean = secret.trim();
    if (clean.length == 64) {
      try {
        final result = <int>[];
        for (var i = 0; i < clean.length; i += 2) {
          result.add(int.parse(clean.substring(i, i + 2), radix: 16));
        }
        if (result.length == 32) return result;
      } catch (_) {}
    }

    // Fallback: derive 32-byte key
    final utf = utf8.encode(clean);
    final key = List<int>.filled(32, 0);
    for (var i = 0; i < utf.length; i++) {
      key[i % 32] ^= utf[i];
    }
    return key;
  }

  /// Encrypts plaintext bytes with AES-256-GCM using the 32-byte secret key.
  /// Returns a Map with 'iv' (base64) and 'payload' (base64 of ciphertext + 16-byte tag).
  static Future<Map<String, String>> encrypt(String secret, List<int> plaintext) async {
    final keyBytes = parseKey(secret);
    final secretKey = SecretKey(keyBytes);

    final secretBox = await _algorithm.encrypt(
      plaintext,
      secretKey: secretKey,
    );

    final combined = Uint8List(secretBox.cipherText.length + secretBox.mac.bytes.length);
    combined.setRange(0, secretBox.cipherText.length, secretBox.cipherText);
    combined.setRange(
      secretBox.cipherText.length,
      combined.length,
      secretBox.mac.bytes,
    );

    return {
      'iv': base64Encode(secretBox.nonce),
      'payload': base64Encode(combined),
    };
  }

  /// Decrypts base64 iv and base64 payload (ciphertext + 16-byte tag) using AES-256-GCM.
  static Future<List<int>> decrypt(String secret, String ivB64, String payloadB64) async {
    final keyBytes = parseKey(secret);
    final secretKey = SecretKey(keyBytes);

    final iv = base64Decode(ivB64);
    final combined = base64Decode(payloadB64);

    if (combined.length < 16) {
      throw const FormatException('Payload too short for GCM authentication tag');
    }

    final cipherText = combined.sublist(0, combined.length - 16);
    final macBytes = combined.sublist(combined.length - 16);

    final secretBox = SecretBox(
      cipherText,
      nonce: iv,
      mac: Mac(macBytes),
    );

    return await _algorithm.decrypt(
      secretBox,
      secretKey: secretKey,
    );
  }
}
