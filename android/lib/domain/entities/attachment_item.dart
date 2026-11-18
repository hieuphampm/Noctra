enum AttachmentCategory {
  image,
  pdf,
  text,
  officeDocument,
  unsupported,
}

enum AttachmentProcessingStatus {
  processing,
  ready,
  warning,
  error,
}

class AttachmentItem {
  final String id;
  final String fileName;
  final String filePath;
  final String extension;
  final String mimeType;
  final int sizeBytes;
  final AttachmentCategory category;
  final AttachmentProcessingStatus status;
  final String? extractedText;
  final String? base64DataUrl;
  final String? statusMessage;

  const AttachmentItem({
    required this.id,
    required this.fileName,
    required this.filePath,
    required this.extension,
    required this.mimeType,
    required this.sizeBytes,
    required this.category,
    this.status = AttachmentProcessingStatus.ready,
    this.extractedText,
    this.base64DataUrl,
    this.statusMessage,
  });

  bool get isImage => category == AttachmentCategory.image;

  String get formattedSize {
    if (sizeBytes < 1024) return '$sizeBytes B';
    if (sizeBytes < 1024 * 1024) {
      return '${(sizeBytes / 1024).toStringAsFixed(1)} KB';
    }
    return '${(sizeBytes / (1024 * 1024)).toStringAsFixed(2)} MB';
  }

  AttachmentItem copyWith({
    String? id,
    String? fileName,
    String? filePath,
    String? extension,
    String? mimeType,
    int? sizeBytes,
    AttachmentCategory? category,
    AttachmentProcessingStatus? status,
    String? extractedText,
    String? base64DataUrl,
    String? statusMessage,
  }) {
    return AttachmentItem(
      id: id ?? this.id,
      fileName: fileName ?? this.fileName,
      filePath: filePath ?? this.filePath,
      extension: extension ?? this.extension,
      mimeType: mimeType ?? this.mimeType,
      sizeBytes: sizeBytes ?? this.sizeBytes,
      category: category ?? this.category,
      status: status ?? this.status,
      extractedText: extractedText ?? this.extractedText,
      base64DataUrl: base64DataUrl ?? this.base64DataUrl,
      statusMessage: statusMessage ?? this.statusMessage,
    );
  }

  Map<String, dynamic> toMap() {
    return {
      'id': id,
      'fileName': fileName,
      'filePath': filePath,
      'extension': extension,
      'mimeType': mimeType,
      'sizeBytes': sizeBytes,
      'category': category.name,
      'status': status.name,
      'extractedText': extractedText,
      'base64DataUrl': base64DataUrl,
      'statusMessage': statusMessage,
    };
  }

  factory AttachmentItem.fromMap(Map<String, dynamic> map) {
    final catName = map['category'] as String? ?? 'text';
    final statusName = map['status'] as String? ?? 'ready';
    return AttachmentItem(
      id: map['id'] as String? ?? '',
      fileName: map['fileName'] as String? ?? 'attachment',
      filePath: map['filePath'] as String? ?? '',
      extension: map['extension'] as String? ?? '',
      mimeType: map['mimeType'] as String? ?? 'application/octet-stream',
      sizeBytes: (map['sizeBytes'] as num?)?.toInt() ?? 0,
      category: AttachmentCategory.values.firstWhere(
        (e) => e.name == catName,
        orElse: () => AttachmentCategory.text,
      ),
      status: AttachmentProcessingStatus.values.firstWhere(
        (e) => e.name == statusName,
        orElse: () => AttachmentProcessingStatus.ready,
      ),
      extractedText: map['extractedText'] as String?,
      base64DataUrl: map['base64DataUrl'] as String?,
      statusMessage: map['statusMessage'] as String?,
    );
  }
}
