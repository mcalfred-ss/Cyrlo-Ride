import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:cyrlo_app/app.dart';
import 'package:cyrlo_app/core/media/document_pick_gateway.dart';
import 'package:cyrlo_app/features/auth/data/auth_api.dart';

Future<void> verifyOtpAndContinue(WidgetTester tester) async {
  await tester.pump(); // allow requestOtp post-frame
  await tester.pump(const Duration(milliseconds: 50));
  await tester.enterText(find.byKey(const Key('otp-input')), '123456');
  await tester.tap(find.byKey(const Key('verify-otp')));
  await tester.pump();
  expect(find.byKey(const Key('otp-success-check')), findsOneWidget);
  await tester.pump(const Duration(milliseconds: 1300));
  await tester.pumpAndSettle();
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

    expect(find.text('Welcome'), findsOneWidget);
    await tester.tap(find.byKey(const Key('get-started')));
    await tester.pumpAndSettle();

    await tester.enterText(find.byKey(const Key('ghana-phone-input')), '244123456');
    await tester.tap(find.byKey(const Key('create-account')));
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const Key('continue-role')));
    await tester.pumpAndSettle();

    await verifyOtpAndContinue(tester);

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

    await verifyOtpAndContinue(tester);

    await tester.tap(find.byKey(const Key('driver-aboboyaa')));
    await tester.pumpAndSettle();
    expect(find.text('What do you drive?'), findsOneWidget);

    await tester.tap(find.byKey(const Key('driver-okada')));
    await tester.pumpAndSettle();

    await tester.enterText(find.byKey(const Key('rider-first-name')), 'Kwame');
    await tester.enterText(find.byKey(const Key('rider-last-name')), 'Boateng');
    await tester.enterText(find.byKey(const Key('rider-location')), 'Kumasi');
    await tester.ensureVisible(find.byKey(const Key('rider-dob')));
    await tester.tap(find.byKey(const Key('rider-dob')));
    await tester.pumpAndSettle();
    await tester.tap(find.text('OK'));
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.byKey(const Key('rider-gender-male')));
    await tester.tap(find.byKey(const Key('rider-gender-male')));
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.byKey(const Key('rider-details-continue')));
    await tester.tap(find.byKey(const Key('rider-details-continue')));
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const Key('id-drivers-license')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('upload-id-front')));
    await tester.pumpAndSettle();
    await tester.enterText(find.byKey(const Key('rider-vehicle-number')), 'GR 1234-25');
    await tester.ensureVisible(find.byKey(const Key('upload-selfie')));
    await tester.tap(find.byKey(const Key('upload-selfie')));
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.byKey(const Key('rider-submit')));
    await tester.tap(find.byKey(const Key('rider-submit')));
    await tester.pumpAndSettle();

    expect(find.text('Waiting for approval'), findsOneWidget);
  });
}
