import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';
import 'package:archive/archive.dart';
import 'package:path/path.dart' as p;
import 'package:syncfusion_flutter_pdf/pdf.dart';
import 'package:uuid/uuid.dart';
import 'package:xml/xml.dart';
import '../../core/constants/app_constants.dart';
import '../../domain/entities/attachment_item.dart';

class AttachmentProcessorService {
  static const _uuid = Uuid();

  /// Sanitizes file names to prevent path traversal or control characters (Section 14).
  static String sanitizeFileName(String rawName) {
    final base = p.basename(rawName);
    final cleaned = base
        .replaceAll(RegExp(r'[<>:"/\\|?*\x00-\x1F]'), '_')
        .trim();
    return cleaned.isEmpty ? 'attachment' : cleaned;
  }

  /// Processes a local file from path (or in-memory bytes) into an `AttachmentItem`.
  Future<AttachmentItem> processFile({
    required String filePath,
    String? originalFileName,
    Uint8List? preloadedBytes,
  }) async {
    final safeName = sanitizeFileName(originalFileName ?? p.basename(filePath));
    final ext = p.extension(safeName).replaceFirst('.', '').toLowerCase();

    Uint8List bytes;
    if (preloadedBytes != null) {
      bytes = preloadedBytes;
    } else {
      final file = File(filePath);
      if (!await file.exists()) {
        return AttachmentItem(
          id: _uuid.v4(),
          fileName: safeName,
          filePath: filePath,
          extension: ext,
          mimeType: _mimeTypeForExtension(ext),
          sizeBytes: 0,
          category: AttachmentCategory.unsupported,
          status: AttachmentProcessingStatus.error,
          statusMessage: 'File could not be read from device storage.',
        );
      }
      bytes = await file.readAsBytes();
    }

    final sizeBytes = bytes.length;
    if (sizeBytes > AppConstants.maxAttachmentSizeBytes) {
      return AttachmentItem(
        id: _uuid.v4(),
        fileName: safeName,
        filePath: filePath,
        extension: ext,
        mimeType: _mimeTypeForExtension(ext),
        sizeBytes: sizeBytes,
        category: AttachmentCategory.unsupported,
        status: AttachmentProcessingStatus.error,
        statusMessage: 'File exceeds the 25 MB maximum attachment limit.',
      );
    }

    // 1. Image formats: JPG, JPEG, PNG, WEBP
    if (AppConstants.supportedImageExtensions.contains(ext)) {
      if (sizeBytes > AppConstants.maxImageSizeBytes) {
        return AttachmentItem(
          id: _uuid.v4(),
          fileName: safeName,
          filePath: filePath,
          extension: ext,
          mimeType: _mimeTypeForExtension(ext),
          sizeBytes: sizeBytes,
          category: AttachmentCategory.image,
          status: AttachmentProcessingStatus.error,
          statusMessage: 'Image exceeds 12 MB limit for vision API encoding.',
        );
      }
      final mime = _mimeTypeForExtension(ext);
      final b64 = base64Encode(bytes);
      return AttachmentItem(
        id: _uuid.v4(),
        fileName: safeName,
        filePath: filePath,
        extension: ext,
        mimeType: mime,
        sizeBytes: sizeBytes,
        category: AttachmentCategory.image,
        status: AttachmentProcessingStatus.ready,
        base64DataUrl: 'data:$mime;base64,$b64',
        statusMessage: 'Ready for vision analysis',
      );
    }

    // 2. Plain text formats: TXT, MD, JSON, CSV
    if (const ['txt', 'md', 'json', 'csv'].contains(ext)) {
      final decodedText = utf8.decode(bytes, allowMalformed: true);
      final truncated = _truncateExtractedText(decodedText);
      return AttachmentItem(
        id: _uuid.v4(),
        fileName: safeName,
        filePath: filePath,
        extension: ext,
        mimeType: _mimeTypeForExtension(ext),
        sizeBytes: sizeBytes,
        category: AttachmentCategory.text,
        status: AttachmentProcessingStatus.ready,
        extractedText: truncated,
        statusMessage: 'Extracted ${truncated.length} chars locally',
      );
    }

    // 3. PDF documents: local text extraction using Syncfusion PDF
    if (ext == 'pdf') {
      try {
        final document = PdfDocument(inputBytes: bytes);
        final extractor = PdfTextExtractor(document);
        final rawText = extractor.extractText();
        document.dispose();

        if (rawText.trim().isEmpty) {
          return AttachmentItem(
            id: _uuid.v4(),
            fileName: safeName,
            filePath: filePath,
            extension: ext,
            mimeType: 'application/pdf',
            sizeBytes: sizeBytes,
            category: AttachmentCategory.pdf,
            status: AttachmentProcessingStatus.warning,
            extractedText:
                '[PDF "$safeName" contains scanned images or no selectable text layer.]',
            statusMessage:
                'No selectable text found in PDF (may be a scanned image PDF).',
          );
        }

        final truncated = _truncateExtractedText(rawText);
        return AttachmentItem(
          id: _uuid.v4(),
          fileName: safeName,
          filePath: filePath,
          extension: ext,
          mimeType: 'application/pdf',
          sizeBytes: sizeBytes,
          category: AttachmentCategory.pdf,
          status: AttachmentProcessingStatus.ready,
          extractedText: truncated,
          statusMessage: 'Extracted PDF text locally (${truncated.length} chars)',
        );
      } catch (e) {
        return AttachmentItem(
          id: _uuid.v4(),
          fileName: safeName,
          filePath: filePath,
          extension: ext,
          mimeType: 'application/pdf',
          sizeBytes: sizeBytes,
          category: AttachmentCategory.pdf,
          status: AttachmentProcessingStatus.error,
          statusMessage: 'Unable to parse PDF file locally.',
        );
      }
    }

    // 4. Office Open XML documents: DOCX, XLSX, PPTX
    if (const ['docx', 'xlsx', 'pptx'].contains(ext)) {
      try {
        final extracted = _extractOfficeOpenXmlText(bytes, ext);
        if (extracted.trim().isEmpty) {
          return AttachmentItem(
            id: _uuid.v4(),
            fileName: safeName,
            filePath: filePath,
            extension: ext,
            mimeType: _mimeTypeForExtension(ext),
            sizeBytes: sizeBytes,
            category: AttachmentCategory.officeDocument,
            status: AttachmentProcessingStatus.warning,
            extractedText: '[Document "$safeName" contained no extractable text.]',
            statusMessage: 'No text found inside ${ext.toUpperCase()} archive.',
          );
        }
        final truncated = _truncateExtractedText(extracted);
        return AttachmentItem(
          id: _uuid.v4(),
          fileName: safeName,
          filePath: filePath,
          extension: ext,
          mimeType: _mimeTypeForExtension(ext),
          sizeBytes: sizeBytes,
          category: AttachmentCategory.officeDocument,
          status: AttachmentProcessingStatus.ready,
          extractedText: truncated,
          statusMessage:
              'Extracted ${ext.toUpperCase()} text locally (${truncated.length} chars)',
        );
      } catch (_) {
        return AttachmentItem(
          id: _uuid.v4(),
          fileName: safeName,
          filePath: filePath,
          extension: ext,
          mimeType: _mimeTypeForExtension(ext),
          sizeBytes: sizeBytes,
          category: AttachmentCategory.officeDocument,
          status: AttachmentProcessingStatus.error,
          statusMessage: 'Failed to extract text from ${ext.toUpperCase()}.',
        );
      }
    }

    // 5. Unsupported format
    return AttachmentItem(
      id: _uuid.v4(),
      fileName: safeName,
      filePath: filePath,
      extension: ext,
      mimeType: _mimeTypeForExtension(ext),
      sizeBytes: sizeBytes,
      category: AttachmentCategory.unsupported,
      status: AttachmentProcessingStatus.error,
      statusMessage:
          'Unsupported format (.$ext). Supported: JPG, PNG, WEBP, PDF, TXT, MD, JSON, CSV, DOCX, XLSX, PPTX.',
    );
  }

  String _extractOfficeOpenXmlText(Uint8List bytes, String ext) {
    final archive = ZipDecoder().decodeBytes(bytes);
    final buffer = StringBuffer();

    if (ext == 'docx') {
      final docFile = archive.findFile('word/document.xml');
      if (docFile != null) {
        final xmlStr = utf8.decode(docFile.content as List<int>, allowMalformed: true);
        final doc = XmlDocument.parse(xmlStr);
        for (final pNode in doc.findAllElements('w:p')) {
          final line = pNode
              .findAllElements('w:t')
              .map((e) => e.innerText)
              .join();
          if (line.trim().isNotEmpty) {
            buffer.writeln(line);
          }
        }
      }
    } else if (ext == 'xlsx') {
      final sharedStrings = <String>[];
      final sharedFile = archive.findFile('xl/sharedStrings.xml');
      if (sharedFile != null) {
        final xmlStr =
            utf8.decode(sharedFile.content as List<int>, allowMalformed: true);
        final doc = XmlDocument.parse(xmlStr);
        for (final si in doc.findAllElements('si')) {
          final text =
              si.findAllElements('t').map((e) => e.innerText).join();
          sharedStrings.add(text);
        }
      }

      for (final file in archive.files) {
        if (file.name.startsWith('xl/worksheets/sheet') &&
            file.name.endsWith('.xml')) {
          final xmlStr =
              utf8.decode(file.content as List<int>, allowMalformed: true);
          final doc = XmlDocument.parse(xmlStr);
          for (final row in doc.findAllElements('row')) {
            final cells = <String>[];
            for (final c in row.findAllElements('c')) {
              final typeAttr = c.getAttribute('t');
              final vNode = c.findElements('v').firstOrNull;
              final inlineNode = c.findAllElements('t').firstOrNull;
              if (typeAttr == 's' && vNode != null) {
                final idx = int.tryParse(vNode.innerText);
                if (idx != null && idx >= 0 && idx < sharedStrings.length) {
                  cells.add(sharedStrings[idx]);
                }
              } else if (inlineNode != null) {
                cells.add(inlineNode.innerText);
              } else if (vNode != null) {
                cells.add(vNode.innerText);
              }
            }
            if (cells.isNotEmpty) {
              buffer.writeln(cells.join(' | '));
            }
          }
        }
      }
    } else if (ext == 'pptx') {
      final slideFiles = archive.files
          .where((f) =>
              f.name.startsWith('ppt/slides/slide') && f.name.endsWith('.xml'))
          .toList()
        ..sort((a, b) => a.name.compareTo(b.name));

      for (var i = 0; i < slideFiles.length; i++) {
        final file = slideFiles[i];
        final xmlStr =
            utf8.decode(file.content as List<int>, allowMalformed: true);
        final doc = XmlDocument.parse(xmlStr);
        final texts = doc
            .findAllElements('a:t')
            .map((e) => e.innerText.trim())
            .where((t) => t.isNotEmpty)
            .toList();
        if (texts.isNotEmpty) {
          buffer.writeln('[Slide ${i + 1}]');
          buffer.writeln(texts.join(' '));
          buffer.writeln();
        }
      }
    }

    return buffer.toString().trim();
  }

  String _truncateExtractedText(String text, {int maxChars = 64000}) {
    if (text.length <= maxChars) return text;
    return '${text.substring(0, maxChars)}\n\n[...Truncated at $maxChars characters for context efficiency...]';
  }

  String _mimeTypeForExtension(String ext) {
    switch (ext) {
      case 'jpg':
      case 'jpeg':
        return 'image/jpeg';
      case 'png':
        return 'image/png';
      case 'webp':
        return 'image/webp';
      case 'pdf':
        return 'application/pdf';
      case 'txt':
        return 'text/plain';
      case 'md':
        return 'text/markdown';
      case 'json':
        return 'application/json';
      case 'csv':
        return 'text/csv';
      case 'docx':
        return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
      case 'xlsx':
        return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      case 'pptx':
        return 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
      default:
        return 'application/octet-stream';
    }
  }
}
