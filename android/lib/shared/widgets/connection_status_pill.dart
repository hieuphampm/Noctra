import 'package:flutter/material.dart';
import '../../core/theme/noctra_colors.dart';
import '../../domain/entities/ai_provider_config.dart';

class ConnectionStatusPill extends StatelessWidget {
  final AiProviderConfig? provider;
  final String? modelOverride;
  final bool isOnline;
  final VoidCallback onTap;

  const ConnectionStatusPill({
    super.key,
    required this.provider,
    this.modelOverride,
    required this.isOnline,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final Color dotColor;
    final String label;
    final String sublabel;

    if (!isOnline) {
      dotColor = NoctraColors.warningAmber;
      label = 'Offline Mode';
      sublabel = provider?.modelName ?? 'Local History Only';
    } else if (provider == null) {
      dotColor = NoctraColors.cyanAccent;
      label = 'Configure AI Provider';
      sublabel = 'Tap to connect endpoint';
    } else {
      switch (provider!.connectionStatus) {
        case ProviderConnectionStatus.connected:
          dotColor = NoctraColors.successGreen;
          break;
        case ProviderConnectionStatus.failed:
          dotColor = NoctraColors.errorCoral;
          break;
        case ProviderConnectionStatus.untested:
          dotColor = NoctraColors.electricViolet;
          break;
      }
      label = (modelOverride != null && modelOverride!.trim().isNotEmpty)
          ? modelOverride!
          : (provider!.modelName.isNotEmpty
              ? provider!.modelName
              : provider!.name);
      sublabel = provider!.name;
    }

    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(20),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
          decoration: BoxDecoration(
            color: NoctraColors.cardBackground,
            borderRadius: BorderRadius.circular(20),
            border: Border.all(color: NoctraColors.borderHighlight, width: 1),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: 8,
                height: 8,
                decoration: BoxDecoration(
                  color: dotColor,
                  shape: BoxShape.circle,
                  boxShadow: [
                    BoxShadow(
                      color: dotColor.withValues(alpha: 0.55),
                      blurRadius: 6,
                      spreadRadius: 1,
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              Flexible(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      label,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        color: NoctraColors.textMain,
                        fontSize: 12.5,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    Text(
                      sublabel,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        color: NoctraColors.textSecondary,
                        fontSize: 10.5,
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 4),
              const Icon(
                Icons.keyboard_arrow_down_rounded,
                size: 16,
                color: NoctraColors.textSecondary,
              ),
            ],
          ),
        ),
      ),
    );
  }
}
