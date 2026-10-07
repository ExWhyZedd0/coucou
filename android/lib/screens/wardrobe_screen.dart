// Mochi Wardrobe screen for picking outfits on Android companion.

import 'package:flutter/material.dart';
import '../mochi/mochi_outfits.dart';
import '../mochi/mochi_widget.dart';

class WardrobeScreen extends StatefulWidget {
  final MochiOutfit currentOutfit;
  final ValueChanged<MochiOutfit> onOutfitChanged;

  const WardrobeScreen({
    super.key,
    required this.currentOutfit,
    required this.onOutfitChanged,
  });

  @override
  State<WardrobeScreen> createState() => _WardrobeScreenState();
}

class _WardrobeScreenState extends State<WardrobeScreen> {
  late MochiOutfit _selected;

  @override
  void initState() {
    super.initState();
    _selected = widget.currentOutfit;
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF0B0C0E),
      appBar: AppBar(
        backgroundColor: const Color(0xFF0B0C0E),
        elevation: 0,
        title: const Text('Mochi Wardrobe', style: TextStyle(color: Colors.white, fontSize: 16)),
      ),
      body: Column(
        children: [
          const SizedBox(height: 12),
          Center(
            child: MochiWidget(
              size: 150,
              outfit: _selected,
            ),
          ),
          const SizedBox(height: 20),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 20),
            child: Row(
              children: [
                Text(
                  '${_selected.emoji} ${_selected.label}',
                  style: const TextStyle(color: Colors.white, fontSize: 15, fontWeight: FontWeight.bold),
                ),
              ],
            ),
          ),
          const SizedBox(height: 10),
          Expanded(
            child: GridView.builder(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
              gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                crossAxisCount: 3,
                crossAxisSpacing: 10,
                mainAxisSpacing: 10,
                childAspectRatio: 1.1,
              ),
              itemCount: MochiOutfit.values.length,
              itemBuilder: (context, index) {
                final o = MochiOutfit.values[index];
                final isCurrent = o == _selected;
                return InkWell(
                  onTap: () {
                    setState(() => _selected = o);
                    widget.onOutfitChanged(o);
                  },
                  borderRadius: BorderRadius.circular(12),
                  child: Container(
                    decoration: BoxDecoration(
                      color: isCurrent
                          ? const Color(0xFF22C55E).withOpacity(0.18)
                          : const Color(0xFF14161B),
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(
                        color: isCurrent
                            ? const Color(0xFF22C55E)
                            : Colors.white.withOpacity(0.06),
                        width: isCurrent ? 2 : 1,
                      ),
                    ),
                    padding: const EdgeInsets.all(8),
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Text(o.emoji, style: const TextStyle(fontSize: 26)),
                        const SizedBox(height: 4),
                        Text(
                          o.label,
                          textAlign: TextAlign.center,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(
                            color: isCurrent ? const Color(0xFF22C55E) : Colors.white70,
                            fontSize: 11,
                            fontWeight: isCurrent ? FontWeight.bold : FontWeight.normal,
                          ),
                        ),
                      ],
                    ),
                  ),
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}
