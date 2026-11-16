/// Shapes reverse-geocode / place labels without inventing community names.
///
/// Inspired by Cyrlo Food's short-address shaping: prefer the most specific
/// leading locality segments returned by the provider. Never snaps GPS to a
/// hardcoded town.
bool isPlaceholderLocationLabel(String? value) {
  final text = value?.trim().toLowerCase() ?? '';
  if (text.isEmpty) return true;
  return text == 'current location' ||
      text == 'pinned pickup' ||
      text == 'dropped pin' ||
      text == 'ghana' ||
      text == 'gh' ||
      text == 'choose location';
}

/// True when the provider only returned a coarse city/region style label.
bool isCoarseRegionLabel(String? value) {
  final parts = _usefulParts(value);
  if (parts.isEmpty) return true;
  final joined = parts.join(' ').toLowerCase();
  final onlyRegionish = parts.every((part) {
    final lower = part.toLowerCase();
    return lower.contains('region') ||
        lower == 'ashanti' ||
        lower == 'kumasi' ||
        lower == 'greater kumasi' ||
        lower == 'ghana';
  });
  return onlyRegionish ||
      (parts.length <= 2 &&
          joined.contains('kumasi') &&
          joined.contains('ashanti'));
}

/// Compact display label: most-specific leading segments, drop trailing Ghana.
String shapeLocationLabel(String? raw, {String? fallback}) {
  final parts = _usefulParts(raw);
  if (parts.isEmpty) {
    final fb = fallback?.trim();
    // Prefer explicit UI fallbacks (Current location / Pinned pickup) over
    // country-only reverse strings like "Ghana".
    if (fb != null && fb.isNotEmpty) return fb;
    return '';
  }
  return parts.take(3).join(', ');
}

List<String> _usefulParts(String? value) {
  if (value == null) return const [];
  return value
      .split(',')
      .map((e) => e.trim())
      .where((e) => e.isNotEmpty && !isPlaceholderLocationLabel(e))
      .toList(growable: false);
}
