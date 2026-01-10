import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:pinput/pinput.dart';
import 'dart:async';
import '../../core/widgets.dart';
import 'auth_controller.dart';

class VerificationScreen extends ConsumerStatefulWidget {
  final String email;

  const VerificationScreen({super.key, required this.email});

  @override
  ConsumerState<VerificationScreen> createState() => _VerificationScreenState();
}

class _VerificationScreenState extends ConsumerState<VerificationScreen> {
  final TextEditingController _pinController = TextEditingController();
  Timer? _timer;
  int _start = 60;
  bool _canResend = false;

  @override
  void initState() {
    super.initState();
    startTimer();
  }

  void startTimer() {
    _start = 60;
    _canResend = false;
    _timer = Timer.periodic(
      const Duration(seconds: 1),
      (Timer timer) {
        if (_start == 0) {
          setState(() {
            timer.cancel();
            _canResend = true;
          });
        } else {
          setState(() {
            _start--;
          });
        }
      },
    );
  }

  @override
  void dispose() {
    _timer?.cancel();
    _pinController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final authState = ref.watch(authControllerProvider);
    final isLoading = authState is AsyncLoading;

    final defaultPinTheme = PinTheme(
      width: 56,
      height: 56,
      textStyle: const TextStyle(
          fontSize: 20, color: Colors.white, fontWeight: FontWeight.w600),
      decoration: BoxDecoration(
        color: Colors.grey[900],
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: Colors.grey[800]!),
      ),
    );

    return Scaffold(
      backgroundColor: Colors.black,
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24.0),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              IconButton(
                icon: const Icon(Icons.arrow_back, color: Colors.white),
                onPressed: () => context.pop(),
              ),
              const SizedBox(height: 32),
              const Text(
                'Verify Email',
                style: TextStyle(
                  fontSize: 32,
                  fontWeight: FontWeight.bold,
                  color: Colors.white,
                  letterSpacing: -1,
                ),
              ).animate().fadeIn().moveY(begin: 20),
              const SizedBox(height: 12),
              Text(
                'Enter the code sent to ${widget.email}',
                style: TextStyle(color: Colors.grey[400], fontSize: 16),
              ).animate().fadeIn(delay: 100.ms).moveY(begin: 20),
              const SizedBox(height: 40),
              Center(
                child: Pinput(
                  controller: _pinController,
                  length: 6,
                  defaultPinTheme: defaultPinTheme,
                  focusedPinTheme: defaultPinTheme.copyWith(
                    decoration: defaultPinTheme.decoration!.copyWith(
                      border: Border.all(color: Theme.of(context).primaryColor),
                    ),
                  ),
                  onCompleted: (pin) => _verify(pin),
                ),
              ).animate().fadeIn(delay: 200.ms).scale(),
              const SizedBox(height: 40),
              GradientButton(
                onPressed:
                    isLoading ? null : () => _verify(_pinController.text),
                isLoading: isLoading,
                child: const Text('Verify'),
              ).animate().fadeIn(delay: 300.ms).moveY(begin: 20),
              const SizedBox(height: 24),
              Center(
                child: TextButton(
                  onPressed: _canResend
                      ? () async {
                          // Resend logic
                          final success = await ref
                              .read(authControllerProvider.notifier)
                              .resendVerificationCode(widget.email);
                          if (success) {
                            if (mounted) {
                              ScaffoldMessenger.of(context).showSnackBar(
                                const SnackBar(
                                    content: Text('Code resent!'),
                                    backgroundColor: Colors.green),
                              );
                              setState(() {
                                startTimer();
                              });
                            }
                          }
                        }
                      : null,
                  child: Text(
                    _canResend ? 'Resend Code' : 'Resend in ${_start}s',
                    style: TextStyle(
                      color: _canResend
                          ? Theme.of(context).primaryColor
                          : Colors.grey,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                ),
              ).animate().fadeIn(delay: 400.ms),
            ],
          ),
        ),
      ),
    );
  }

  Future<void> _verify(String code) async {
    if (code.length != 6) return;

    final success = await ref.read(authControllerProvider.notifier).verifyEmail(
          widget.email,
          code,
        );

    if (success && mounted) {
      context.go('/find-friends');
    } else if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            ref.read(authControllerProvider).error?.toString() ??
                'Verification failed',
            style: const TextStyle(color: Colors.white),
          ),
          backgroundColor: Colors.redAccent,
        ),
      );
    }
  }
}
