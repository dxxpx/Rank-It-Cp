import 'package:flutter/material.dart';

Future<void> showSuccessSnackBar({
  required BuildContext context,
  required String message,
  Duration duration = const Duration(seconds: 2),
}) async {
  final controller = ScaffoldMessenger.of(context).showSnackBar(
    SnackBar(
      behavior: SnackBarBehavior.floating,
      elevation: 8,
      backgroundColor: Colors.green.shade600,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      margin: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 16),
      duration: const Duration(seconds: 2),
      content: Row(
        children: [
          const Icon(Icons.check_circle, color: Colors.white),
          const SizedBox(width: 10),
          Expanded(child: Text(message, style: const TextStyle(fontSize: 16))),
        ],
      ),
    ),
  );
  await controller.closed;
}
