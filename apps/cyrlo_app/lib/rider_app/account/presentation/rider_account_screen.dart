import 'package:flutter/material.dart';

import '../../../features/auth/application/signup_draft.dart';
import '../../../shared/account/presentation/account_screen.dart';

class RiderAccountScreen extends StatelessWidget {
  const RiderAccountScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return const AccountScreen(role: RideRole.rider);
  }
}
