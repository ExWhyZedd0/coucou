import 'dart:convert';
import 'package:flutter_test/flutter_test.dart';
import 'package:coucou/services/crypto_service.dart';

void main() {
  group('CryptoService AES-256-GCM', () {
    test('Encrypt and Decrypt Round-trip', () async {
      const secret = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
      final original = utf8.encode('Hello from Coucou Android Companion!');

      final encrypted = await CryptoService.encrypt(secret, original);
      expect(encrypted['iv'], isNotNull);
      expect(encrypted['payload'], isNotNull);

      final decrypted = await CryptoService.decrypt(
        secret,
        encrypted['iv']!,
        encrypted['payload']!,
      );

      expect(utf8.decode(decrypted), 'Hello from Coucou Android Companion!');
    });

    test('Decryption with wrong secret fails', () async {
      const secret1 = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
      const secret2 = 'fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210';
      final original = utf8.encode('Sensitive Approval Command');

      final encrypted = await CryptoService.encrypt(secret1, original);

      expect(
        () async => await CryptoService.decrypt(
          secret2,
          encrypted['iv']!,
          encrypted['payload']!,
        ),
        throwsA(anything),
      );
    });

    test('Key parsing handles both 64-char hex and custom strings', () {
      const hex = '00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff';
      final k1 = CryptoService.parseKey(hex);
      expect(k1.length, 32);
      expect(k1[0], 0x00);
      expect(k1[1], 0x11);
      expect(k1[31], 0xff);

      final k2 = CryptoService.parseKey('short-secret');
      expect(k2.length, 32);
    });
  });
}
