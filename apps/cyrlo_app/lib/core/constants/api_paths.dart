/// Paths relative to [AppConfig.apiBaseUrl].
/// Business paths are the contract. They are not implemented on the server yet.
abstract final class ApiPaths {
  static const health = '/health';
  static const requestOtp = '/auth/otp';
  static const verifyOtp = '/auth/otp/verify';
  static const refreshSession = '/auth/refresh';
  static const logout = '/auth/logout';
  static const bookings = '/bookings';
  static const riderAvailability = '/riders/availability';
  static const riderLocation = '/locations/rider';
}
