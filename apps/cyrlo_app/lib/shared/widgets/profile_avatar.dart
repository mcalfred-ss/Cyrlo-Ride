import '../../features/auth/application/signup_draft.dart';
import 'illustration_view.dart';

abstract final class ProfileAvatars {
  static const male = [
    AppIllustrations.avatarMale1,
    AppIllustrations.avatarMale2,
  ];

  static const female = [
    AppIllustrations.avatarFemale1,
    AppIllustrations.avatarFemale2,
  ];

  /// Stable “random” avatar from gender + id.
  static String assetFor({
    required PassengerGender? gender,
    required String seed,
  }) {
    final pool = gender == PassengerGender.female ? female : male;
    final index = seed.hashCode.abs() % pool.length;
    return pool[index];
  }
}
