import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';
import '../../core/constants/app_constants.dart';
import '../../core/providers/app_providers.dart';
import '../../core/theme/noctra_colors.dart';
import '../../features/chat/presentation/chat_controller.dart';

class AttachmentPickerSheet extends ConsumerStatefulWidget {
  const AttachmentPickerSheet({super.key});

  @override
  ConsumerState<AttachmentPickerSheet> createState() =>
      _AttachmentPickerSheetState();
}

class _AttachmentPickerSheetState extends ConsumerState<AttachmentPickerSheet> {
  final ImagePicker _imagePicker = ImagePicker();
  bool _isProcessing = false;

  Future<void> _pickImage(ImageSource source) async {
    setState(() => _isProcessing = true);
    try {
      final picked = await _imagePicker.pickImage(
        source: source,
        imageQuality: 88,
      );
      if (picked == null) {
        if (mounted) setState(() => _isProcessing = false);
        return;
      }

      final bytes = await picked.readAsBytes();
      final processor = ref.read(attachmentProcessorProvider);
      final item = await processor.processFile(
        filePath: picked.path,
        originalFileName: picked.name,
        preloadedBytes: bytes,
      );

      ref.read(chatControllerProvider.notifier).addStagedAttachment(item);
      if (mounted) Navigator.of(context).pop();
    } catch (e) {
      if (mounted) {
        setState(() => _isProcessing = false);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Could not attach image: $e')),
        );
      }
    }
  }

  Future<void> _pickDocuments() async {
    setState(() => _isProcessing = true);
    try {
      final files = await FilePicker.pickFiles(
        type: FileType.custom,
        allowedExtensions: AppConstants.allSupportedExtensions,
      );

      if (files.isEmpty) {
        if (mounted) setState(() => _isProcessing = false);
        return;
      }

      final processor = ref.read(attachmentProcessorProvider);
      for (final file in files) {
        final bytes = await file.readAsBytes();
        final item = await processor.processFile(
          filePath: file.path ?? file.name,
          originalFileName: file.name,
          preloadedBytes: bytes,
        );
        ref.read(chatControllerProvider.notifier).addStagedAttachment(item);
      }

      if (mounted) Navigator.of(context).pop();
    } catch (e) {
      if (mounted) {
        setState(() => _isProcessing = false);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('File selection failed: $e')),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final activeProvider = ref.watch(activeProviderConfigProvider);
    final visionSupported = activeProvider?.supportsVision ?? true;

    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(20, 12, 20, 24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Center(
              child: Container(
                width: 40,
                height: 4,
                decoration: BoxDecoration(
                  color: NoctraColors.borderHighlight,
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
            ),
            const SizedBox(height: 16),
            const Text(
              'Attach to Message',
              style: TextStyle(
                color: NoctraColors.textMain,
                fontSize: 18,
                fontWeight: FontWeight.w700,
              ),
            ),
            const SizedBox(height: 4),
            const Text(
              'Files are processed locally on your device and sent only to your active AI provider.',
              style: TextStyle(
                color: NoctraColors.textSecondary,
                fontSize: 12.5,
              ),
            ),
            if (!visionSupported) ...[
              const SizedBox(height: 10),
              Container(
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(
                  color: NoctraColors.warningAmber.withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(
                    color: NoctraColors.warningAmber.withValues(alpha: 0.4),
                  ),
                ),
                child: const Row(
                  children: [
                    Icon(
                      Icons.warning_amber_rounded,
                      color: NoctraColors.warningAmber,
                      size: 18,
                    ),
                    SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        'Your active provider has Vision disabled. Attached images will be skipped unless you enable Vision or switch models.',
                        style: TextStyle(
                          color: NoctraColors.warningAmber,
                          fontSize: 12,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ],
            const SizedBox(height: 16),
            if (_isProcessing)
              const Padding(
                padding: EdgeInsets.symmetric(vertical: 28),
                child: Center(
                  child: Column(
                    children: [
                      CircularProgressIndicator(),
                      SizedBox(height: 12),
                      Text(
                        'Processing attachment locally...',
                        style: TextStyle(color: NoctraColors.textSecondary),
                      ),
                    ],
                  ),
                ),
              )
            else ...[
              _buildOptionTile(
                icon: Icons.photo_library_rounded,
                title: 'Photo Gallery',
                subtitle: 'JPG, JPEG, PNG, WEBP images',
                accent: NoctraColors.electricViolet,
                onTap: () => _pickImage(ImageSource.gallery),
              ),
              const SizedBox(height: 10),
              _buildOptionTile(
                icon: Icons.photo_camera_rounded,
                title: 'Capture Photo',
                subtitle: 'Take a picture using your camera',
                accent: NoctraColors.cyanAccent,
                onTap: () => _pickImage(ImageSource.camera),
              ),
              const SizedBox(height: 10),
              _buildOptionTile(
                icon: Icons.description_rounded,
                title: 'Document or Data File',
                subtitle:
                    'PDF, TXT, MD, JSON, CSV, DOCX, XLSX, PPTX (local text extraction)',
                accent: NoctraColors.successGreen,
                onTap: _pickDocuments,
              ),
            ],
          ],
        ),
      ),
    );
  }

  Widget _buildOptionTile({
    required IconData icon,
    required String title,
    required String subtitle,
    required Color accent,
    required VoidCallback onTap,
  }) {
    return Material(
      color: NoctraColors.cardBackground,
      borderRadius: BorderRadius.circular(16),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(16),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: NoctraColors.borderSubtle),
          ),
          child: Row(
            children: [
              Container(
                width: 42,
                height: 42,
                decoration: BoxDecoration(
                  color: accent.withValues(alpha: 0.15),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Icon(icon, color: accent, size: 22),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      title,
                      style: const TextStyle(
                        color: NoctraColors.textMain,
                        fontSize: 15,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      subtitle,
                      style: const TextStyle(
                        color: NoctraColors.textSecondary,
                        fontSize: 12,
                      ),
                    ),
                  ],
                ),
              ),
              const Icon(
                Icons.chevron_right_rounded,
                color: NoctraColors.textSecondary,
              ),
            ],
          ),
        ),
      ),
    );
  }
}
