abstract final class AppRoutes {
  static const splash = '/splash';
  static const onboarding = '/onboarding';
  static const welcome = '/welcome';
  static const createAccount = '/create-account';
  static const verifyOtp = '/verify';
  static const selectRole = '/role';
  static const passengerDetails = '/passenger/details';
  static const passengerHome = '/passenger/home';
  static const passengerRiderDetail = '/passenger/home/rider/:riderId';
  static const passengerMap = '/passenger/map';
  static const passengerRides = '/passenger/rides';
  static const passengerAccount = '/passenger/account';

  static String passengerRiderDetailPath(String riderId) =>
      '/passenger/home/rider/$riderId';
  static const driverType = '/rider/vehicle';
  static const riderDetails = '/rider/details';
  static const riderDocuments = '/rider/documents';
  static const riderApproval = '/rider/approval';
  static const riderJobs = '/rider/jobs';
  static const riderMap = '/rider/map';
  static const riderToken = '/rider/token';
  static const riderAccount = '/rider/account';
}
