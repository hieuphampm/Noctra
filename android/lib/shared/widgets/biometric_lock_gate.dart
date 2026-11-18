import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/providers/app_providers.dart';
import '../../core/theme/noctra_colors.dart';

class BiometricLockGate extends ConsumerStatefulWidget {
  final Widget child;

  const BiometricLockGate({
    super.key,
    required this.child,
  });

  @override
  ConsumerState<BiometricLockGate> createState() => _BiometricLockGateState();
}

class _BiometricLockGateState extends ConsumerState<BiometricLockGate>
    with WidgetsBindingObserver {
  bool _isUnlocked = false;
  bool _isAuthenticating = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    final lockEnabled = ref.read(appSettingsProvider).biometricLockEnabled;
    if (!lockEnabled) return;
    if (state == AppLifecycleState.paused) {
      setState(() {
        _isUnlocked = false;
      });
    } else if (state == AppLifecycleState.resumed && !_isUnlocked) {
      _triggerUnlock();
    }
  }

  Future<void> _triggerUnlock() async {
    if (_isAuthenticating) return;
    setState(() {
      _isAuthenticating = true;
    });
    final ok = await ref.read(biometricAuthServiceProvider).authenticate(
          reason: 'Unlock NOCTRA AI Private Workspace',
        );
    if (mounted) {
      setState(() {
        _isUnlocked = ok;
        _isAuthenticating = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final lockEnabled = ref.watch(appSettingsProvider).biometricLockEnabled;
    if (!lockEnabled || _isUnlocked) {
      return widget.child;
    }

    return Scaffold(
      backgroundColor: NoctraColors.backgroundDefault,
      body: SafeArea(
        child: Center(
          child: Padding(
            padding: const EdgeInsets.all(32),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Container(
                  width: 76,
                  height: 76,
                  decoration: BoxDecoration(
                    color: NoctraColors.electricVioletSoft,
                    shape: BoxShape.circle,
                    border: Border.all(
                      color: NoctraColors.electricViolet,
                      width: 1.5,
                    ),
                  ),
                  child: const Icon(
                    Icons.fingerprint_rounded,
                    size: 40,
                    color: NoctraColors.electricViolet,
                  ),
                ),
                const SizedBox(height: 24),
                const Text(
                  'NOCTRA AI Locked',
                  style: TextStyle(
                    color: NoctraColors.textMain,
                    fontSize: 22,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                const SizedBox(height: 8),
                const Text(
                  'Private Intelligence. Your Own Space.\nAuthenticate to view your local conversations.',
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    color: NoctraColors.textSecondary,
                    fontSize: 14,
                  ),
                ),
                const SizedBox(height: 28),
                ElevatedButton.icon(
                  onPressed: _isAuthenticating ? null : _triggerUnlock,
                  icon: const Icon(Icons.lock_open_rounded, size: 18),
                  label: Text(
                    _isAuthenticating ? 'Verifying...' : 'Unlock Workspace',
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
