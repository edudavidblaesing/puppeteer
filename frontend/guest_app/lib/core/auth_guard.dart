import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../features/auth/session_provider.dart';

class AuthGuard {
  static Future<bool> ensureLoggedIn(BuildContext context, WidgetRef ref) async {
    final session = ref.read(sessionProvider);
    
    if (session.value != null) {
      return true;
    }

    // Directly navigate to login instead of showing a dialog
    if (context.mounted) {
      final didLogin = await context.push<bool>('/login');
      // Check if session is present after returning
      if (didLogin == true || ref.read(sessionProvider).value != null) {
        return true;
      }
    }

    return false;
  }
}
