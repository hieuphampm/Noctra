import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_highlight/flutter_highlight.dart';
import 'package:flutter_highlight/themes/atom-one-dark.dart';
import 'package:flutter_markdown/flutter_markdown.dart';
import 'package:flutter_math_fork/flutter_math.dart';
import 'package:markdown/markdown.dart' as md;
import '../../core/theme/noctra_colors.dart';

class MarkdownMessageView extends StatelessWidget {
  final String content;
  final bool renderMarkdown;
  final double fontScale;

  const MarkdownMessageView({
    super.key,
    required this.content,
    required this.renderMarkdown,
    required this.fontScale,
  });

  @override
  Widget build(BuildContext context) {
    if (!renderMarkdown) {
      return SelectableText(
        content,
        style: TextStyle(
          color: NoctraColors.textMain,
          fontSize: 14.5 * fontScale,
          height: 1.5,
        ),
      );
    }

    // Split display LaTeX blocks ($$...$$) so they can render cleanly with Math.tex
    final segments = _splitDisplayMathSegments(content);
    if (segments.length == 1 && !segments.first.isMath) {
      return _buildMarkdownSegment(context, content);
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: segments.map((seg) {
        if (seg.isMath) {
          return Padding(
            padding: const EdgeInsets.symmetric(vertical: 8),
            child: SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              child: Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                decoration: BoxDecoration(
                  color: const Color(0xFF0C0E14),
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: NoctraColors.borderSubtle),
                ),
                child: Math.tex(
                  seg.text,
                  mathStyle: MathStyle.display,
                  textStyle: TextStyle(
                    color: NoctraColors.cyanAccent,
                    fontSize: 15 * fontScale,
                  ),
                  onErrorFallback: (err) => SelectableText(
                    seg.text,
                    style: TextStyle(
                      color: NoctraColors.cyanAccent,
                      fontFamily: 'monospace',
                      fontSize: 13 * fontScale,
                    ),
                  ),
                ),
              ),
            ),
          );
        }
        return _buildMarkdownSegment(context, seg.text);
      }).toList(),
    );
  }

  Widget _buildMarkdownSegment(BuildContext context, String markdownText) {
    return MarkdownBody(
      data: markdownText,
      selectable: true,
      extensionSet: md.ExtensionSet.gitHubFlavored,
      builders: {
        'pre': _CodeBlockBuilder(fontScale: fontScale),
      },
      styleSheet: MarkdownStyleSheet(
        p: TextStyle(
          color: NoctraColors.textMain,
          fontSize: 14.5 * fontScale,
          height: 1.52,
        ),
        h1: TextStyle(
          color: NoctraColors.textMain,
          fontSize: 21 * fontScale,
          fontWeight: FontWeight.w700,
          height: 1.35,
        ),
        h2: TextStyle(
          color: NoctraColors.textMain,
          fontSize: 18.5 * fontScale,
          fontWeight: FontWeight.w700,
          height: 1.35,
        ),
        h3: TextStyle(
          color: NoctraColors.textMain,
          fontSize: 16.5 * fontScale,
          fontWeight: FontWeight.w600,
          height: 1.35,
        ),
        code: TextStyle(
          color: NoctraColors.cyanAccent,
          backgroundColor: const Color(0xFF0E121B),
          fontFamily: 'monospace',
          fontSize: 13 * fontScale,
        ),
        blockquote: TextStyle(
          color: NoctraColors.textSecondary,
          fontSize: 14 * fontScale,
          fontStyle: FontStyle.italic,
        ),
        blockquoteDecoration: BoxDecoration(
          color: NoctraColors.electricVioletSoft.withValues(alpha: 0.12),
          borderRadius: BorderRadius.circular(10),
          border: const Border(
            left: BorderSide(color: NoctraColors.electricViolet, width: 3),
          ),
        ),
        blockquotePadding: const EdgeInsets.symmetric(
          horizontal: 14,
          vertical: 10,
        ),
        tableHead: TextStyle(
          color: NoctraColors.textMain,
          fontWeight: FontWeight.w600,
          fontSize: 13 * fontScale,
        ),
        tableBody: TextStyle(
          color: NoctraColors.textMain,
          fontSize: 13 * fontScale,
        ),
        tableBorder: TableBorder.all(
          color: NoctraColors.borderHighlight,
          width: 1,
          borderRadius: BorderRadius.circular(8),
        ),
        tableCellsPadding: const EdgeInsets.symmetric(
          horizontal: 10,
          vertical: 6,
        ),
        listBullet: TextStyle(
          color: NoctraColors.electricViolet,
          fontSize: 14.5 * fontScale,
        ),
        horizontalRuleDecoration: const BoxDecoration(
          border: Border(
            top: BorderSide(color: NoctraColors.borderSubtle, width: 1),
          ),
        ),
      ),
    );
  }

  List<_MathOrMarkdownSegment> _splitDisplayMathSegments(String raw) {
    final regex = RegExp(r'\$\$([\s\S]*?)\$\$');
    final matches = regex.allMatches(raw).toList();
    if (matches.isEmpty) {
      return [_MathOrMarkdownSegment(text: raw, isMath: false)];
    }

    final result = <_MathOrMarkdownSegment>[];
    var cursor = 0;
    for (final m in matches) {
      if (m.start > cursor) {
        final before = raw.substring(cursor, m.start);
        if (before.trim().isNotEmpty) {
          result.add(_MathOrMarkdownSegment(text: before, isMath: false));
        }
      }
      final formula = m.group(1)?.trim() ?? '';
      if (formula.isNotEmpty) {
        result.add(_MathOrMarkdownSegment(text: formula, isMath: true));
      }
      cursor = m.end;
    }
    if (cursor < raw.length) {
      final tail = raw.substring(cursor);
      if (tail.trim().isNotEmpty) {
        result.add(_MathOrMarkdownSegment(text: tail, isMath: false));
      }
    }
    return result;
  }
}

class _MathOrMarkdownSegment {
  final String text;
  final bool isMath;

  const _MathOrMarkdownSegment({required this.text, required this.isMath});
}

class _CodeBlockBuilder extends MarkdownElementBuilder {
  final double fontScale;

  _CodeBlockBuilder({required this.fontScale});

  @override
  Widget? visitElementAfter(md.Element element, TextStyle? preferredStyle) {
    var language = 'plaintext';
    String codeText = element.textContent;

    if (element.children != null && element.children!.isNotEmpty) {
      final firstChild = element.children!.first;
      if (firstChild is md.Element &&
          firstChild.attributes['class'] != null) {
        final cls = firstChild.attributes['class']!;
        if (cls.startsWith('language-')) {
          language = cls.substring('language-'.length).trim();
        }
      }
    }

    if (codeText.endsWith('\n')) {
      codeText = codeText.substring(0, codeText.length - 1);
    }

    return _SyntaxHighlightedCodeCard(
      code: codeText,
      language: language.isEmpty ? 'code' : language,
      fontScale: fontScale,
    );
  }
}

class _SyntaxHighlightedCodeCard extends StatefulWidget {
  final String code;
  final String language;
  final double fontScale;

  const _SyntaxHighlightedCodeCard({
    required this.code,
    required this.language,
    required this.fontScale,
  });

  @override
  State<_SyntaxHighlightedCodeCard> createState() =>
      _SyntaxHighlightedCodeCardState();
}

class _SyntaxHighlightedCodeCardState
    extends State<_SyntaxHighlightedCodeCard> {
  bool _copied = false;

  Future<void> _copyCode() async {
    await Clipboard.setData(ClipboardData(text: widget.code));
    if (!mounted) return;
    setState(() {
      _copied = true;
    });
    await Future<void>.delayed(const Duration(seconds: 2));
    if (mounted) {
      setState(() {
        _copied = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final customTheme = Map<String, TextStyle>.from(atomOneDarkTheme);
    customTheme['root'] = const TextStyle(
      backgroundColor: Color(0xFF0B0E15),
      color: NoctraColors.textMain,
    );

    return Container(
      margin: const EdgeInsets.symmetric(vertical: 8),
      decoration: BoxDecoration(
        color: const Color(0xFF0B0E15),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: NoctraColors.borderHighlight, width: 1),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
            decoration: const BoxDecoration(
              color: Color(0xFF131722),
              borderRadius: BorderRadius.vertical(top: Radius.circular(13)),
              border: Border(
                bottom: BorderSide(color: NoctraColors.borderSubtle, width: 1),
              ),
            ),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Row(
                  children: [
                    const Icon(
                      Icons.code_rounded,
                      size: 15,
                      color: NoctraColors.electricViolet,
                    ),
                    const SizedBox(width: 6),
                    Text(
                      widget.language.toUpperCase(),
                      style: const TextStyle(
                        color: NoctraColors.textSecondary,
                        fontSize: 11.5,
                        fontWeight: FontWeight.w600,
                        letterSpacing: 0.6,
                      ),
                    ),
                  ],
                ),
                InkWell(
                  onTap: _copyCode,
                  borderRadius: BorderRadius.circular(8),
                  child: Padding(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 8,
                      vertical: 4,
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(
                          _copied ? Icons.check_rounded : Icons.copy_rounded,
                          size: 14,
                          color: _copied
                              ? NoctraColors.successGreen
                              : NoctraColors.cyanAccent,
                        ),
                        const SizedBox(width: 5),
                        Text(
                          _copied ? 'Copied' : 'Copy code',
                          style: TextStyle(
                            color: _copied
                                ? NoctraColors.successGreen
                                : NoctraColors.textMain,
                            fontSize: 11.5,
                            fontWeight: FontWeight.w500,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ],
            ),
          ),
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.all(12),
            child: HighlightView(
              widget.code,
              language: widget.language == 'code' ? 'plaintext' : widget.language,
              theme: customTheme,
              textStyle: TextStyle(
                fontFamily: 'monospace',
                fontSize: 12.8 * widget.fontScale,
                height: 1.45,
              ),
            ),
          ),
        ],
      ),
    );
  }
}
