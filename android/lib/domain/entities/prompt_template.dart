class PromptTemplate {
  final String id;
  final String title;
  final String promptText;
  final String category;
  final DateTime createdAt;

  const PromptTemplate({
    required this.id,
    required this.title,
    required this.promptText,
    this.category = 'General',
    required this.createdAt,
  });

  PromptTemplate copyWith({
    String? id,
    String? title,
    String? promptText,
    String? category,
    DateTime? createdAt,
  }) {
    return PromptTemplate(
      id: id ?? this.id,
      title: title ?? this.title,
      promptText: promptText ?? this.promptText,
      category: category ?? this.category,
      createdAt: createdAt ?? this.createdAt,
    );
  }

  Map<String, dynamic> toMap() {
    return {
      'id': id,
      'title': title,
      'promptText': promptText,
      'category': category,
      'createdAt': createdAt.toIso8601String(),
    };
  }

  factory PromptTemplate.fromMap(Map<String, dynamic> map) {
    return PromptTemplate(
      id: map['id'] as String? ?? '',
      title: map['title'] as String? ?? 'Template',
      promptText: map['promptText'] as String? ?? '',
      category: map['category'] as String? ?? 'General',
      createdAt: map['createdAt'] != null
          ? (DateTime.tryParse(map['createdAt'].toString()) ?? DateTime.now())
          : DateTime.now(),
    );
  }

  static List<PromptTemplate> defaultTemplates() {
    final now = DateTime.now();
    return [
      PromptTemplate(
        id: 'tpl_code_review',
        title: 'Security & Code Audit',
        category: 'Coding',
        promptText:
            'Review the following code for security vulnerabilities, race conditions, performance bottlenecks, and maintainability. Provide concrete fixes:\n\n```\n\n```',
        createdAt: now,
      ),
      PromptTemplate(
        id: 'tpl_exec_summary',
        title: 'Executive Briefing',
        category: 'Analysis',
        promptText:
            'Synthesize the following text into an executive briefing with: 1) Core Thesis, 2) Key Evidence, 3) Strategic Risks, and 4) Recommended Next Steps:\n\n',
        createdAt: now,
      ),
      PromptTemplate(
        id: 'tpl_first_principles',
        title: 'First-Principles Breakdown',
        category: 'Research',
        promptText:
            'Deconstruct the following topic from first principles. Identify the fundamental truths, challenge conventional assumptions, and rebuild a clear mental model:\n\nTopic: ',
        createdAt: now,
      ),
      PromptTemplate(
        id: 'tpl_polish_prose',
        title: 'Polish & Tighten Prose',
        category: 'Writing',
        promptText:
            'Rewrite the following draft to be crisp, persuasive, and free of fluff. Provide two versions: one concise professional version and one bold executive version:\n\n',
        createdAt: now,
      ),
    ];
  }
}
