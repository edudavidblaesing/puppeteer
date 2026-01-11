import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'auth_controller.dart';
import '../../core/widgets.dart';
import 'session_provider.dart';

class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({super.key});

  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends ConsumerState<LoginScreen> {
  final _emailController = TextEditingController();
  final _passwordController = TextEditingController();
  final _formKey = GlobalKey<FormState>();

  @override
  Widget build(BuildContext context) {
    final authState = ref.watch(authControllerProvider);
    final isLoading = authState.isLoading;

    ref.listen(authControllerProvider, (previous, next) {
      if (next.hasError) {
        String errorMessage = 'An unexpected error occurred';
        final error = next.error;

        // Simple error parsing (Dio import not strictly needed if we check runtime type string or dynamic, but better to be explicit if we can.
        // Since we didn't import Dio in this file, let's just handle it generically or import it.
        // Let's assume generic object inspection for now to avoid adding imports if not necessary,
        // BUT adding 'import package:dio/dio.dart' is safer.
        // Let's use dynamic inspection to catch 'DioException' by string or property if we want to avoid import,
        // but let's just use the message.

        // Actually, the user wants BETTER messages.
        if (error.toString().contains('connection error') ||
            error.toString().contains('connection refused')) {
          errorMessage =
              "Unable to connect to server. Please check your internet connection or server status.";
        } else if (error.toString().contains('401')) {
          errorMessage = "Invalid email or password.";
        } else if (error.toString().contains('409')) {
          errorMessage = "User already exists.";
        } else {
          // Try to extract readable message if it's a clean exception
          errorMessage = error.toString().replaceAll('Exception: ', '');
          // If it sends [connection error]...
          if (errorMessage.contains('DioException')) {
            if (errorMessage.contains('connection')) {
              errorMessage = "Network connection failed. Please try again.";
            } else {
              errorMessage = "Network error occurred. Please try again.";
            }
          }
        }

        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(errorMessage),
            backgroundColor: Colors.redAccent,
            behavior: SnackBarBehavior.floating,
          ),
        );
      }
    });

    return Scaffold(
      backgroundColor: Colors.black, // Ensure distinct dark background
      body: Stack(
        children: [
          // Background Gradient Mesh (Subtle)
          Positioned(
            top: -100,
            right: -100,
            child: Container(
              width: 300,
              height: 300,
              decoration: BoxDecoration(
                color: Theme.of(context).primaryColor.withOpacity(0.2),
                shape: BoxShape.circle,
                // filter: null, // Removed invalid property
              ),
            ),
          ),
          SafeArea(
            child: Center(
              child: SingleChildScrollView(
                padding: const EdgeInsets.all(24.0),
                child: Form(
                  key: _formKey,
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      // Icon / Logo
                      const Icon(
                        Icons.nightlife,
                        size: 64,
                        color: Colors.white,
                      )
                          .animate()
                          .scale(duration: 500.ms, curve: Curves.easeOutBack),

                      const SizedBox(height: 32),

                      Text(
                        'Welcome Back',
                        style:
                            Theme.of(context).textTheme.displaySmall?.copyWith(
                                  color: Colors.white,
                                  fontWeight: FontWeight.bold,
                                ),
                        textAlign: TextAlign.center,
                      ).animate().fadeIn(delay: 200.ms).moveY(begin: 20),

                      const SizedBox(height: 8),

                      Text(
                        'Sign in to continue',
                        style: Theme.of(context).textTheme.bodyLarge?.copyWith(
                              color: Colors.grey[400],
                            ),
                        textAlign: TextAlign.center,
                      ).animate().fadeIn(delay: 300.ms).moveY(begin: 20),

                      const SizedBox(height: 48),

                      CustomTextField(
                        controller: _emailController,
                        hintText: 'Email',
                        keyboardType: TextInputType.emailAddress,
                        prefixIcon: Icons.email_outlined,
                        validator: (v) =>
                            v!.isEmpty ? 'Email is required' : null,
                      ).animate().fadeIn(delay: 400.ms).moveX(begin: -20),

                      const SizedBox(height: 16),

                      CustomTextField(
                        controller: _passwordController,
                        hintText: 'Password',
                        obscureText: true,
                        prefixIcon: Icons.lock_outline,
                        validator: (v) =>
                            v!.isEmpty ? 'Password is required' : null,
                      ).animate().fadeIn(delay: 500.ms).moveX(begin: 20),

                      const SizedBox(height: 32),

                      GradientButton(
                        isLoading: isLoading,
                        onPressed: isLoading
                            ? null
                            : () async {
                                if (_formKey.currentState!.validate()) {
                                  final success = await ref
                                      .read(authControllerProvider.notifier)
                                      .login(_emailController.text,
                                          _passwordController.text);

                                  if (success && mounted) {
                                    // Refresh session explicitly
                                    await ref
                                        .read(sessionProvider.notifier)
                                        .restoreSession();

                                    if (context.canPop()) {
                                      context.pop(true);
                                    } else {
                                      context.go('/map');
                                    }
                                  }
                                }
                              },
                        child: const Text('Login'),
                      ).animate().fadeIn(delay: 600.ms).moveY(begin: 20),

                      const SizedBox(height: 24),

                      TextButton(
                        onPressed: () => context.push('/register'),
                        child: RichText(
                          text: TextSpan(
                            text: "Don't have an account? ",
                            style: TextStyle(color: Colors.grey[400]),
                            children: [
                              TextSpan(
                                text: 'Sign Up',
                                style: TextStyle(
                                  color: Theme.of(context).primaryColor,
                                  fontWeight: FontWeight.bold,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ).animate().fadeIn(delay: 700.ms),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
