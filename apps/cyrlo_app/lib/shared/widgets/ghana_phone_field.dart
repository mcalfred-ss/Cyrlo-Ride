import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../core/constants/app_colors.dart';
import '../../core/utils/phone_numbers.dart';

class GhanaPhoneField extends StatelessWidget {
  const GhanaPhoneField({
    super.key,
    required this.controller,
    this.label = 'Phone number',
  });

  final TextEditingController controller;
  final String label;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          label,
          style: Theme.of(context).textTheme.labelLarge?.copyWith(
            color: AppColors.textSecondary,
            fontWeight: FontWeight.w700,
          ),
        ),
        const SizedBox(height: 8),
        TextField(
          key: const Key('ghana-phone-input'),
          controller: controller,
          keyboardType: TextInputType.phone,
          textInputAction: TextInputAction.done,
          cursorColor: AppColors.yellow,
          inputFormatters: [
            FilteringTextInputFormatter.allow(RegExp(r'[\d+\s-]')),
            LengthLimitingTextInputFormatter(16),
          ],
          style: Theme.of(context).textTheme.bodyMedium?.copyWith(
            color: AppColors.textPrimary,
            fontWeight: FontWeight.w700,
          ),
          decoration: InputDecoration(
            hintText: '24 412 3456',
            filled: true,
            fillColor: AppColors.field,
            prefixIcon: Padding(
              padding: const EdgeInsets.only(left: 14, right: 8),
              child: Text(
                PhoneNumbers.ghanaDialPrefix,
                style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                  color: AppColors.textPrimary,
                  fontWeight: FontWeight.w800,
                ),
              ),
            ),
            prefixIconConstraints: const BoxConstraints(minWidth: 72, minHeight: 48),
          ),
        ),
      ],
    );
  }
}
