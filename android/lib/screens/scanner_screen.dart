// QR Code scanner and manual pairing setup screen for Coucou Companion.

import 'package:flutter/material.dart';
import 'package:mobile_scanner/mobile_scanner.dart';
import '../models/pairing.dart';
import '../services/sync_client.dart';

class ScannerScreen extends StatefulWidget {
  const ScannerScreen({super.key});

  @override
  State<ScannerScreen> createState() => _ScannerScreenState();
}

class _ScannerScreenState extends State<ScannerScreen> {
  final MobileScannerController _cameraController = MobileScannerController();
  bool _detected = false;
  List<PairingConfig> _discoveredLan = [];
  bool _isDiscoveringLan = false;

  @override
  void initState() {
    super.initState();
    _startLanDiscovery();
  }

  Future<void> _startLanDiscovery() async {
    if (_isDiscoveringLan) return;
    setState(() => _isDiscoveringLan = true);
    try {
      final results = await SyncClient.discoverViaMdns(timeout: const Duration(seconds: 3));
      if (mounted) {
        setState(() {
          _discoveredLan = results;
          _isDiscoveringLan = false;
        });
      }
    } catch (_) {
      if (mounted) setState(() => _isDiscoveringLan = false);
    }
  }

  void _onDetect(BarcodeCapture capture) {
    if (_detected) return;
    for (final barcode in capture.barcodes) {
      final raw = barcode.rawValue;
      if (raw != null) {
        final config = PairingConfig.fromRawString(raw);
        if (config != null) {
          _detected = true;
          SyncClient.instance.connect(config);
          Navigator.of(context).pop(true);
          break;
        }
      }
    }
  }

  void _showManualDialog([PairingConfig? prefill]) {
    final ipCtrl = TextEditingController(text: prefill?.ip ?? '192.168.1.');
    final portCtrl = TextEditingController(text: prefill != null ? '${prefill.port}' : '7654');
    final secretCtrl = TextEditingController(text: prefill?.secret ?? '');

    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: const Color(0xFF14161B),
        title: const Text('Manual LAN Pairing', style: TextStyle(color: Colors.white, fontSize: 16)),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(
              controller: ipCtrl,
              decoration: const InputDecoration(labelText: 'Computer IP Address'),
              style: const TextStyle(color: Colors.white),
            ),
            TextField(
              controller: portCtrl,
              decoration: const InputDecoration(labelText: 'Port (default: 7654)'),
              keyboardType: TextInputType.number,
              style: const TextStyle(color: Colors.white),
            ),
            TextField(
              controller: secretCtrl,
              decoration: const InputDecoration(labelText: 'Secret Key (from Settings)'),
              style: const TextStyle(color: Colors.white),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(),
            child: const Text('Cancel'),
          ),
          ElevatedButton(
            onPressed: () {
              final ip = ipCtrl.text.trim();
              final port = int.tryParse(portCtrl.text.trim()) ?? 7654;
              final secret = secretCtrl.text.trim();
              if (ip.isNotEmpty && secret.isNotEmpty) {
                final cfg = PairingConfig(
                  ip: ip,
                  port: port,
                  secret: secret,
                  deviceId: 'manual-pc',
                  deviceName: 'Coucou PC',
                  pairedAt: DateTime.now(),
                );
                SyncClient.instance.connect(cfg);
                Navigator.of(ctx).pop();
                Navigator.of(context).pop(true);
              }
            },
            child: const Text('Connect'),
          ),
        ],
      ),
    );
  }

  @override
  void dispose() {
    _cameraController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      appBar: AppBar(
        backgroundColor: Colors.black,
        title: const Text('Scan Coucou QR Code', style: TextStyle(color: Colors.white, fontSize: 16)),
        actions: [
          IconButton(
            icon: const Icon(Icons.keyboard, color: Colors.white70),
            tooltip: 'Enter Manually',
            onPressed: _showManualDialog,
          ),
          IconButton(
            icon: const Icon(Icons.flash_on, color: Colors.white70),
            onPressed: () => _cameraController.toggleTorch(),
          ),
        ],
      ),
      body: Stack(
        children: [
          MobileScanner(
            controller: _cameraController,
            onDetect: _onDetect,
          ),
          Center(
            child: Container(
              width: 240,
              height: 240,
              decoration: BoxDecoration(
                border: Border.all(color: const Color(0xFF22C55E), width: 2.5),
                borderRadius: BorderRadius.circular(20),
              ),
            ),
          ),
          Positioned(
            bottom: 30,
            left: 16,
            right: 16,
            child: Column(
              children: [
                if (_discoveredLan.isNotEmpty) ...[
                  Container(
                    margin: const EdgeInsets.only(bottom: 12),
                    padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                    decoration: BoxDecoration(
                      color: const Color(0xFF14161B),
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(color: const Color(0xFF22C55E).withOpacity(0.5)),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            const Icon(Icons.wifi, color: Color(0xFF22C55E), size: 16),
                            const SizedBox(width: 6),
                            const Text(
                              'Discovered on LAN (mDNS):',
                              style: TextStyle(color: Colors.white70, fontSize: 12, fontWeight: FontWeight.w600),
                            ),
                            const Spacer(),
                            if (_isDiscoveringLan)
                              const SizedBox(
                                width: 12,
                                height: 12,
                                child: CircularProgressIndicator(strokeWidth: 2, color: Color(0xFF22C55E)),
                              ),
                          ],
                        ),
                        const SizedBox(height: 6),
                        ..._discoveredLan.map((d) => InkWell(
                          onTap: () => _showManualDialog(d),
                          child: Padding(
                            padding: const EdgeInsets.symmetric(vertical: 4),
                            child: Row(
                              children: [
                                Text(
                                  d.deviceName,
                                  style: const TextStyle(color: Colors.white, fontSize: 13, fontWeight: FontWeight.w500),
                                ),
                                const SizedBox(width: 6),
                                Text(
                                  '(${d.ip}:${d.port})',
                                  style: const TextStyle(color: Colors.white38, fontSize: 11),
                                ),
                                const Spacer(),
                                const Text(
                                  'Pair',
                                  style: TextStyle(color: Color(0xFF22C55E), fontSize: 12, fontWeight: FontWeight.bold),
                                ),
                              ],
                            ),
                          ),
                        )),
                      ],
                    ),
                  ),
                ],
                const Text(
                  'Point camera at the QR code in Coucou Settings on your computer',
                  textAlign: TextAlign.center,
                  style: TextStyle(color: Colors.white70, fontSize: 12.5),
                ),
                const SizedBox(height: 12),
                Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    OutlinedButton.icon(
                      onPressed: () => _showManualDialog(),
                      icon: const Icon(Icons.edit, size: 15),
                      label: const Text('Enter manually'),
                      style: OutlinedButton.styleFrom(
                        foregroundColor: Colors.white,
                        side: const BorderSide(color: Colors.white30),
                        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                      ),
                    ),
                    const SizedBox(width: 8),
                    IconButton(
                      icon: Icon(Icons.refresh, color: _isDiscoveringLan ? Colors.white38 : Colors.white70),
                      tooltip: 'Rediscover LAN',
                      onPressed: _isDiscoveringLan ? null : _startLanDiscovery,
                    ),
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
