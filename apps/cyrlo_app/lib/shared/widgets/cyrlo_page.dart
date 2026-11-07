import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../core/theme/app_motion.dart';

class CyrloTransitionPage<T> extends CustomTransitionPage<T> {
  CyrloTransitionPage({
    required super.child,
    required super.key,
  }) : super(
         transitionDuration: AppMotion.fast,
         reverseTransitionDuration: AppMotion.fast,
         transitionsBuilder: (context, animation, secondaryAnimation, child) {
           final enter = CurvedAnimation(parent: animation, curve: AppMotion.standard);
           // Keep opacity high so route changes never flash a blank white frame.
           return FadeTransition(
             opacity: Tween<double>(begin: 0.92, end: 1).animate(enter),
             child: SlideTransition(
               position: Tween<Offset>(
                 begin: const Offset(0.03, 0),
                 end: Offset.zero,
               ).animate(enter),
               child: child,
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
