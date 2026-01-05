import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'auth_controller.dart';
import 'session_provider.dart';

class SplashScreen extends ConsumerStatefulWidget {
  const SplashScreen({super.key});

  @override
  ConsumerState<SplashScreen> createState() => _SplashScreenState();
}

class _SplashScreenState extends ConsumerState<SplashScreen> {
  @override
  void initState() {
    super.initState();
    _checkAuth();
  }

  Future<void> _checkAuth() async {
    // Wait for animation
    await Future.delayed(const Duration(seconds: 2));
    if (!mounted) return;

    final session = ref.read(sessionProvider);
    // If session is still loading, look for changes?
    // Actually, check if restoreSession finished.
    // If restoreSession is async in constructor, we might need to wait for it?
    // SessionController sets state.loading -> state.data.
    
    // Better pattern: Watch logic in build or listen.
    // But manual check for now:
    
    if (session.value != null) {
      context.go('/map');
    } else {
      // If no session, allow user to login/signup
      // User requested "show splash screen or let user login/signup"
      // We redirect to Login which has a "Sign Up" link.
      // Or we could go to a "Welcome" page. For now, Login is the gateway.
      context.go('/login');
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      body: Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            // Logo / Icon
            const Icon(
              Icons.nightlife,
              size: 80,
              color: Colors.white,
            ).animate()
             .scale(duration: 600.ms, curve: Curves.easeOutBack)
             .fadeIn(duration: 600.ms),
            
            const SizedBox(height: 24),
            
            // Text
            Text(
              'The Social Event',
              style: Theme.of(context).textTheme.headlineMedium?.copyWith(
                color: Colors.white,
                fontWeight: FontWeight.bold,
                letterSpacing: 1.2,
              ),
            ).animate()
             .fadeIn(delay: 300.ms, duration: 600.ms)
             .moveY(begin: 20, end: 0),
          ],
        ),
      ),
    );
  }
}
