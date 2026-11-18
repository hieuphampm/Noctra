import 'dart:async';
import 'package:connectivity_plus/connectivity_plus.dart';

class NetworkMonitorService {
  Connectivity? _connectivity;

  NetworkMonitorService({Connectivity? connectivity}) {
    _connectivity = connectivity;
  }

  Connectivity get _instance => _connectivity ??= Connectivity();

  Future<bool> checkIsOnline() async {
    try {
      final results = await _instance.checkConnectivity();
      return _hasActiveConnection(results);
    } catch (_) {
      return true;
    }
  }

  Stream<bool> get onConnectivityChanged {
    return _instance.onConnectivityChanged.map(_hasActiveConnection);
  }

  bool _hasActiveConnection(List<ConnectivityResult> results) {
    if (results.isEmpty) return false;
    return results.any((r) => r != ConnectivityResult.none);
  }
}
