import 'package:flutter/material.dart';
import '../../../../core/constants/app_constants.dart';
import '../../../../core/theme/noctra_colors.dart';
import '../../../../domain/entities/ai_persona.dart';
import '../../../../domain/entities/ai_provider_config.dart';
import '../../../../domain/entities/conversation.dart';

class WelcomeHero extends StatelessWidget {
  final String welcomeMessage;
  final AiProviderConfig? activeProvider;
  final AiPersona? activePersona;
  final List<Conversation> recentConversations;
  final ValueChanged<String> onSelectPrompt;
  final ValueChanged<String> onSelectConversation;
  final VoidCallback onConfigureProvider;

  const WelcomeHero({
    super.key,
    required this.welcomeMessage,
    required this.activeProvider,
    required this.activePersona,
    required this.recentConversations,
    required this.onSelectPrompt,
    required this.onSelectConversation,
    required this.onConfigureProvider,
  });

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      padding: const EdgeInsets.fromLTRB(20, 24, 20, 32),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
        // Brand Identity Hero Card
        Center(
          child: Column(
            children: [
              Container(
                width: 64,
                height: 64,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  gradient: const LinearGradient(
                    colors: [
                      NoctraColors.electricViolet,
                      NoctraColors.cyanAccent,
                    ],
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                  ),
                  boxShadow: [
                    BoxShadow(
                      color: NoctraColors.electricViolet.withValues(alpha: 0.3),
                      blurRadius: 24,
                      spreadRadius: 2,
                    ),
                  ],
                ),
                child: Container(
                  margin: const EdgeInsets.all(2),
                  decoration: const BoxDecoration(
                    color: NoctraColors.backgroundDefault,
                    shape: BoxShape.circle,
                  ),
                  child: const Center(
                    child: Text(
                      'N',
                      style: TextStyle(
                        color: NoctraColors.electricViolet,
                        fontSize: 28,
                        fontWeight: FontWeight.w800,
                        letterSpacing: -1,
                      ),
                    ),
                  ),
                ),
              ),
              const SizedBox(height: 14),
              const Text(
                AppConstants.appName,
                style: TextStyle(
                  color: NoctraColors.textMain,
                  fontSize: 22,
                  fontWeight: FontWeight.w800,
                  letterSpacing: 1.5,
                ),
              ),
              const SizedBox(height: 4),
              const Text(
                AppConstants.appTagline,
                style: TextStyle(
                  color: NoctraColors.cyanAccent,
                  fontSize: 12.5,
                  fontWeight: FontWeight.w500,
                  letterSpacing: 0.3,
                ),
              ),
              const SizedBox(height: 22),
              Text(
                welcomeMessage,
                textAlign: TextAlign.center,
                style: Theme.of(context).textTheme.headlineMedium,
              ),
            ],
          ),
        ),
        const SizedBox(height: 24),

        // Provider Onboarding Card if none configured yet
        if (activeProvider == null) ...[
          Container(
            padding: const EdgeInsets.all(18),
            decoration: BoxDecoration(
              color: NoctraColors.cardBackground,
              borderRadius: BorderRadius.circular(18),
              border: Border.all(
                color: NoctraColors.electricViolet.withValues(alpha: 0.6),
                width: 1.2,
              ),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Row(
                  children: [
                    Icon(
                      Icons.shield_outlined,
                      color: NoctraColors.electricViolet,
                      size: 20,
                    ),
                    SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        'Connect Your Private AI Endpoint',
                        style: TextStyle(
                          color: NoctraColors.textMain,
                          fontSize: 15.5,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                const Text(
                  'NOCTRA AI requires no account and collects zero telemetry. Configure any OpenAI-compatible API endpoint (OpenAI, OpenRouter, Groq, Together, DeepSeek, or local Ollama / LM Studio) to begin.',
                  style: TextStyle(
                    color: NoctraColors.textSecondary,
                    fontSize: 13,
                    height: 1.45,
                  ),
                ),
                const SizedBox(height: 14),
                ElevatedButton.icon(
                  onPressed: onConfigureProvider,
                  icon: const Icon(Icons.key_rounded, size: 18),
                  label: const Text('Configure AI Provider'),
                ),
              ],
            ),
          ),
          const SizedBox(height: 24),
        ],

        // Suggested Prompts Section
        const Text(
          'SUGGESTED EXPLORATIONS',
          style: TextStyle(
            color: NoctraColors.textSecondary,
            fontSize: 11.5,
            fontWeight: FontWeight.w700,
            letterSpacing: 0.9,
          ),
        ),
        const SizedBox(height: 10),
        ...AppConstants.defaultSuggestedPrompts.map((item) {
          return Padding(
            padding: const EdgeInsets.only(bottom: 10),
            child: Material(
              color: NoctraColors.cardBackground,
              borderRadius: BorderRadius.circular(16),
              child: InkWell(
                onTap: () => onSelectPrompt(item['prompt']!),
                borderRadius: BorderRadius.circular(16),
                child: Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 16,
                    vertical: 14,
                  ),
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(16),
                    border: Border.all(color: NoctraColors.borderSubtle),
                  ),
                  child: Row(
                    children: [
                      Container(
                        width: 38,
                        height: 38,
                        decoration: BoxDecoration(
                          color: NoctraColors.electricVioletSoft,
                          borderRadius: BorderRadius.circular(11),
                        ),
                        child: Icon(
                          _iconForSuggested(item['icon']!),
                          color: NoctraColors.electricViolet,
                          size: 20,
                        ),
                      ),
                      const SizedBox(width: 14),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              item['title']!,
                              style: const TextStyle(
                                color: NoctraColors.textMain,
                                fontSize: 14.5,
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                            const SizedBox(height: 2),
                            Text(
                              item['subtitle']!,
                              style: const TextStyle(
                                color: NoctraColors.textSecondary,
                                fontSize: 12,
                              ),
                            ),
                          ],
                        ),
                      ),
                      const Icon(
                        Icons.north_west_rounded,
                        size: 16,
                        color: NoctraColors.textMuted,
                      ),
                    ],
                  ),
                ),
              ),
            ),
          );
        }),

        // Recent Conversations Section on Home Screen (Section 4)
        if (recentConversations.isNotEmpty) ...[
          const SizedBox(height: 18),
          const Text(
            'RECENT CONVERSATIONS',
            style: TextStyle(
              color: NoctraColors.textSecondary,
              fontSize: 11.5,
              fontWeight: FontWeight.w700,
              letterSpacing: 0.9,
            ),
          ),
          const SizedBox(height: 10),
          ...recentConversations.take(4).map((conv) {
            return Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: ListTile(
                tileColor: NoctraColors.cardBackground,
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(14),
                  side: const BorderSide(color: NoctraColors.borderSubtle),
                ),
                leading: Icon(
                  conv.isPinned
                      ? Icons.push_pin_rounded
                      : Icons.chat_bubble_outline_rounded,
                  size: 18,
                  color: conv.isPinned
                      ? NoctraColors.cyanAccent
                      : NoctraColors.textSecondary,
                ),
                title: Text(
                  conv.title,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    color: NoctraColors.textMain,
                    fontSize: 14,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                subtitle: conv.lastMessagePreview.isNotEmpty
                    ? Text(
                        conv.lastMessagePreview,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          color: NoctraColors.textSecondary,
                          fontSize: 12,
                        ),
                      )
                    : null,
                trailing: const Icon(
                  Icons.chevron_right_rounded,
                  color: NoctraColors.textMuted,
                ),
                onTap: () => onSelectConversation(conv.id),
              ),
            );
          }),
        ],
      ],
      ),
    );
  }

  IconData _iconForSuggested(String key) {
    switch (key) {
      case 'psychology':
        return Icons.psychology_rounded;
      case 'auto_awesome':
        return Icons.auto_awesome_rounded;
      case 'description':
        return Icons.description_rounded;
      case 'terminal':
        return Icons.terminal_rounded;
      case 'lightbulb':
      default:
        return Icons.lightbulb_outline_rounded;
    }
  }
}
