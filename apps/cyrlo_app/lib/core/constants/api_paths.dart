/// Paths relative to [AppConfig.apiBaseUrl].
abstract final class ApiPaths {
  static const health = '/health';
  static const requestOtp = '/auth/otp';
  static const accountStatus = '/auth/account-status';
  static const verifyOtp = '/auth/otp/verify';
  static const refreshSession = '/auth/refresh';
  static const logout = '/auth/logout';

  static const me = '/users/me';

  static const bookings = '/bookings';
  static String booking(String id) => '/bookings/$id';
  static String bookingCancel(String id) => '/bookings/$id/cancel';
  static String bookingCancelAfterAccept(String id) =>
      '/bookings/$id/cancel-after-accept';
  static String bookingStart(String id) => '/bookings/$id/start';
  static String bookingComplete(String id) => '/bookings/$id/complete';
  static String bookingRiderCancel(String id) => '/bookings/$id/rider-cancel';
  static String bookingUnableToComplete(String id) =>
      '/bookings/$id/unable-to-complete';
  static String bookingAcknowledge(String id) => '/bookings/$id/acknowledge';

  static const bookingFeePayment = '/payments/booking-fee';

  static const matchingNearby = '/matching/nearby';
  static const matchingOffers = '/matching/offers';
  static String matchingOfferAccept(String offerId) =>
      '/matching/offers/$offerId/accept';
  static String matchingOfferReject(String offerId) =>
      '/matching/offers/$offerId/reject';
  static String matchingBookingStatus(String bookingId) =>
      '/matching/bookings/$bookingId/status';

  static const walletPackages = '/wallet/packages';
  static const walletBalance = '/wallet/balance';
  static const walletLedger = '/wallet/ledger';
  static const walletPurchases = '/wallet/purchases';
  static String walletPurchase(String id) => '/wallet/purchases/$id';

  static const riderAvailability = '/riders/availability';
  static const riderOnboarding = '/riders/onboarding';
  static const riderOnboardingSubmit = '/riders/onboarding/submit';
  static const riderVehicles = '/riders/vehicles';
  static const riderDocuments = '/riders/documents';
  static const riderLocation = '/locations/rider';
  static const riderLocationStop = '/locations/rider/stop';
  static const riderLocationMe = '/locations/rider/me';

  static const mapsConfig = '/maps/config';
  static const mapsGeocode = '/maps/geocode';
  static const mapsReverseGeocode = '/maps/geocode/reverse';
  static const mapsPlacesSearch = '/maps/places/search';
  static const mapsRoutes = '/maps/routes';
  static const mapsRouteEstimate = '/maps/routes/estimate';

  static const notifications = '/notifications';
  static const notificationsReadAll = '/notifications/read-all';
  static String notificationRead(String id) => '/notifications/$id/read';
  static const notificationDevices = '/notifications/devices';
  static String notificationDevice(String deviceId) =>
      '/notifications/devices/$deviceId';
  static const notificationPreferences = '/notifications/preferences';
}
