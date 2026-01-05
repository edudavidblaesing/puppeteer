import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'auth_controller.dart';
import '../../core/widgets.dart';

class RegisterScreen extends ConsumerStatefulWidget {
  const RegisterScreen({super.key});

  @override
  ConsumerState<RegisterScreen> createState() => _RegisterScreenState();
}

class _RegisterScreenState extends ConsumerState<RegisterScreen> {
  final _emailController = TextEditingController();
  final _passwordController = TextEditingController();
  final _usernameController = TextEditingController();
  final _nameController = TextEditingController();
  final _formKey = GlobalKey<FormState>();

  @override
  Widget build(BuildContext context) {
    final authState = ref.watch(authControllerProvider);
    final isLoading = authState.isLoading;

    ref.listen(authControllerProvider, (previous, next) {
      if (next.hasError) {
        // We handle errors inline in the button press usually, 
        // but this listener is a backup
      }
    });

    return Scaffold(
      backgroundColor: Colors.black,
      body: Stack(
        children: [
           // Decoration
          Positioned(
             top: -50,
             left: -50,
             child: Container(
               width: 200,
               height: 200,
               decoration: BoxDecoration(
                 color: Theme.of(context).primaryColor.withOpacity(0.15),
                 borderRadius: BorderRadius.circular(100),
               ),
             ),
          ),
          
          SafeArea(
            child: Padding(
              padding: const EdgeInsets.all(24.0),
              child: Column(
                children: [
                  // App Bar / Top Nav
                  Row(
                    children: [
                      IconButton(
                        onPressed: () => context.pop(),
                        icon: const Icon(Icons.arrow_back_ios, color: Colors.white),
                      ),
                      const Spacer(),
                      const Text(
                        'Create Account',
                        style: TextStyle(
                          color: Colors.white,
                          fontSize: 18,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                      const Spacer(),
                      const SizedBox(width: 40),
                    ],
                  ).animate().fadeIn(),

                  Expanded(
                    child: SingleChildScrollView(
                      child: Form(
                        key: _formKey,
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          children: [
                            const SizedBox(height: 32),
                            Text(
                              'Join the Experience',
                              style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                                color: Colors.white,
                                fontWeight: FontWeight.bold,
                              ),
                              textAlign: TextAlign.center,
                            ).animate().fadeIn(delay: 200.ms).moveY(begin: 20),
                            
                            const SizedBox(height: 40),
                            
                            CustomTextField(
                              controller: _nameController,
                              hintText: 'Full Name',
                              prefixIcon: Icons.person_outline,
                              validator: (v) => v!.isEmpty ? 'Name is required' : null,
                            ).animate().fadeIn(delay: 300.ms).moveX(begin: -20),
                            
                            const SizedBox(height: 16),
                            
                            CustomTextField(
                              controller: _usernameController,
                              hintText: 'Username',
                              prefixIcon: Icons.alternate_email,
                              validator: (v) => v!.isEmpty ? 'Username is required' : null,
                            ).animate().fadeIn(delay: 400.ms).moveX(begin: 20),
                            
                            const SizedBox(height: 16),
                            
                            CustomTextField(
                              controller: _emailController,
                              hintText: 'Email',
                              keyboardType: TextInputType.emailAddress,
                              prefixIcon: Icons.email_outlined,
                              validator: (v) => v!.isEmpty ? 'Email is required' : null,
                            ).animate().fadeIn(delay: 500.ms).moveX(begin: -20),
                            
                            const SizedBox(height: 16),
                            
                            CustomTextField(
                              controller: _passwordController,
                              hintText: 'Password',
                              obscureText: true,
                              prefixIcon: Icons.lock_outline,
                              validator: (v) => v!.isEmpty ? 'Password is required' : null,
                            ).animate().fadeIn(delay: 600.ms).moveX(begin: 20),
                            
                            const SizedBox(height: 40),
                            
                            GradientButton(
                              isLoading: isLoading,
                              onPressed: isLoading
                                  ? null
                                  : () async {
                                      if (_formKey.currentState!.validate()) {
                                        final success = await ref
                                            .read(authControllerProvider.notifier)
                                            .register(
                                              _emailController.text,
                                              _passwordController.text,
                                              _usernameController.text,
                                              _nameController.text,
                                            );
                                        if (success && mounted) {
                                          ScaffoldMessenger.of(context).showSnackBar(
                                            const SnackBar(
                                              content: Text('Verification code sent! Check your email.', style: TextStyle(color: Colors.white)),
                                              backgroundColor: Colors.green,
                                              behavior: SnackBarBehavior.floating,
                                            ),
                                          );
                                          // Give user a moment to see the message
                                          await Future.delayed(const Duration(milliseconds: 500));
                                          if (mounted) {
                                            context.push('/verify', extra: _emailController.text);
                                          }
                                        } else {
                                          if (mounted) {
                                            final error = ref.read(authControllerProvider).error;
                                            String errorMessage = 'Registration failed. Please try again.';
                                            
                                            // Extract meaningful message from DioException/API response if possible
                                            if (error != null) {
                                              String rawError = error.toString();
                                              if (rawError.contains('409')) {
                                                errorMessage = 'This email or username is already taken.';
                                              } else if (rawError.contains('Network')) {
                                                errorMessage = 'Network error. Check your connection.';
                                              } else {
                                                 // Try to clean up "Exception: ..."
                                                 errorMessage = rawError.replaceAll('Exception: ', '').replaceAll('DioException', '');
                                              }
                                            }
                                            
                                            ScaffoldMessenger.of(context).showSnackBar(
                                              SnackBar(
                                                content: Text(errorMessage, style: const TextStyle(color: Colors.white)),
                                                backgroundColor: Colors.redAccent,
                                                behavior: SnackBarBehavior.floating,
                                              ),
                                            );
                                          }
                                        }
                                      }
                                    },
                              child: const Text('Sign Up'),
                            ).animate().fadeIn(delay: 700.ms).moveY(begin: 20),
                            
                            const SizedBox(height: 24),
                          ],
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}
