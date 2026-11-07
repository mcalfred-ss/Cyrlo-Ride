import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../core/constants/app_colors.dart';
import '../../core/utils/phone_numbers.dart';

class GhanaPhoneField extends StatefulWidget {
  const GhanaPhoneField({
    super.key,
    required this.controller,
    this.label = 'Phone number',
    this.fieldKey = const Key('ghana-phone-input'),
  });

  final TextEditingController controller;
  final String label;
  final Key fieldKey;

  @override
  State<GhanaPhoneField> createState() => _GhanaPhoneFieldState();
}

class _GhanaPhoneFieldState extends State<GhanaPhoneField> {
  final _focus = FocusNode();

  @override
  void initState() {
    super.initState();
    _focus.addListener(() => setState(() {}));
  }

  @override
  void dispose() {
    _focus.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final textStyle = Theme.of(context).textTheme.bodyLarge?.copyWith(
      color: AppColors.textPrimary,
      fontWeight: FontWeight.w700,
      height: 1.2,
    );

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(
          widget.label,
          style: Theme.of(context).textTheme.labelLarge?.copyWith(
            color: AppColors.textSecondary,
            fontWeight: FontWeight.w700,
          ),
        ),
        const SizedBox(height: 8),
        AnimatedContainer(
          duration: const Duration(milliseconds: 180),
          height: 56,
          padding: const EdgeInsets.symmetric(horizontal: 16),
          decoration: BoxDecoration(
            color: AppColors.field,
            borderRadius: BorderRadius.circular(28),
            border: Border.all(
              color: _focus.hasFocus ? AppColors.yellow : AppColors.border,
              width: _focus.hasFocus ? 1.6 : 1,
            ),
          ),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.center,
            children: [
              Text(
                PhoneNumbers.ghanaDialPrefix,
                style: textStyle?.copyWith(fontWeight: FontWeight.w800),
              ),
              const SizedBox(width: 12),
              Container(width: 1, height: 22, color: AppColors.border),
              const SizedBox(width: 12),
              Expanded(
                child: TextField(
                  key: widget.fieldKey,
                  focusNode: _focus,
                  controller: widget.controller,
                  keyboardType: TextInputType.phone,
                  textInputAction: TextInputAction.done,
                  cursorColor: AppColors.yellow,
                  textAlignVertical: TextAlignVertical.center,
                  inputFormatters: [
                    FilteringTextInputFormatter.allow(RegExp(r'[\d+\s-]')),
                    LengthLimitingTextInputFormatter(16),
                  ],
                  style: textStyle,
                  decoration: InputDecoration(
                    isCollapsed: true,
                    hintText: '24 412 3456',
                    filled: false,
                    fillColor: Colors.transparent,
                    border: InputBorder.none,
                    enabledBorder: InputBorder.none,
                    focusedBorder: InputBorder.none,
                    contentPadding: EdgeInsets.zero,
                    hintStyle: textStyle?.copyWith(
                      color: AppColors.textSecondary,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}
