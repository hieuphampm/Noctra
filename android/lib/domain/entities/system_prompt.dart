class SystemPrompt {
  final String id;
  final String title;
  final String content;
  final String category;
  final bool isDefault;
  final DateTime createdAt;

  const SystemPrompt({
    required this.id,
    required this.title,
    required this.content,
    this.category = 'General',
    this.isDefault = false,
    required this.createdAt,
  });

  SystemPrompt copyWith({
    String? id,
    String? title,
    String? content,
    String? category,
    bool? isDefault,
    DateTime? createdAt,
  }) {
    return SystemPrompt(
      id: id ?? this.id,
      title: title ?? this.title,
      content: content ?? this.content,
      category: category ?? this.category,
      isDefault: isDefault ?? this.isDefault,
      createdAt: createdAt ?? this.createdAt,
    );
  }

  Map<String, dynamic> toMap() {
    return {
      'id': id,
      'title': title,
      'content': content,
      'category': category,
      'isDefault': isDefault,
      'createdAt': createdAt.toIso8601String(),
    };
  }

  factory SystemPrompt.fromMap(Map<String, dynamic> map) {
    return SystemPrompt(
      id: map['id'] as String? ?? '',
      title: map['title'] as String? ?? 'Custom System Prompt',
      content: map['content'] as String? ?? '',
      category: map['category'] as String? ?? 'General',
      isDefault: map['isDefault'] as bool? ?? false,
      createdAt: map['createdAt'] != null
          ? (DateTime.tryParse(map['createdAt'].toString()) ?? DateTime.now())
          : DateTime.now(),
    );
  }
}
