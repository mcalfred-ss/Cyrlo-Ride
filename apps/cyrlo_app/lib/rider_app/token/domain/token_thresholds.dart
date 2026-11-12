/// Token UX thresholds for rider availability reminders.
abstract final class TokenThresholds {
  /// Balance at or below this (and above zero) triggers a low-token reminder.
  static const lowBalance = 3;

  /// Minimum tokens required to go online / accept a job.
  static const minToGoOnline = 1;
}
