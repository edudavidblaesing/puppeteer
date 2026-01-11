import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:flutter_contacts/flutter_contacts.dart';
import 'package:flutter/foundation.dart' show kIsWeb;

// Simple provider to manage selected interests (could be persisted later)
final selectedInterestsProvider = StateProvider<Set<String>>((ref) => {});

class OnboardingScreen extends ConsumerStatefulWidget {
  const OnboardingScreen({super.key});

  @override
  ConsumerState<OnboardingScreen> createState() => _OnboardingScreenState();
}

class _OnboardingScreenState extends ConsumerState<OnboardingScreen> {
  final List<String> _interests = [
    '🎵 Live Music',
    '🎨 Art & Culture',
    '🍸 Nightlife',
    '🍜 Foodie',
    '📸 Photography',
    '🧘 Wellness',
    '⛺ Outdoors',
    '🎮 Gaming',
    '💃 Dance',
    '🎭 Theatre',
  ];

  @override
  Widget build(BuildContext context) {
    final selectedInterests = ref.watch(selectedInterestsProvider);

    return Scaffold(
      backgroundColor: Colors.black,
      body: Stack(
        children: [
          // Background Mesh
          Positioned(
            top: -100,
            left: -100,
            child: Container(
              width: 300,
              height: 300,
              decoration: BoxDecoration(
                  color: Colors.blueAccent.withOpacity(0.15),
                  shape: BoxShape.circle,
                  boxShadow: [
                    BoxShadow(
                        color: Colors.blue.withOpacity(0.2), blurRadius: 100)
                  ]),
            ),
          ),
          Positioned(
            bottom: -50,
            right: -50,
            child: Container(
              width: 250,
              height: 250,
              decoration: BoxDecoration(
                  color: Colors.purpleAccent.withOpacity(0.15),
                  shape: BoxShape.circle,
                  boxShadow: [
                    BoxShadow(
                        color: Colors.purple.withOpacity(0.2), blurRadius: 100)
                  ]),
            ),
          ),

          SafeArea(
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 24.0),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // Header
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      IconButton(
                        icon: const Icon(Icons.arrow_back, color: Colors.white),
                        onPressed: () => context.pop(),
                      ),
                      TextButton(
                        onPressed: () => context.pop(),
                        child: const Text('Skip',
                            style: TextStyle(color: Colors.grey)),
                      ),
                    ],
                  ),
                  const SizedBox(height: 20),

                  // Title
                  const Text(
                    'No pressure,\nno circus.',
                    style: TextStyle(
                      color: Colors.white,
                      fontFamily:
                          'Outfit', // Assuming font family or generic sans
                      fontSize: 40,
                      fontWeight: FontWeight.bold,
                      height: 1.1,
                    ),
                  ).animate().fadeIn().slideX(begin: -0.1),

                  const Text(
                    'no circus.',
                    style: TextStyle(
                      color: Colors.blueAccent,
                      fontSize: 40,
                      fontWeight: FontWeight.bold,
                      height: 1.1,
                    ),
                  ).animate().fadeIn(delay: 200.ms).slideX(begin: -0.1)
                  // Actually the user image shows "No pressure, no circus." where "No pressure," is black (white in dark mode) and "no circus." is blue.
                  // I'll adjust to match the visual better in a RichText or separate widgets.
                  ,

                  const SizedBox(height: 24),
                  const Text(
                    "Just good vibes. Pick a few things you're into, and we'll connect you with the right crowd.",
                    style: TextStyle(color: Colors.grey, fontSize: 16),
                  ).animate().fadeIn(delay: 400.ms),

                  const SizedBox(height: 40),

                  // Interests Grid
                  Expanded(
                    child: SingleChildScrollView(
                      child: Wrap(
                        spacing: 12,
                        runSpacing: 12,
                        children: _interests.map((interest) {
                          final isSelected =
                              selectedInterests.contains(interest);
                          return GestureDetector(
                            onTap: () {
                              final notifier =
                                  ref.read(selectedInterestsProvider.notifier);
                              if (isSelected) {
                                notifier.state = {...selectedInterests}
                                  ..remove(interest);
                              } else {
                                notifier.state = {
                                  ...selectedInterests,
                                  interest
                                };
                              }
                            },
                            child: AnimatedContainer(
                              duration: 200.ms,
                              padding: const EdgeInsets.symmetric(
                                  horizontal: 20, vertical: 12),
                              decoration: BoxDecoration(
                                color: isSelected
                                    ? Colors.blueAccent
                                    : Colors.white.withOpacity(0.05),
                                borderRadius: BorderRadius.circular(30),
                                border: Border.all(
                                  color: isSelected
                                      ? Colors.blueAccent
                                      : Colors.white10,
                                ),
                                boxShadow: isSelected
                                    ? [
                                        BoxShadow(
                                            color: Colors.blueAccent
                                                .withOpacity(0.4),
                                            blurRadius: 12,
                                            offset: const Offset(0, 4))
                                      ]
                                    : [],
                              ),
                              child: Text(
                                interest,
                                style: TextStyle(
                                  color: isSelected
                                      ? Colors.white
                                      : Colors.white70,
                                  fontWeight: FontWeight.w600,
                                ),
                              ),
                            ),
                          );
                        }).toList(),
                      ),
                    ),
                  ),

                  // Connect Contacts Button
                  const SizedBox(height: 20),
                  SizedBox(
                    width: double.infinity,
                    child: ElevatedButton.icon(
                      onPressed: kIsWeb
                          ? () {
                              ScaffoldMessenger.of(context).showSnackBar(
                                const SnackBar(
                                    content: Text(
                                        'Connecting contacts is only available on iOS and Android app.')),
                              );
                            }
                          : _connectContacts,
                      icon: const Icon(Icons.contacts, color: Colors.white),
                      label: const Text('Connect Contacts',
                          style: TextStyle(
                              fontSize: 18, fontWeight: FontWeight.bold)),
                      style: ElevatedButton.styleFrom(
                        backgroundColor:
                            kIsWeb ? Colors.grey[800] : Colors.blueAccent,
                        foregroundColor: kIsWeb ? Colors.white38 : Colors.white,
                        padding: const EdgeInsets.symmetric(vertical: 18),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(30),
                        ),
                        elevation: 0,
                        shadowColor: Colors.blueAccent.withOpacity(0.5),
                      ),
                    ).animate().fadeIn(delay: 600.ms).slideY(begin: 0.2),
                  ),

                  const SizedBox(height: 16),
                  Center(
                    child: TextButton(
                      onPressed: () => context.pop(),
                      child: const Text("I'll do this later",
                          style: TextStyle(color: Colors.grey)),
                    ),
                  ),
                  const SizedBox(height: 20),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Future<void> _connectContacts() async {
    try {
      if (await FlutterContacts.requestPermission()) {
        final contacts =
            await FlutterContacts.getContacts(withProperties: true);
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
                content: Text(
                    'Found ${contacts.length} contacts! (Integration mock)')),
          );
          // Here we would typically upload/sync hashes of contacts to find matches
        }
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Error accessing contacts: $e')),
        );
      }
    }
  }
}
