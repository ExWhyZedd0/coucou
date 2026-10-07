// Question model for Coucou Android Companion (mirroring AskQuestion.swift).

class QuestionOption {
  final String label;
  final String description;

  QuestionOption({required this.label, required this.description});

  factory QuestionOption.fromJson(Map<String, dynamic> json) {
    return QuestionOption(
      label: json['label'] as String? ?? '',
      description: json['description'] as String? ?? '',
    );
  }

  Map<String, dynamic> toJson() => {
    'label': label,
    'description': description,
  };
}

class QuestionRequest {
  final String requestId;
  final String sessionId;
  final String question;
  final String header;
  final List<QuestionOption> options;
  final bool multiSelect;

  QuestionRequest({
    required this.requestId,
    required this.sessionId,
    required this.question,
    required this.header,
    required this.options,
    required this.multiSelect,
  });

  factory QuestionRequest.fromJson(Map<String, dynamic> json) {
    final rawOpts = json['options'] as List<dynamic>? ?? [];
    final opts = rawOpts
        .map((e) => QuestionOption.fromJson(e as Map<String, dynamic>))
        .toList();

    return QuestionRequest(
      requestId: json['request_id'] as String? ?? '',
      sessionId: json['session_id'] as String? ?? '',
      question: json['question'] as String? ?? '',
      header: json['header'] as String? ?? '',
      options: opts,
      multiSelect: json['multi_select'] as bool? ?? false,
    );
  }

  Map<String, dynamic> toJson() => {
    'request_id': requestId,
    'session_id': sessionId,
    'question': question,
    'header': header,
    'options': options.map((e) => e.toJson()).toList(),
    'multi_select': multiSelect,
  };
}
