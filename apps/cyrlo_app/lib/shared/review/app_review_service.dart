import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:in_app_review/in_app_review.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/config/app_config.dart';
import '../../core/constants/app_colors.dart';

/// Store rating helpers for App Store + Play.
///
/// Prefers the native in-app star sheet (same API other apps use). Store
/// listing is only a fallback when the OS cannot show that sheet.
abstract final class AppReviewService {
  static const _promptedKey = 'cyrlo.review.auto_prompted';
  static const _launchCountKey = 'cyrlo.review.launch_count';
  static const _firstSeenKey = 'cyrlo.review.first_seen_ms';

  /// Minimum launches before the one-time prompt may appear.
  static const minLaunchesBeforePrompt = 3;

  /// Minimum time since first open before the one-time prompt may appear.
  static const minDaysBeforePrompt = 1;

  static final InAppReview _inAppReview = InAppReview.instance;

  static Future<void> recordLaunch() async {
    final prefs = await SharedPreferences.getInstance();
    final count = prefs.getInt(_launchCountKey) ?? 0;
    await prefs.setInt(_launchCountKey, count + 1);
    if (!prefs.containsKey(_firstSeenKey)) {
      await prefs.setInt(
        _firstSeenKey,
        DateTime.now().millisecondsSinceEpoch,
      );
    }
  }

  static Future<bool> _shouldAutoPrompt() async {
    final prefs = await SharedPreferences.getInstance();
    if (prefs.getBool(_promptedKey) ?? false) return false;
    final launches = prefs.getInt(_launchCountKey) ?? 0;
    if (launches < minLaunchesBeforePrompt) return false;
    final firstMs = prefs.getInt(_firstSeenKey);
    if (firstMs == null) return false;
    final firstSeen = DateTime.fromMillisecondsSinceEpoch(firstMs);
    final days = DateTime.now().difference(firstSeen).inDays;
    return days >= minDaysBeforePrompt;
  }

  /// Marks the auto prompt as used so it never shows again.
  static Future<void> _markPrompted() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool(_promptedKey, true);
  }

  /// Soft ask once, then native in-app review.
  static Future<void> maybeAskForReview(BuildContext context) async {
    if (!await _shouldAutoPrompt()) return;
    await _markPrompted();
    if (!context.mounted) return;

    final wantsRate = await showDialog<bool>(
      context: context,
      barrierDismissible: true,
      builder: (context) => AlertDialog(
        backgroundColor: AppColors.surface,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(24)),
        title: const Text('Enjoying Cyrlo Ride?'),
        content: const Text(
          'Tap Rate to leave a quick star rating without leaving the app.',
          style: TextStyle(height: 1.4),
        ),
        actions: [
          TextButton(
            key: const Key('review-not-now'),
            onPressed: () => Navigator.of(context).pop(false),
            child: const Text('Not now'),
          ),
          FilledButton(
            key: const Key('review-rate-now'),
            onPressed: () => Navigator.of(context).pop(true),
            child: const Text('Rate Cyrlo Ride'),
          ),
        ],
      ),
    );

    if (wantsRate != true) return;
    await requestInAppReview();
  }

  /// Shows Apple / Google’s in-app rating sheet when the OS allows it.
  /// Falls back to the store page only if the native sheet cannot run
  /// (e.g. web, or a sideloaded debug build).
  static Future<void> requestInAppReview() async {
    if (kIsWeb) {
      await openStoreListing();
      return;
    }

    try {
      // Always try the native sheet first — same path other apps use.
      // Apple/Google decide whether it appears (quota / install source).
      await _inAppReview.requestReview();
      return;
    } catch (_) {
      // Fall through to store listing.
    }

    await openStoreListing();
  }

  /// Opens the live App Store / Play listing (leaves the app).
  static Future<void> openStoreListing() async {
    try {
      await _inAppReview.openStoreListing(
        appStoreId: AppConfig.appStoreId,
      );
      return;
    } catch (_) {
      // Fall through to https URLs.
    }

    final isIos = !kIsWeb && defaultTargetPlatform == TargetPlatform.iOS;
    final isMacOs = !kIsWeb && defaultTargetPlatform == TargetPlatform.macOS;
    final uri = (isIos || isMacOs)
        ? Uri.parse('https://apps.apple.com/app/id${AppConfig.appStoreId}')
        : Uri.parse(
            'https://play.google.com/store/apps/details?id=${AppConfig.playStorePackageName}',
          );
    if (await canLaunchUrl(uri)) {
      await launchUrl(uri, mode: LaunchMode.externalApplication);
    }
  }
}
