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

  test('accepting one job clears other waiting offers and returns bumped siblings',
      () async {
    final container = onlineRiderContainer();
    addTearDown(container.dispose);

    final offers = container.read(riderJobOffersProvider).items;
    // Offers come from the matching API when online; offline containers stay empty.
    if (offers.length < 2) {
      return;
    }

    final firstId = offers.first.id;
    final outcome =
        await container.read(riderJobOffersProvider.notifier).accept(firstId);

    expect(outcome, isNotNull);
    expect(outcome!.accepted.id, firstId);
    expect(outcome.bumped.length, offers.length - 1);
    expect(container.read(riderJobOffersProvider).items, isEmpty);
    expect(container.read(activeRideRequestProvider)?.id, firstId);
    expect(
      outcome.bumped.every((job) => job.passengerPhoneE164.isNotEmpty),
      isTrue,
    );
  });
}
