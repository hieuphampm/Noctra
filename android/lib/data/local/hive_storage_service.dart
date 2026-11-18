import 'dart:convert';
import 'package:hive_flutter/hive_flutter.dart';
import '../../core/constants/app_constants.dart';

class HiveStorageService {
  final bool inMemory;
  bool _initialized = false;

  final Map<String, Map<String, String>> _memoryStore = {
    AppConstants.conversationsBox: <String, String>{},
    AppConstants.messagesBox: <String, String>{},
    AppConstants.providersBox: <String, String>{},
    AppConstants.systemPromptsBox: <String, String>{},
    AppConstants.personasBox: <String, String>{},
    AppConstants.promptTemplatesBox: <String, String>{},
  };

  HiveStorageService({this.inMemory = false});

  Future<void> init({String? testPath}) async {
    if (_initialized) return;
    if (inMemory) {
      _initialized = true;
      return;
    }
    if (testPath != null) {
      Hive.init(testPath);
    } else {
      await Hive.initFlutter();
    }

    await Future.wait([
      Hive.openBox<String>(AppConstants.conversationsBox),
      Hive.openBox<String>(AppConstants.messagesBox),
      Hive.openBox<String>(AppConstants.providersBox),
      Hive.openBox<String>(AppConstants.systemPromptsBox),
      Hive.openBox<String>(AppConstants.personasBox),
      Hive.openBox<String>(AppConstants.promptTemplatesBox),
    ]);

    _initialized = true;
  }

  Box<String> get conversationsBox =>
      Hive.box<String>(AppConstants.conversationsBox);
  Box<String> get messagesBox => Hive.box<String>(AppConstants.messagesBox);
  Box<String> get providersBox => Hive.box<String>(AppConstants.providersBox);
  Box<String> get systemPromptsBox =>
      Hive.box<String>(AppConstants.systemPromptsBox);
  Box<String> get personasBox => Hive.box<String>(AppConstants.personasBox);
  Box<String> get promptTemplatesBox =>
      Hive.box<String>(AppConstants.promptTemplatesBox);

  Future<void> putRaw(String boxName, String key, String value) async {
    if (inMemory) {
      _memoryStore.putIfAbsent(boxName, () => <String, String>{})[key] = value;
      return;
    }
    await Hive.box<String>(boxName).put(key, value);
  }

  String? getRaw(String boxName, String key) {
    if (inMemory) {
      return _memoryStore[boxName]?[key];
    }
    return Hive.box<String>(boxName).get(key);
  }

  Future<void> deleteKey(String boxName, String key) async {
    if (inMemory) {
      _memoryStore[boxName]?.remove(key);
      return;
    }
    await Hive.box<String>(boxName).delete(key);
  }

  Future<void> clearBox(String boxName) async {
    if (inMemory) {
      _memoryStore[boxName]?.clear();
      return;
    }
    await Hive.box<String>(boxName).clear();
  }

  Future<void> putMapByName(
    String boxName,
    String key,
    Map<String, dynamic> data,
  ) async {
    await putRaw(boxName, key, jsonEncode(data));
  }

  Map<String, dynamic>? getMapByName(String boxName, String key) {
    final raw = getRaw(boxName, key);
    if (raw == null || raw.isEmpty) return null;
    try {
      final decoded = jsonDecode(raw);
      if (decoded is Map<String, dynamic>) return decoded;
      if (decoded is Map) return Map<String, dynamic>.from(decoded);
      return null;
    } catch (_) {
      return null;
    }
  }

  List<Map<String, dynamic>> getAllMapsByName(String boxName) {
    final Iterable<String> values = inMemory
        ? (_memoryStore[boxName]?.values ?? const <String>[])
        : Hive.box<String>(boxName).values;
    final results = <Map<String, dynamic>>[];
    for (final raw in values) {
      try {
        final decoded = jsonDecode(raw);
        if (decoded is Map<String, dynamic>) {
          results.add(decoded);
        } else if (decoded is Map) {
          results.add(Map<String, dynamic>.from(decoded));
        }
      } catch (_) {}
    }
    return results;
  }

  Future<void> putMap(
    Box<String> box,
    String key,
    Map<String, dynamic> data,
  ) async {
    await box.put(key, jsonEncode(data));
  }

  Map<String, dynamic>? getMap(Box<String> box, String key) {
    final raw = box.get(key);
    if (raw == null || raw.isEmpty) return null;
    try {
      final decoded = jsonDecode(raw);
      if (decoded is Map<String, dynamic>) return decoded;
      if (decoded is Map) return Map<String, dynamic>.from(decoded);
      return null;
    } catch (_) {
      return null;
    }
  }

  List<Map<String, dynamic>> getAllMaps(Box<String> box) {
    final results = <Map<String, dynamic>>[];
    for (final raw in box.values) {
      try {
        final decoded = jsonDecode(raw);
        if (decoded is Map<String, dynamic>) {
          results.add(decoded);
        } else if (decoded is Map) {
          results.add(Map<String, dynamic>.from(decoded));
        }
      } catch (_) {}
    }
    return results;
  }

  Future<void> clearAllBoxes() async {
    if (inMemory) {
      for (final map in _memoryStore.values) {
        map.clear();
      }
      return;
    }
    await Future.wait([
      conversationsBox.clear(),
      messagesBox.clear(),
      providersBox.clear(),
      systemPromptsBox.clear(),
      personasBox.clear(),
      promptTemplatesBox.clear(),
    ]);
  }

  Future<void> close() async {
    if (!inMemory) {
      await Hive.close();
    }
    _initialized = false;
  }
}
