import 'package:cyrlo_app/features/auth/application/signup_controller.dart';
import 'package:cyrlo_app/features/auth/application/signup_draft.dart';
import 'package:cyrlo_app/rider_app/availability/application/rider_availability_provider.dart';
import 'package:cyrlo_app/shared/ride_session/active_ride_request_controller.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  ProviderContainer onlineRiderContainer() {
    final container = ProviderContainer();
    final signup = container.read(signupProvider.notifier);
    signup.chooseRole(RideRole.rider);
    signup.chooseDriver(DriverKind.pragya);
    signup.submitPhone('0244000111');
    container.read(riderOnlineProvider.notifier).goOnline();
    return container;
  }

  test('accepting one job clears other waiting offers and returns bumped siblings', () {
    final container = onlineRiderContainer();
    addTearDown(container.dispose);

    final offers = container.read(riderJobOffersProvider);
    expect(offers.length, greaterThanOrEqualTo(2));

    final firstId = offers.first.id;
    final outcome = container.read(riderJobOffersProvider.notifier).accept(firstId);

    expect(outcome, isNotNull);
    expect(outcome!.accepted.id, firstId);
    expect(outcome.bumped.length, offers.length - 1);
    expect(container.read(riderJobOffersProvider), isEmpty);
    expect(container.read(activeRideRequestProvider)?.id, firstId);
    expect(
      outcome.bumped.every((job) => job.passengerPhoneE164.isNotEmpty),
      isTrue,
    );
  });
}
