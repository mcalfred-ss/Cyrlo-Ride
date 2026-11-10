import 'dart:io' show Platform;

bool get isIoWindows => Platform.isWindows;
bool get isIoAndroid => Platform.isAndroid;
bool get isIoIOS => Platform.isIOS;
bool get isIoMacOS => Platform.isMacOS;
