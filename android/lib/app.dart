import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'core/constants/app_constants.dart';
import 'core/providers/app_providers.dart';
import 'core/theme/noctra_theme.dart';
import 'features/home/presentation/home_screen.dart';
import 'shared/widgets/biometric_lock_gate.dart';

class NoctraApp extends ConsumerWidget {
  const NoctraApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final settings = ref.watch(appSettingsProvider);

    return MaterialApp(
      title: AppConstants.appName,
      debugShowCheckedModeBanner: false,
      themeMode: ThemeMode.dark,
      darkTheme: NoctraTheme.buildTheme(
        amoledMode: settings.amoledMode,
        fontScale: settings.fontScale,
      ),
      theme: NoctraTheme.buildTheme(
        amoledMode: settings.amoledMode,
        fontScale: settings.fontScale,
      ),
      home: const BiometricLockGate(
        child: HomeScreen(),
      ),
    );
  }
}
