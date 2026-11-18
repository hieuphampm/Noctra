class AiPersona {
  final String id;
  final String name;
  final String description;
  final String systemPrompt;
  final String iconKey;
  final double suggestedTemperature;
  final bool isBuiltIn;

  const AiPersona({
    required this.id,
    required this.name,
    required this.description,
    required this.systemPrompt,
    this.iconKey = 'auto_awesome',
    this.suggestedTemperature = 0.7,
    this.isBuiltIn = false,
  });

  AiPersona copyWith({
    String? id,
    String? name,
    String? description,
    String? systemPrompt,
    String? iconKey,
    double? suggestedTemperature,
    bool? isBuiltIn,
  }) {
    return AiPersona(
      id: id ?? this.id,
      name: name ?? this.name,
      description: description ?? this.description,
      systemPrompt: systemPrompt ?? this.systemPrompt,
      iconKey: iconKey ?? this.iconKey,
      suggestedTemperature: suggestedTemperature ?? this.suggestedTemperature,
      isBuiltIn: isBuiltIn ?? this.isBuiltIn,
    );
  }

  Map<String, dynamic> toMap() {
    return {
      'id': id,
      'name': name,
      'description': description,
      'systemPrompt': systemPrompt,
      'iconKey': iconKey,
      'suggestedTemperature': suggestedTemperature,
      'isBuiltIn': isBuiltIn,
    };
  }

  factory AiPersona.fromMap(Map<String, dynamic> map) {
    return AiPersona(
      id: map['id'] as String? ?? '',
      name: map['name'] as String? ?? 'Assistant',
      description: map['description'] as String? ?? '',
      systemPrompt: map['systemPrompt'] as String? ?? '',
      iconKey: map['iconKey'] as String? ?? 'auto_awesome',
      suggestedTemperature:
          (map['suggestedTemperature'] as num?)?.toDouble() ?? 0.7,
      isBuiltIn: map['isBuiltIn'] as bool? ?? false,
    );
  }

  static List<AiPersona> builtInPersonas() {
    return const [
      AiPersona(
        id: 'persona_general',
        name: 'General Assistant',
        description: 'Balanced, clear, and helpful across all everyday topics.',
        systemPrompt:
            'You are NOCTRA AI, a clear, accurate, and privacy-respecting general assistant. Provide structured, thoughtful answers.',
        iconKey: 'auto_awesome',
        suggestedTemperature: 0.7,
        isBuiltIn: true,
      ),
      AiPersona(
        id: 'persona_coding',
        name: 'Coding Assistant',
        description:
            'Senior software architect focused on clean, production-grade code.',
        systemPrompt:
            'You are an expert software engineer and systems architect. Write clean, modular, well-typed, and secure code. Explain edge cases, complexity, and architectural trade-offs concisely.',
        iconKey: 'terminal',
        suggestedTemperature: 0.2,
        isBuiltIn: true,
      ),
      AiPersona(
        id: 'persona_writing',
        name: 'Writing Assistant',
        description:
            'Refines clarity, tone, structure, and rhetorical impact.',
        systemPrompt:
            'You are an executive editor and writing specialist. Improve prose for clarity, rhythm, conciseness, and impact while preserving the author\'s authentic voice.',
        iconKey: 'edit_note',
        suggestedTemperature: 0.6,
        isBuiltIn: true,
      ),
      AiPersona(
        id: 'persona_research',
        name: 'Research Assistant',
        description:
            'Deep analytical synthesis, first-principles reasoning, and rigor.',
        systemPrompt:
            'You are a rigorous research analyst. Break down complex problems using first principles, distinguish established facts from hypotheses, highlight assumptions, and synthesize findings systematically.',
        iconKey: 'science',
        suggestedTemperature: 0.4,
        isBuiltIn: true,
      ),
      AiPersona(
        id: 'persona_translator',
        name: 'Translator',
        description:
            'Nuanced cross-lingual translation preserving idiom and register.',
        systemPrompt:
            'You are an expert polyglot translator. Translate text accurately while preserving cultural nuance, tone, and technical terminology. Offer brief notes on idioms or register when helpful.',
        iconKey: 'translate',
        suggestedTemperature: 0.3,
        isBuiltIn: true,
      ),
      AiPersona(
        id: 'persona_creative',
        name: 'Creative Writer',
        description:
            'Evocative storytelling, worldbuilding, and imaginative ideation.',
        systemPrompt:
            'You are an imaginative creative writer and storyteller. Craft vivid sensory imagery, compelling dialogue, and original narrative concepts with emotional resonance.',
        iconKey: 'palette',
        suggestedTemperature: 0.9,
        isBuiltIn: true,
      ),
    ];
  }
}
