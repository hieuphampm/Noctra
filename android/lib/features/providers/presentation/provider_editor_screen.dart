import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:uuid/uuid.dart';
import '../../../core/providers/app_providers.dart';
import '../../../core/theme/noctra_colors.dart';
import '../../../core/utilities/url_validator.dart';
import '../../../domain/entities/ai_provider_config.dart';

class ProviderEditorScreen extends ConsumerStatefulWidget {
  final AiProviderConfig? existingProvider;

  const ProviderEditorScreen({
    super.key,
    this.existingProvider,
  });

  @override
  ConsumerState<ProviderEditorScreen> createState() =>
      _ProviderEditorScreenState();
}

class _ProviderEditorScreenState extends ConsumerState<ProviderEditorScreen> {
  static const _uuid = Uuid();
  final _formKey = GlobalKey<FormState>();

  late final TextEditingController _nameController;
  late final TextEditingController _baseUrlController;
  late final TextEditingController _apiKeyController;
  late final TextEditingController _modelController;
  late final TextEditingController _timeoutController;
  late final TextEditingController _maxTokensController;
  late final TextEditingController _systemPromptController;
  late final TextEditingController _customHeadersController;

  double _temperature = 0.7;
  double _topP = 1.0;
  bool _stream = true;
  bool _supportsVision = true;
  bool _allowInsecureHttp = false;
  bool _obscureApiKey = true;
  bool _isTesting = false;
  String? _testResultMessage;
  bool? _testSuccess;
  List<String> _discoveredModels = [];

  @override
  void initState() {
    super.initState();
    final existing = widget.existingProvider;
    _nameController = TextEditingController(text: existing?.name ?? '');
    _baseUrlController = TextEditingController(text: existing?.baseUrl ?? '');
    _apiKeyController = TextEditingController();
    _modelController = TextEditingController(text: existing?.modelName ?? '');
    _timeoutController = TextEditingController(
      text: (existing?.timeoutSeconds ?? 60).toString(),
    );
    _maxTokensController = TextEditingController(
      text: (existing?.maxTokens ?? 2048).toString(),
    );
    _systemPromptController = TextEditingController(
      text: existing?.defaultSystemPrompt ??
          'You are NOCTRA AI, a precise, thoughtful, and privacy-respecting assistant.',
    );

    final headersLines = <String>[];
    if (existing != null) {
      for (final e in existing.customHeaders.entries) {
        headersLines.add('${e.key}: ${e.value}');
      }
      _temperature = existing.temperature;
      _topP = existing.topP;
      _stream = existing.stream;
      _supportsVision = existing.supportsVision;
      _allowInsecureHttp = existing.allowInsecureHttp;
      _discoveredModels = List<String>.from(existing.discoveredModels);
      _loadExistingApiKey(existing.id);
    }
    _customHeadersController = TextEditingController(
      text: headersLines.join('\n'),
    );
  }

  Future<void> _loadExistingApiKey(String providerId) async {
    final key = await ref
        .read(providerRepositoryProvider)
        .getApiKeyForProvider(providerId);
    if (mounted && key != null) {
      setState(() {
        _apiKeyController.text = key;
      });
    }
  }

  @override
  void dispose() {
    _nameController.dispose();
    _baseUrlController.dispose();
    _apiKeyController.dispose();
    _modelController.dispose();
    _timeoutController.dispose();
    _maxTokensController.dispose();
    _systemPromptController.dispose();
    _customHeadersController.dispose();
    super.dispose();
  }

  void _applyQuickTemplate({
    required String name,
    required String baseUrl,
    required String sampleModel,
    bool insecureHttp = false,
  }) {
    setState(() {
      _nameController.text = name;
      _baseUrlController.text = baseUrl;
      if (_modelController.text.trim().isEmpty) {
        _modelController.text = sampleModel;
      }
      _allowInsecureHttp = insecureHttp;
    });
  }

  Map<String, String> _parseCustomHeaders() {
    final map = <String, String>{};
    final lines = _customHeadersController.text.split('\n');
    for (final line in lines) {
      final idx = line.indexOf(':');
      if (idx > 0) {
        final k = line.substring(0, idx).trim();
        final v = line.substring(idx + 1).trim();
        if (k.isNotEmpty && v.isNotEmpty) {
          map[k] = v;
        }
      }
    }
    return map;
  }

  AiProviderConfig _buildDraftConfig() {
    final existing = widget.existingProvider;
    return AiProviderConfig(
      id: existing?.id ?? _uuid.v4(),
      name: _nameController.text.trim().isEmpty
          ? 'Custom AI Provider'
          : _nameController.text.trim(),
      baseUrl: _baseUrlController.text.trim(),
      modelName: _modelController.text.trim(),
      discoveredModels: _discoveredModels,
      customHeaders: _parseCustomHeaders(),
      timeoutSeconds: int.tryParse(_timeoutController.text.trim()) ?? 60,
      temperature: _temperature,
      maxTokens: int.tryParse(_maxTokensController.text.trim()) ?? 2048,
      topP: _topP,
      stream: _stream,
      defaultSystemPrompt: _systemPromptController.text.trim(),
      supportsVision: _supportsVision,
      allowInsecureHttp: _allowInsecureHttp,
      connectionStatus: _testSuccess == true
          ? ProviderConnectionStatus.connected
          : (_testSuccess == false
              ? ProviderConnectionStatus.failed
              : (existing?.connectionStatus ??
                  ProviderConnectionStatus.untested)),
      createdAt: existing?.createdAt ?? DateTime.now(),
    );
  }

  Future<void> _testConnection() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() {
      _isTesting = true;
      _testResultMessage = null;
    });

    final draft = _buildDraftConfig();
    final result = await ref
        .read(providersNotifierProvider.notifier)
        .testProviderConnection(
          draft,
          overrideApiKey: _apiKeyController.text.trim(),
        );

    if (mounted) {
      setState(() {
        _isTesting = false;
        _testSuccess = result.success;
        _testResultMessage = result.message;
        if (result.discoveredModels.isNotEmpty) {
          _discoveredModels = result.discoveredModels;
          if (_modelController.text.trim().isEmpty) {
            _modelController.text = result.discoveredModels.first;
          }
        }
      });
    }
  }

  Future<void> _saveProvider() async {
    if (!_formKey.currentState!.validate()) return;
    final draft = _buildDraftConfig();
    await ref.read(providersNotifierProvider.notifier).saveProvider(
          config: draft,
          apiKey: _apiKeyController.text.trim(),
          makeActive: widget.existingProvider == null,
        );
    if (mounted) {
      Navigator.of(context).pop();
    }
  }

  @override
  Widget build(BuildContext context) {
    final urlValidation =
        UrlValidator.validateApiBaseUrl(_baseUrlController.text);

    return Scaffold(
      appBar: AppBar(
        title: Text(
          widget.existingProvider == null
              ? 'New AI Provider'
              : 'Edit AI Provider',
        ),
        actions: [
          TextButton.icon(
            onPressed: _saveProvider,
            icon: const Icon(Icons.check_rounded, size: 18),
            label: const Text('Save'),
          ),
        ],
      ),
      body: Form(
        key: _formKey,
        child: ListView(
          padding: const EdgeInsets.fromLTRB(18, 12, 18, 40),
          children: [
            // Quick-fill Templates for OpenAI-compatible endpoints
            const Text(
              'QUICK ENDPOINT TEMPLATES (OPTIONAL)',
              style: TextStyle(
                color: NoctraColors.textSecondary,
                fontSize: 11,
                fontWeight: FontWeight.w700,
                letterSpacing: 0.8,
              ),
            ),
            const SizedBox(height: 8),
            SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              child: Row(
                children: [
                  ActionChip(
                    label: const Text('OpenAI'),
                    onPressed: () => _applyQuickTemplate(
                      name: 'OpenAI',
                      baseUrl: 'https://api.openai.com/v1',
                      sampleModel: 'gpt-4o-mini',
                    ),
                  ),
                  const SizedBox(width: 8),
                  ActionChip(
                    label: const Text('OpenRouter'),
                    onPressed: () => _applyQuickTemplate(
                      name: 'OpenRouter',
                      baseUrl: 'https://openrouter.ai/api/v1',
                      sampleModel: 'anthropic/claude-3.5-sonnet',
                    ),
                  ),
                  const SizedBox(width: 8),
                  ActionChip(
                    label: const Text('Groq'),
                    onPressed: () => _applyQuickTemplate(
                      name: 'Groq Cloud',
                      baseUrl: 'https://api.groq.com/openai/v1',
                      sampleModel: 'llama-3.3-70b-versatile',
                    ),
                  ),
                  const SizedBox(width: 8),
                  ActionChip(
                    label: const Text('DeepSeek'),
                    onPressed: () => _applyQuickTemplate(
                      name: 'DeepSeek',
                      baseUrl: 'https://api.deepseek.com/v1',
                      sampleModel: 'deepseek-chat',
                    ),
                  ),
                  const SizedBox(width: 8),
                  ActionChip(
                    label: const Text('Local Ollama'),
                    onPressed: () => _applyQuickTemplate(
                      name: 'Local Ollama',
                      baseUrl: 'http://127.0.0.1:11434/v1',
                      sampleModel: 'llama3.2',
                      insecureHttp: true,
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 18),

            // 1. Provider Display Name
            TextFormField(
              controller: _nameController,
              decoration: const InputDecoration(
                labelText: 'Provider Display Name',
                hintText: 'e.g. My Private Endpoint',
                prefixIcon: Icon(Icons.badge_outlined, size: 19),
              ),
              validator: (v) => (v == null || v.trim().isEmpty)
                  ? 'Please enter a display name'
                  : null,
            ),
            const SizedBox(height: 14),

            // 2. API Base URL
            TextFormField(
              controller: _baseUrlController,
              keyboardType: TextInputType.url,
              onChanged: (_) => setState(() {}),
              decoration: const InputDecoration(
                labelText: 'API Base URL',
                hintText: 'https://api.example.com/v1',
                prefixIcon: Icon(Icons.link_rounded, size: 19),
              ),
              validator: (v) {
                final res = UrlValidator.validateApiBaseUrl(v ?? '');
                if (!res.isValid) return res.errorMessage;
                return null;
              },
            ),
            if (urlValidation.isInsecureHttp) ...[
              const SizedBox(height: 10),
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: NoctraColors.warningAmber.withValues(alpha: 0.14),
                  borderRadius: BorderRadius.circular(14),
                  border: Border.all(
                    color: NoctraColors.warningAmber.withValues(alpha: 0.5),
                  ),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Row(
                      children: [
                        Icon(
                          Icons.warning_amber_rounded,
                          color: NoctraColors.warningAmber,
                          size: 18,
                        ),
                        SizedBox(width: 8),
                        Expanded(
                          child: Text(
                            'Unencrypted HTTP Endpoint Detected',
                            style: TextStyle(
                              color: NoctraColors.warningAmber,
                              fontWeight: FontWeight.w700,
                              fontSize: 13,
                            ),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 4),
                    const Text(
                      'HTTP traffic is not encrypted. Only enable this for trusted local network servers (such as Ollama or LM Studio on LAN).',
                      style: TextStyle(
                        color: NoctraColors.textSecondary,
                        fontSize: 12,
                      ),
                    ),
                    SwitchListTile(
                      contentPadding: EdgeInsets.zero,
                      dense: true,
                      title: const Text('Allow Insecure HTTP for this Provider'),
                      value: _allowInsecureHttp,
                      onChanged: (v) => setState(() => _allowInsecureHttp = v),
                    ),
                  ],
                ),
              ),
            ],
            const SizedBox(height: 14),

            // 3. API Key (Stored in Flutter Secure Storage)
            TextFormField(
              controller: _apiKeyController,
              obscureText: _obscureApiKey,
              decoration: InputDecoration(
                labelText: 'API Key (Stored in Android Keystore)',
                hintText: 'sk-... (optional for local unauthenticated servers)',
                prefixIcon: const Icon(Icons.vpn_key_outlined, size: 19),
                suffixIcon: IconButton(
                  onPressed: () =>
                      setState(() => _obscureApiKey = !_obscureApiKey),
                  icon: Icon(
                    _obscureApiKey
                        ? Icons.visibility_outlined
                        : Icons.visibility_off_outlined,
                    size: 19,
                  ),
                ),
              ),
            ),
            const SizedBox(height: 14),

            // 4. Model Name + Fetch /models
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(
                  child: TextFormField(
                    controller: _modelController,
                    decoration: const InputDecoration(
                      labelText: 'Model Name',
                      hintText: 'e.g. gpt-4o, deepseek-chat, llama3.2',
                      prefixIcon: Icon(Icons.memory_rounded, size: 19),
                    ),
                    validator: (v) => (v == null || v.trim().isEmpty)
                        ? 'Enter a model name or click Test/Discover'
                        : null,
                  ),
                ),
                const SizedBox(width: 10),
                Padding(
                  padding: const EdgeInsets.only(top: 4),
                  child: OutlinedButton.icon(
                    onPressed: _isTesting ? null : _testConnection,
                    icon: _isTesting
                        ? const SizedBox(
                            width: 15,
                            height: 15,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          )
                        : const Icon(Icons.radar_rounded, size: 17),
                    label: const Text('Test & Fetch'),
                  ),
                ),
              ],
            ),

            if (_testResultMessage != null) ...[
              const SizedBox(height: 10),
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: (_testSuccess == true
                          ? NoctraColors.successGreen
                          : NoctraColors.errorCoral)
                      .withValues(alpha: 0.14),
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(
                    color: _testSuccess == true
                        ? NoctraColors.successGreen
                        : NoctraColors.errorCoral,
                  ),
                ),
                child: Text(
                  _testResultMessage!,
                  style: TextStyle(
                    color: _testSuccess == true
                        ? NoctraColors.successGreen
                        : NoctraColors.errorCoral,
                    fontSize: 12.5,
                  ),
                ),
              ),
            ],

            if (_discoveredModels.isNotEmpty) ...[
              const SizedBox(height: 10),
              const Text(
                'Available Models from GET /models (tap to select):',
                style: TextStyle(
                  color: NoctraColors.textSecondary,
                  fontSize: 12,
                ),
              ),
              const SizedBox(height: 6),
              ConstrainedBox(
                constraints: const BoxConstraints(maxHeight: 130),
                child: SingleChildScrollView(
                  child: Wrap(
                    spacing: 6,
                    runSpacing: 6,
                    children: _discoveredModels.map((m) {
                      return ActionChip(
                        label: Text(m, style: const TextStyle(fontSize: 11.5)),
                        onPressed: () {
                          setState(() {
                            _modelController.text = m;
                          });
                        },
                      );
                    }).toList(),
                  ),
                ),
              ),
            ],

            const SizedBox(height: 22),
            const Divider(),
            const SizedBox(height: 12),

            // 5. Model Parameters & Capabilities
            const Text(
              'MODEL PARAMETERS & CAPABILITIES',
              style: TextStyle(
                color: NoctraColors.textSecondary,
                fontSize: 11.5,
                fontWeight: FontWeight.w700,
                letterSpacing: 0.8,
              ),
            ),
            const SizedBox(height: 12),

            Text(
              'Temperature: ${_temperature.toStringAsFixed(2)}',
              style: const TextStyle(fontWeight: FontWeight.w600),
            ),
            Slider(
              value: _temperature,
              min: 0.0,
              max: 2.0,
              divisions: 40,
              onChanged: (v) => setState(() => _temperature = v),
            ),

            Text(
              'Top P: ${_topP.toStringAsFixed(2)}',
              style: const TextStyle(fontWeight: FontWeight.w600),
            ),
            Slider(
              value: _topP,
              min: 0.05,
              max: 1.0,
              divisions: 19,
              onChanged: (v) => setState(() => _topP = v),
            ),

            Row(
              children: [
                Expanded(
                  child: TextFormField(
                    controller: _maxTokensController,
                    keyboardType: TextInputType.number,
                    decoration: const InputDecoration(
                      labelText: 'Max Output Tokens',
                      hintText: '2048',
                    ),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: TextFormField(
                    controller: _timeoutController,
                    keyboardType: TextInputType.number,
                    decoration: const InputDecoration(
                      labelText: 'Timeout (seconds)',
                      hintText: '60',
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 10),

            SwitchListTile(
              contentPadding: EdgeInsets.zero,
              title: const Text('Streaming Mode (SSE)'),
              subtitle: const Text(
                'Stream tokens incrementally using Server-Sent Events',
              ),
              value: _stream,
              onChanged: (v) => setState(() => _stream = v),
            ),
            SwitchListTile(
              contentPadding: EdgeInsets.zero,
              title: const Text('Supports Vision (Image Attachments)'),
              subtitle: const Text(
                'Send attached images as OpenAI-compatible image_url blocks',
              ),
              value: _supportsVision,
              onChanged: (v) => setState(() => _supportsVision = v),
            ),

            const SizedBox(height: 14),
            TextFormField(
              controller: _systemPromptController,
              maxLines: 3,
              decoration: const InputDecoration(
                labelText: 'Default System Prompt',
                alignLabelWithHint: true,
              ),
            ),
            const SizedBox(height: 14),
            TextFormField(
              controller: _customHeadersController,
              maxLines: 3,
              decoration: const InputDecoration(
                labelText: 'Custom HTTP Headers (Optional, Key: Value per line)',
                hintText: 'HTTP-Referer: https://noctra.ai\nX-Title: NOCTRA AI',
                alignLabelWithHint: true,
              ),
            ),
            const SizedBox(height: 24),
            ElevatedButton.icon(
              onPressed: _saveProvider,
              icon: const Icon(Icons.save_rounded),
              label: const Text('Save Provider Configuration'),
            ),
          ],
        ),
      ),
    );
  }
}
