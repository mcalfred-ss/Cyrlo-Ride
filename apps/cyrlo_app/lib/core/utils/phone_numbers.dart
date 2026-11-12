abstract final class PhoneNumbers {
  static const ghanaDialPrefix = '+233';

  static String digitsOnly(String input) => input.replaceAll(RegExp(r'\D'), '');

  /// Accepts `0244123456`, `244123456`, `233244123456`, and `+233244123456`.
  static String? normalizeGhanaToE164(String? input) {
    if (input == null) return null;
    final digits = digitsOnly(input);
    if (digits.isEmpty) return null;

    final String national;
    if (digits.startsWith('233') && digits.length >= 12) {
      national = digits.substring(3);
    } else if (digits.startsWith('0') && digits.length >= 10) {
      national = digits.substring(1);
    } else {
      national = digits;
    }

    if (national.length != 9) return null;
    if (!RegExp(r'^[2-9]\d{8}$').hasMatch(national)) return null;
    return '$ghanaDialPrefix$national';
  }

  static String formatGhanaDisplay(String? input) {
    final e164 = normalizeGhanaToE164(input);
    if (e164 == null) return input?.trim() ?? '';
    final national = e164.substring(ghanaDialPrefix.length);
    return '$ghanaDialPrefix ${national.substring(0, 2)} ${national.substring(2, 5)} ${national.substring(5)}';
  }

  /// National 9 digits for the Ghana phone field (no leading 0 / +233).
  static String? ghanaNationalDigits(String? input) {
    final e164 = normalizeGhanaToE164(input);
    if (e164 == null) return null;
    return e164.substring(ghanaDialPrefix.length);
  }
}
