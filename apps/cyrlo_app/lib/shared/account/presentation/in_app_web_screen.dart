import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:webview_flutter/webview_flutter.dart';
import 'package:webview_windows/webview_windows.dart' as windows_wv;

import '../../../core/constants/app_colors.dart';
import '../../widgets/cyrlo_button.dart';

/// Full-screen in-app browser for hosted legal / support pages.
class InAppWebScreen extends StatefulWidget {
  const InAppWebScreen({
    super.key,
    required this.title,
    required this.url,
  });

  final String title;
  final String url;

  static bool get usesMobileWebView {
    if (kIsWeb) return false;
    return defaultTargetPlatform == TargetPlatform.android ||
        defaultTargetPlatform == TargetPlatform.iOS ||
        defaultTargetPlatform == TargetPlatform.macOS;
  }

  static bool get usesWindowsWebView {
    if (kIsWeb) return false;
    return defaultTargetPlatform == TargetPlatform.windows;
  }

  @override
  State<InAppWebScreen> createState() => _InAppWebScreenState();
}

class _InAppWebScreenState extends State<InAppWebScreen> {
  WebViewController? _mobileController;
  windows_wv.WebviewController? _windowsController;
  var _loading = true;
  var _windowsReady = false;
  String? _error;
  var _openingExternal = false;

  @override
  void initState() {
    super.initState();
    if (InAppWebScreen.usesMobileWebView) {
      _initMobileWebView();
    } else if (InAppWebScreen.usesWindowsWebView) {
      _initWindowsWebView();
    } else {
      _loading = false;
    }
  }

  void _initMobileWebView() {
    _mobileController = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setNavigationDelegate(
        NavigationDelegate(
          onPageStarted: (_) {
            if (!mounted) return;
            setState(() {
              _loading = true;
              _error = null;
            });
          },
          onPageFinished: (_) {
            if (!mounted) return;
            setState(() => _loading = false);
          },
          onWebResourceError: (error) {
            if (!mounted) return;
            setState(() {
              _loading = false;
              _error = error.description.isNotEmpty
                  ? error.description
                  : 'Could not load this page.';
            });
          },
        ),
      )
      ..loadRequest(Uri.parse(widget.url));
  }

  Future<void> _initWindowsWebView() async {
    final controller = windows_wv.WebviewController();
    _windowsController = controller;
    try {
      final version = await windows_wv.WebviewController.getWebViewVersion();
      if (version == null) {
        if (!mounted) return;
        setState(() {
          _loading = false;
          _error =
              'Microsoft Edge WebView2 is required to open this page in the app.';
        });
        return;
      }
      await controller.initialize();
      controller.loadingState.listen((state) {
        if (!mounted) return;
        setState(() {
          _loading = state == windows_wv.LoadingState.loading;
        });
      });
      controller.onLoadError.listen((_) {
        if (!mounted) return;
        setState(() {
          _loading = false;
          _error = 'Could not load this page.';
        });
      });
      await controller.setBackgroundColor(AppColors.surfaceAlt);
      await controller.loadUrl(widget.url);
      if (!mounted) return;
      setState(() {
        _windowsReady = true;
        _loading = false;
        _error = null;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = 'Could not open this page in the app.';
      });
    }
  }

  @override
  void dispose() {
    _windowsController?.dispose();
    super.dispose();
  }

  Future<void> _openExternal() async {
    setState(() => _openingExternal = true);
    try {
      final uri = Uri.parse(widget.url);
      final ok = await launchUrl(uri, mode: LaunchMode.externalApplication);
      if (!mounted) return;
      if (!ok) {
        setState(() => _error = 'Could not open the browser.');
      }
    } catch (_) {
      if (!mounted) return;
      setState(() => _error = 'Could not open the browser.');
    } finally {
      if (mounted) setState(() => _openingExternal = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Scaffold(
      backgroundColor: AppColors.surfaceAlt,
      appBar: AppBar(
        backgroundColor: AppColors.surface,
        foregroundColor: AppColors.textPrimary,
        elevation: 0,
        title: Text(
          widget.title,
          style: theme.textTheme.titleMedium?.copyWith(
            fontWeight: FontWeight.w800,
            color: AppColors.textPrimary,
          ),
        ),
      ),
      body: _buildBody(theme),
    );
  }

  Widget _buildBody(ThemeData theme) {
    if (_mobileController != null) {
      return _buildMobile(theme);
    }
    if (InAppWebScreen.usesWindowsWebView) {
      return _buildWindows(theme);
    }
    return _buildExternalFallback(theme);
  }

  Widget _buildMobile(ThemeData theme) {
    return Stack(
      children: [
        if (_error == null) WebViewWidget(controller: _mobileController!),
        if (_error != null) _errorPane(theme, onRetry: () {
          setState(() {
            _error = null;
            _loading = true;
          });
          _mobileController!.loadRequest(Uri.parse(widget.url));
        }),
        if (_loading && _error == null)
          const LinearProgressIndicator(minHeight: 2),
      ],
    );
  }

  Widget _buildWindows(ThemeData theme) {
    if (_error != null) {
      return _errorPane(
        theme,
        onRetry: () {
          setState(() {
            _error = null;
            _loading = true;
            _windowsReady = false;
          });
          _initWindowsWebView();
        },
        showExternal: true,
      );
    }
    if (!_windowsReady || _windowsController == null) {
      return const Center(child: CircularProgressIndicator());
    }
    return Stack(
      children: [
        windows_wv.Webview(_windowsController!),
        if (_loading) const LinearProgressIndicator(minHeight: 2),
      ],
    );
  }

  Widget _errorPane(
    ThemeData theme, {
    required VoidCallback onRetry,
    bool showExternal = false,
  }) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              _error ?? 'Could not load this page.',
              textAlign: TextAlign.center,
              style: theme.textTheme.bodyLarge?.copyWith(
                color: AppColors.textSecondary,
                fontWeight: FontWeight.w600,
              ),
            ),
            const SizedBox(height: 16),
            FilledButton(
              onPressed: onRetry,
              child: const Text('Retry'),
            ),
            if (showExternal) ...[
              const SizedBox(height: 8),
              TextButton(
                onPressed: _openingExternal ? null : _openExternal,
                child: Text(_openingExternal ? 'Opening…' : 'Open in browser'),
              ),
            ],
          ],
        ),
      ),
    );
  }

  Widget _buildExternalFallback(ThemeData theme) {
    return Padding(
      padding: const EdgeInsets.all(24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const Spacer(),
          Text(
            widget.title,
            textAlign: TextAlign.center,
            style: theme.textTheme.headlineSmall?.copyWith(
              fontWeight: FontWeight.w800,
              color: AppColors.textPrimary,
            ),
          ),
          const SizedBox(height: 12),
          Text(
            'This page opens in your browser on this device.',
            textAlign: TextAlign.center,
            style: theme.textTheme.bodyLarge?.copyWith(
              color: AppColors.textSecondary,
              height: 1.4,
            ),
          ),
          if (_error != null) ...[
            const SizedBox(height: 12),
            Text(
              _error!,
              textAlign: TextAlign.center,
              style: theme.textTheme.bodyMedium?.copyWith(
                color: AppColors.error,
                fontWeight: FontWeight.w600,
              ),
            ),
          ],
          const Spacer(),
          CyrloButton(
            key: const Key('open-external-web'),
            label: _openingExternal ? 'Opening…' : 'Open in browser',
            onPressed: _openingExternal ? null : _openExternal,
          ),
        ],
      ),
    );
  }
}
