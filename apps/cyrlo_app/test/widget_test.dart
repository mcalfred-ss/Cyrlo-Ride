import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:cyrlo_app/app.dart';
import 'package:cyrlo_app/features/auth/application/signup_controller.dart';

void main() {
  testWidgets('passenger reaches home with the four tabs', (tester) async {
    await tester.pumpWidget(const ProviderScope(child: CyrloApp()));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 800));
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const Key('skip-onboarding')));
    await tester.pumpAndSettle();

    expect(find.text('Welcome'), findsOneWidget);
    await tester.tap(find.byKey(const Key('get-started')));
    await tester.pumpAndSettle();

    await tester.enterText(find.byKey(const Key('ghana-phone-input')), '244123456');
    await tester.tap(find.byKey(const Key('create-account')));
    await tester.pumpAndSettle();

    await tester.enterText(find.byKey(const Key('otp-input')), '123456');
    await tester.tap(find.byKey(const Key('verify-otp')));
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const Key('role-passenger')));
    await tester.pumpAndSettle();

    await tester.enterText(find.byKey(const Key('passenger-name')), 'Ama Mensah');
    await tester.tap(find.byKey(const Key('passenger-continue')));
    await tester.pumpAndSettle();

    expect(find.text('Home'), findsWidgets);
    expect(find.text('Map'), findsOneWidget);
    expect(find.text('Rides'), findsOneWidget);
    expect(find.text('Account'), findsOneWidget);

    await tester.tap(find.text('Rides'));
    await tester.pumpAndSettle();
    expect(find.text('Rides'), findsWidgets);
  });

  testWidgets('rider waits on approval until accepted', (tester) async {
    await tester.pumpWidget(const ProviderScope(child: CyrloApp()));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 800));
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const Key('skip-onboarding')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('get-started')));
    await tester.pumpAndSettle();
    await tester.enterText(find.byKey(const Key('ghana-phone-input')), '201234567');
    await tester.tap(find.byKey(const Key('create-account')));
    await tester.pumpAndSettle();
    await tester.enterText(find.byKey(const Key('otp-input')), '654321');
    await tester.tap(find.byKey(const Key('verify-otp')));
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const Key('role-rider')));
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const Key('driver-aboboyaa')));
    await tester.pumpAndSettle();
    expect(find.text('What do you drive?'), findsOneWidget);

    await tester.tap(find.byKey(const Key('driver-okada')));
    await tester.pumpAndSettle();
    await tester.enterText(find.byKey(const Key('rider-name')), 'Kwame Boateng');
    await tester.tap(find.byKey(const Key('rider-submit')));
    await tester.pumpAndSettle();

    expect(find.text('Waiting for approval'), findsOneWidget);
    expect(find.text('Jobs'), findsNothing);

    final context = tester.element(find.text('Waiting for approval'));
    ProviderScope.containerOf(context).read(signupProvider.notifier).markRiderApproved();
    await tester.pumpAndSettle();

    expect(find.text('Jobs'), findsWidgets);
    expect(find.text('Token'), findsOneWidget);
    expect(find.text('Account'), findsOneWidget);
  });
}
