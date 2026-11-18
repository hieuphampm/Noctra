import 'dart:async';
import 'package:flutter/services.dart';

class TokenEstimator {
  TokenEstimator._();

  /// Heuristic token estimator (~4 characters per token for English/code mix)
  /// Used when the provider does not return usage metadata or for pre-send context estimation.
  static int estimateTokens(String text) {
    if (text.isEmpty) return 0;
    final words = text.trim().split(RegExp(r'\s+')).length;
    final charBased = (text.length / 3.8).ceil();
    final wordBased = (words * 1.35).ceil();
    return ((charBased + wordBased) / 2).ceil();
  }
}

class HapticsHelper {
  HapticsHelper._();

  static Future<void> lightImpact(bool enabled) async {
    if (!enabled) return;
    unawaited(HapticFeedback.lightImpact().catchError((_) {}));
  }

  static Future<void> mediumImpact(bool enabled) async {
    if (!enabled) return;
    unawaited(HapticFeedback.mediumImpact().catchError((_) {}));
  }

  static Future<void> selectionClick(bool enabled) async {
    if (!enabled) return;
    unawaited(HapticFeedback.selectionClick().catchError((_) {}));
  }
}
