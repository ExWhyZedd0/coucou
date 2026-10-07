// Question card allowing user to answer agent questions from mobile.

import 'package:flutter/material.dart';
import '../models/question.dart';
import '../services/sync_client.dart';

class QuestionCard extends StatefulWidget {
  final QuestionRequest request;

  const QuestionCard({super.key, required this.request});

  @override
  State<QuestionCard> createState() => _QuestionCardState();
}

class _QuestionCardState extends State<QuestionCard> {
  final Set<String> _selectedOptions = {};
  final TextEditingController _customController = TextEditingController();
  bool _sending = false;
  bool _sent = false;

  @override
  void dispose() {
    _customController.dispose();
    super.dispose();
  }

  void _toggleOption(String label) {
    setState(() {
      if (widget.request.multiSelect) {
        if (_selectedOptions.contains(label)) {
          _selectedOptions.remove(label);
        } else {
          _selectedOptions.add(label);
        }
      } else {
        _selectedOptions.clear();
        _selectedOptions.add(label);
      }
    });
  }

  Future<void> _submit() async {
    setState(() => _sending = true);
    final custom = _customController.text.trim();
    if (custom.isNotEmpty) {
      _selectedOptions.add(custom);
    }

    try {
      if (widget.request.multiSelect) {
        await SyncClient.instance.sendQuestionResponse(
          requestId: widget.request.requestId,
          answers: _selectedOptions.toList(),
        );
      } else {
        await SyncClient.instance.sendQuestionResponse(
          requestId: widget.request.requestId,
          answer: _selectedOptions.isNotEmpty ? _selectedOptions.first : custom,
        );
      }
      if (mounted) {
        setState(() {
          _sending = false;
          _sent = true;
        });
      }
    } catch (_) {
      if (mounted) setState(() => _sending = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Container(
      decoration: BoxDecoration(
        color: const Color(0xFF16181D),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: const Color(0xFF06B6D4).withOpacity(0.65),
          width: 1.5,
        ),
      ),
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                decoration: BoxDecoration(
                  color: const Color(0xFF06B6D4).withOpacity(0.2),
                  borderRadius: BorderRadius.circular(6),
                ),
                child: Text(
                  widget.request.header.isNotEmpty
                      ? widget.request.header.toUpperCase()
                      : 'AGENT QUESTION',
                  style: const TextStyle(
                    color: Color(0xFF06B6D4),
                    fontSize: 11,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
              const Spacer(),
              if (widget.request.multiSelect)
                const Text(
                  'Multi-select',
                  style: TextStyle(color: Colors.white38, fontSize: 11),
                ),
            ],
          ),
          const SizedBox(height: 10),
          Text(
            widget.request.question,
            style: theme.textTheme.titleMedium?.copyWith(
              color: Colors.white,
              fontWeight: FontWeight.w600,
            ),
          ),
          const SizedBox(height: 12),
          if (_sent)
            const Row(
              children: [
                Icon(Icons.check_circle, color: Color(0xFF22C55E), size: 20),
                SizedBox(width: 8),
                Text(
                  'Answer sent to agent',
                  style: TextStyle(color: Color(0xFF22C55E), fontWeight: FontWeight.w600),
                ),
              ],
            )
          else ...[
            if (widget.request.options.isNotEmpty)
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: widget.request.options.map((opt) {
                  final isSelected = _selectedOptions.contains(opt.label);
                  return FilterChip(
                    label: Text(opt.label),
                    selected: isSelected,
                    onSelected: (_) => _toggleOption(opt.label),
                    selectedColor: const Color(0xFF06B6D4).withOpacity(0.25),
                    checkmarkColor: const Color(0xFF06B6D4),
                    labelStyle: TextStyle(
                      color: isSelected ? const Color(0xFF06B6D4) : Colors.white70,
                      fontWeight: isSelected ? FontWeight.w600 : FontWeight.normal,
                    ),
                    backgroundColor: const Color(0xFF0F1115),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(8),
                      side: BorderSide(
                        color: isSelected
                            ? const Color(0xFF06B6D4)
                            : Colors.white.withOpacity(0.08),
                      ),
                    ),
                  );
                }).toList(),
              ),
            const SizedBox(height: 10),
            TextField(
              controller: _customController,
              decoration: InputDecoration(
                hintText: 'Or type custom response…',
                hintStyle: const TextStyle(color: Colors.white24, fontSize: 13),
                filled: true,
                fillColor: const Color(0xFF0F1115),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(10),
                  borderSide: BorderSide(color: Colors.white.withOpacity(0.08)),
                ),
                contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
              ),
              style: const TextStyle(color: Colors.white, fontSize: 13),
            ),
            const SizedBox(height: 12),
            SizedBox(
              width: double.infinity,
              child: ElevatedButton(
                onPressed: _sending ? null : _submit,
                style: ElevatedButton.styleFrom(
                  backgroundColor: const Color(0xFF06B6D4),
                  foregroundColor: Colors.black,
                  padding: const EdgeInsets.symmetric(vertical: 12),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                ),
                child: _sending
                    ? const SizedBox(
                        height: 18,
                        width: 18,
                        child: CircularProgressIndicator(strokeWidth: 2, color: Colors.black),
                      )
                    : const Text('Send Answer', style: TextStyle(fontWeight: FontWeight.w700)),
              ),
            ),
          ],
        ],
      ),
    );
  }
}
