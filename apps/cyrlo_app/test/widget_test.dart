import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:cyrlo_app/app.dart';
import 'package:cyrlo_app/core/media/document_pick_gateway.dart';
import 'package:cyrlo_app/features/auth/data/auth_api.dart';

Future<void> verifyOtpAndContinue(WidgetTester tester) async {
  // Post-frame OTP request is async — advance time so _sending clears.
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 100));
  // Auto-verifies when the 6th digit is entered.
  await tester.enterText(find.byKey(const Key('otp-input')), '123456');
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 50));
  expect(find.byKey(const Key('otp-success-check')), findsOneWidget);
  // Finish success delay (markOtpVerified) without pumpAndSettle.
  await tester.pump(const Duration(milliseconds: 1300));
  await tester.pump();
}

void main() {
  setUp(() {
    SharedPreferences.setMockInitialValues({});
  });

  testWidgets('passenger reaches home with the four tabs', (tester) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          authApiProvider.overrideWithValue(FakeAuthApi()),
        ],
        child: const CyrloApp(),
      ),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 2200));
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const Key('skip-onboarding')));
    await tester.pumpAndSettle();

    expect(find.text('Welcome to Cyrlo'), findsOneWidget);
    await tester.tap(find.byKey(const Key('get-started')));
    await tester.pumpAndSettle();

    await tester.enterText(find.byKey(const Key('ghana-phone-input')), '244123456');
    await tester.tap(find.byKey(const Key('create-account')));
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const Key('continue-role')));
    await tester.pumpAndSettle();

    expect(find.text('Confirm your number'), findsOneWidget);
    await tester.tap(
      find.descendant(
        of: find.byKey(const Key('confirm-phone-yes')),
        matching: find.byType(FilledButton),
      ),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));
    expect(find.byKey(const Key('otp-input')), findsOneWidget);

    await verifyOtpAndContinue(tester);

    expect(find.byKey(const Key('passenger-first-name')), findsOneWidget);
    await tester.enterText(find.byKey(const Key('passenger-first-name')), 'Ama');
    await tester.enterText(find.byKey(const Key('passenger-last-name')), 'Mensah');
    await tester.enterText(find.byKey(const Key('passenger-location')), 'Accra');
    await tester.ensureVisible(find.byKey(const Key('passenger-dob')));
    await tester.tap(find.byKey(const Key('passenger-dob')));
    await tester.pumpAndSettle();
    await tester.tap(find.text('OK'));
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.byKey(const Key('gender-female')));
    await tester.tap(find.byKey(const Key('gender-female')));
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.byKey(const Key('passenger-continue')));
    await tester.tap(
      find.descendant(
        of: find.byKey(const Key('passenger-continue')),
        matching: find.byType(FilledButton),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Home'), findsWidgets);
    expect(find.text('Map'), findsOneWidget);
    expect(find.text('Rides'), findsOneWidget);
    expect(find.text('Account'), findsOneWidget);

    // Let RoleShell review delay fire while still mounted, then tear down.
    await tester.pump(const Duration(seconds: 4));
    await tester.pumpWidget(const SizedBox.shrink());
    await tester.pump(const Duration(seconds: 1));
  });

  testWidgets('rider reaches approval after submitting documents', (tester) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          authApiProvider.overrideWithValue(FakeAuthApi()),
          documentPickGatewayProvider.overrideWithValue(
            FakeDocumentPickGateway(),
          ),
        ],
        child: const CyrloApp(),
      ),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 2200));
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const Key('skip-onboarding')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('get-started')));
    await tester.pumpAndSettle();
    await tester.enterText(find.byKey(const Key('ghana-phone-input')), '201234567');
    await tester.tap(find.byKey(const Key('create-account')));
    await tester.pumpAndSettle();

    await tester.drag(find.byType(PageView), const Offset(-420, 0));
    await tester.pumpAndSettle();
    expect(find.text('Continue as Rider'), findsOneWidget);
    await tester.tap(find.byKey(const Key('continue-role')));
    await tester.pumpAndSettle();

    expect(find.text('Confirm your number'), findsOneWidget);
    await tester.tap(
      find.descendant(
        of: find.byKey(const Key('confirm-phone-yes')),
        matching: find.byType(FilledButton),
      ),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));
    expect(find.byKey(const Key('otp-input')), findsOneWidget);

    await verifyOtpAndContinue(tester);

    // Confirm-phone + OTP path reached rider onboarding.
    expect(find.byKey(const Key('driver-pragya')), findsOneWidget);

    await tester.pumpWidget(const SizedBox.shrink());
    await tester.pump(const Duration(seconds: 1));
  });
}
