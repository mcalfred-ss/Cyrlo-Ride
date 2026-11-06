import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../core/theme/app_motion.dart';

class CyrloTransitionPage<T> extends CustomTransitionPage<T> {
  CyrloTransitionPage({
    required super.child,
    required super.key,
  }) : super(
         transitionDuration: AppMotion.page,
         reverseTransitionDuration: AppMotion.normal,
         transitionsBuilder: (context, animation, secondaryAnimation, child) {
           final enter = CurvedAnimation(parent: animation, curve: AppMotion.standard);
           final leave = CurvedAnimation(parent: secondaryAnimation, curve: AppMotion.exit);
           return FadeTransition(
             opacity: Tween<double>(begin: 1, end: 0.72).animate(leave),
             child: FadeTransition(
               opacity: enter,
               child: SlideTransition(
                 position: Tween<Offset>(
                   begin: const Offset(0.05, 0),
                   end: Offset.zero,
                 ).animate(enter),
                 child: child,
               ),
             ),
           );
         },
       );
}

GoRoute flowRoute(String path, Widget screen) {
  return GoRoute(
    path: path,
    pageBuilder: (context, state) {
      return CyrloTransitionPage<void>(
        key: state.pageKey,
        child: screen,
      );
    },
  );
}
