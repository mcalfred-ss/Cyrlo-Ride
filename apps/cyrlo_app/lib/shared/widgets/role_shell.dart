import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../core/constants/app_colors.dart';
import '../review/app_review_service.dart';
import 'centered_frame.dart';

class RoleShell extends StatefulWidget {
  const RoleShell({
    super.key,
    required this.navigationShell,
    required this.destinations,
  });

  final StatefulNavigationShell navigationShell;
  final List<NavigationDestination> destinations;

  @override
  State<RoleShell> createState() => _RoleShellState();
}

class _RoleShellState extends State<RoleShell> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _bootstrapReviewPrompt());
  }

  Future<void> _bootstrapReviewPrompt() async {
    await AppReviewService.recordLaunch();
    // Let the home shell settle before asking.
    await Future<void>.delayed(const Duration(seconds: 3));
    if (!mounted) return;
    await AppReviewService.maybeAskForReview(context);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      body: CenteredFrame(
        margin: 0,
        child: Column(
          children: [
            Expanded(child: widget.navigationShell),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
              child: DecoratedBox(
                decoration: BoxDecoration(
                  color: AppColors.darkGrey,
                  borderRadius: BorderRadius.circular(30),
                  boxShadow: [
                    BoxShadow(
                      color: AppColors.elevationShadow(lightAlpha: 0.1),
                      blurRadius: 22,
                      offset: const Offset(0, 10),
                    ),
                  ],
                ),
                child: ClipRRect(
                  borderRadius: BorderRadius.circular(30),
                  child: NavigationBar(
                    selectedIndex: widget.navigationShell.currentIndex,
                    onDestinationSelected: (index) {
                      widget.navigationShell.goBranch(
                        index,
                        initialLocation:
                            index == widget.navigationShell.currentIndex,
                      );
                    },
                    destinations: widget.destinations,
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class SectionPage extends StatelessWidget {
  const SectionPage({super.key, required this.title, this.subtitle});

  final String title;
  final String? subtitle;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return SizedBox.expand(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(20, 12, 20, 0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              title,
              style: theme.textTheme.headlineSmall?.copyWith(
                color: AppColors.textPrimary,
                fontWeight: FontWeight.w800,
                letterSpacing: -0.4,
                height: 1.15,
              ),
            ),
            if (subtitle != null) ...[
              const SizedBox(height: 6),
              Text(
                subtitle!,
                style: theme.textTheme.bodyLarge?.copyWith(
                  color: AppColors.textSecondary,
                  fontWeight: FontWeight.w500,
                  height: 1.35,
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}
