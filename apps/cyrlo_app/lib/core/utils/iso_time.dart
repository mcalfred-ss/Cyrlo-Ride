/// API timestamps are ISO-8601 UTC strings.
String toIsoUtc(DateTime value) => value.toUtc().toIso8601String();
