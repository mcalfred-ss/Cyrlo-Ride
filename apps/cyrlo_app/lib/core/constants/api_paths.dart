/// Paths relative to [AppConfig.apiBaseUrl].
abstract final class ApiPaths {
  static const health = '/health';
  static const requestOtp = '/auth/otp';
  static const verifyOtp = '/auth/otp/verify';
  static const refreshSession = '/auth/refresh';
  static const logout = '/auth/logout';
  static const bookings = '/bookings';
  static const riderAvailability = '/riders/availability';
  static const riderLocation = '/locations/rider';
  static const mapsGeocode = '/maps/geocode';
  static const mapsReverseGeocode = '/maps/geocode/reverse';
  static const mapsPlacesSearch = '/maps/places/search';
  static const mapsRoutes = '/maps/routes';
  static const mapsRouteEstimate = '/maps/routes/estimate';
}
