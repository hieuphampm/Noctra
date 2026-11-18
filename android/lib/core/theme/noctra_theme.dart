import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'noctra_colors.dart';

class NoctraTheme {
  NoctraTheme._();

  static ThemeData buildTheme({
    required bool amoledMode,
    required double fontScale,
  }) {
    final bgPrimary = amoledMode
        ? NoctraColors.amoledBackgroundDefault
        : NoctraColors.backgroundDefault;
    final bgSecondary = amoledMode
        ? NoctraColors.amoledBackgroundSecondary
        : NoctraColors.backgroundSecondary;
    final cardBg = amoledMode
        ? NoctraColors.amoledCardBackground
        : NoctraColors.cardBackground;
    final elevatedBg = amoledMode
        ? NoctraColors.amoledElevatedSurface
        : NoctraColors.elevatedSurface;

    final colorScheme = ColorScheme.dark(
      primary: NoctraColors.electricViolet,
      onPrimary: const Color(0xFF090B10),
      primaryContainer: NoctraColors.userBubbleStart,
      onPrimaryContainer: NoctraColors.textMain,
      secondary: NoctraColors.cyanAccent,
      onSecondary: const Color(0xFF090B10),
      secondaryContainer: NoctraColors.cyanAccentSoft,
      onSecondaryContainer: NoctraColors.cyanAccent,
      surface: bgPrimary,
      onSurface: NoctraColors.textMain,
      surfaceContainerHighest: elevatedBg,
      surfaceContainer: cardBg,
      surfaceContainerLow: bgSecondary,
      error: NoctraColors.errorCoral,
      onError: const Color(0xFF090B10),
      outline: NoctraColors.borderSubtle,
      outlineVariant: NoctraColors.borderHighlight,
    );

    final baseTextTheme = ThemeData.dark().textTheme;

    return ThemeData(
      useMaterial3: true,
      brightness: Brightness.dark,
      scaffoldBackgroundColor: bgPrimary,
      canvasColor: bgSecondary,
      cardColor: cardBg,
      dividerColor: NoctraColors.borderSubtle,
      colorScheme: colorScheme,
      splashFactory: InkSparkle.splashFactory,
      appBarTheme: AppBarTheme(
        backgroundColor: bgPrimary.withValues(alpha: 0.94),
        foregroundColor: NoctraColors.textMain,
        elevation: 0,
        scrolledUnderElevation: 0,
        centerTitle: false,
        systemOverlayStyle: SystemUiOverlayStyle(
          statusBarColor: Colors.transparent,
          statusBarIconBrightness: Brightness.light,
          systemNavigationBarColor: bgPrimary,
          systemNavigationBarIconBrightness: Brightness.light,
        ),
        titleTextStyle: TextStyle(
          color: NoctraColors.textMain,
          fontSize: 18 * fontScale,
          fontWeight: FontWeight.w600,
          letterSpacing: -0.3,
        ),
      ),
      cardTheme: CardThemeData(
        color: cardBg,
        elevation: 0,
        margin: EdgeInsets.zero,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(18),
          side: const BorderSide(color: NoctraColors.borderSubtle, width: 1),
        ),
      ),
      dialogTheme: DialogThemeData(
        backgroundColor: cardBg,
        surfaceTintColor: Colors.transparent,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(22),
          side: const BorderSide(color: NoctraColors.borderHighlight, width: 1),
        ),
      ),
      bottomSheetTheme: BottomSheetThemeData(
        backgroundColor: bgSecondary,
        surfaceTintColor: Colors.transparent,
        modalBackgroundColor: bgSecondary,
        shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(22)),
          side: BorderSide(color: NoctraColors.borderSubtle, width: 1),
        ),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: cardBg,
        hintStyle: TextStyle(
          color: NoctraColors.textMuted,
          fontSize: 14.5 * fontScale,
        ),
        labelStyle: TextStyle(
          color: NoctraColors.textSecondary,
          fontSize: 14 * fontScale,
        ),
        contentPadding: const EdgeInsets.symmetric(
          horizontal: 16,
          vertical: 14,
        ),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(16),
          borderSide: const BorderSide(color: NoctraColors.borderSubtle),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(16),
          borderSide: const BorderSide(color: NoctraColors.borderSubtle),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(16),
          borderSide: const BorderSide(
            color: NoctraColors.electricViolet,
            width: 1.5,
          ),
        ),
        errorBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(16),
          borderSide: const BorderSide(color: NoctraColors.errorCoral),
        ),
      ),
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          backgroundColor: NoctraColors.electricViolet,
          foregroundColor: const Color(0xFF090B10),
          elevation: 0,
          padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(14),
          ),
          textStyle: TextStyle(
            fontSize: 14.5 * fontScale,
            fontWeight: FontWeight.w600,
            letterSpacing: 0.1,
          ),
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          foregroundColor: NoctraColors.textMain,
          side: const BorderSide(color: NoctraColors.borderHighlight),
          padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 13),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(14),
          ),
          textStyle: TextStyle(
            fontSize: 14 * fontScale,
            fontWeight: FontWeight.w500,
          ),
        ),
      ),
      chipTheme: ChipThemeData(
        backgroundColor: cardBg,
        selectedColor: NoctraColors.electricVioletSoft,
        side: const BorderSide(color: NoctraColors.borderSubtle),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(12),
        ),
        labelStyle: TextStyle(
          color: NoctraColors.textMain,
          fontSize: 13 * fontScale,
        ),
      ),
      snackBarTheme: SnackBarThemeData(
        backgroundColor: elevatedBg,
        contentTextStyle: TextStyle(
          color: NoctraColors.textMain,
          fontSize: 13.5 * fontScale,
        ),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(14),
          side: const BorderSide(color: NoctraColors.borderHighlight),
        ),
        behavior: SnackBarBehavior.floating,
      ),
      switchTheme: SwitchThemeData(
        thumbColor: WidgetStateProperty.resolveWith((states) {
          if (states.contains(WidgetState.selected)) {
            return const Color(0xFF090B10);
          }
          return NoctraColors.textSecondary;
        }),
        trackColor: WidgetStateProperty.resolveWith((states) {
          if (states.contains(WidgetState.selected)) {
            return NoctraColors.electricViolet;
          }
          return cardBg;
        }),
      ),
      textTheme: baseTextTheme.copyWith(
        headlineLarge: TextStyle(
          color: NoctraColors.textMain,
          fontSize: 28 * fontScale,
          fontWeight: FontWeight.w700,
          letterSpacing: -0.6,
          height: 1.25,
        ),
        headlineMedium: TextStyle(
          color: NoctraColors.textMain,
          fontSize: 22 * fontScale,
          fontWeight: FontWeight.w700,
          letterSpacing: -0.4,
          height: 1.3,
        ),
        titleLarge: TextStyle(
          color: NoctraColors.textMain,
          fontSize: 18 * fontScale,
          fontWeight: FontWeight.w600,
          letterSpacing: -0.2,
        ),
        titleMedium: TextStyle(
          color: NoctraColors.textMain,
          fontSize: 15.5 * fontScale,
          fontWeight: FontWeight.w600,
        ),
        bodyLarge: TextStyle(
          color: NoctraColors.textMain,
          fontSize: 15.5 * fontScale,
          height: 1.5,
        ),
        bodyMedium: TextStyle(
          color: NoctraColors.textMain,
          fontSize: 14 * fontScale,
          height: 1.48,
        ),
        bodySmall: TextStyle(
          color: NoctraColors.textSecondary,
          fontSize: 12.5 * fontScale,
          height: 1.4,
        ),
        labelLarge: TextStyle(
          color: NoctraColors.textMain,
          fontSize: 13.5 * fontScale,
          fontWeight: FontWeight.w600,
        ),
      ),
    );
  }
}
