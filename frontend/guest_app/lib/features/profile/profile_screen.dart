import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:flutter_animate/flutter_animate.dart';
import '../auth/session_provider.dart';

class ProfileScreen extends ConsumerStatefulWidget {
  const ProfileScreen({super.key});

  @override
  ConsumerState<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends ConsumerState<ProfileScreen> {
  @override
  Widget build(BuildContext context) {
    final sessionState = ref.watch(sessionProvider);
    final isLoggedIn = sessionState.value != null;
    final isLoading = sessionState.isLoading;

    if (isLoading) {
      return const Scaffold(
          backgroundColor: Colors.black,
          body: Center(child: CircularProgressIndicator()));
    }

    return Scaffold(
      backgroundColor: Colors.black,
      body: Stack(
        children: [
          // Background Gradient Mesh
          Positioned(
            top: -100,
            right: -100,
            child: Container(
              width: 300,
              height: 300,
              decoration: BoxDecoration(
                  color: Colors.purpleAccent.withOpacity(0.2),
                  shape: BoxShape.circle,
                  boxShadow: [
                    BoxShadow(
                        color: Colors.purple.withOpacity(0.3), blurRadius: 100)
                  ]),
            ),
          ),

          SafeArea(
            child: Column(
              children: [
                // Custom App Bar
                Padding(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                  child: Row(
                    children: [
                      IconButton(
                        icon: const Icon(Icons.arrow_back, color: Colors.white),
                        onPressed: () => context.pop(),
                      ),
                      const Spacer(),
                      const Text('Profile',
                          style: TextStyle(
                              color: Colors.white,
                              fontSize: 18,
                              fontWeight: FontWeight.bold)),
                      const Spacer(),
                      if (isLoggedIn)
                        IconButton(
                          icon: const Icon(Icons.settings, color: Colors.white),
                          onPressed: () => context.push('/settings'),
                        )
                      else
                        const SizedBox(width: 48),
                    ],
                  ),
                ),

                Expanded(
                  child: isLoggedIn ? _buildUserProfile() : _buildGuestView(),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildGuestView() {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32.0),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Container(
              padding: const EdgeInsets.all(24),
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: Colors.white.withOpacity(0.05),
                border: Border.all(color: Colors.white24),
              ),
              child: const Icon(Icons.person_outline,
                  size: 64, color: Colors.white70),
            ).animate().scale(),
            const SizedBox(height: 32),
            Text(
              'Join the Party!',
              style: Theme.of(context)
                  .textTheme
                  .headlineMedium
                  ?.copyWith(color: Colors.white, fontWeight: FontWeight.bold),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 12),
            const Text(
              'Login or form your crew to RSVP for events and chat with friends.',
              textAlign: TextAlign.center,
              style: TextStyle(color: Colors.grey, fontSize: 16),
            ),
            const SizedBox(height: 48),
            _GlassyButton(
              label: "Login",
              icon: Icons.login,
              onTap: () => context.push('/login'),
              isPrimary: true,
            ),
            const SizedBox(height: 16),
            _GlassyButton(
              label: "Create Account",
              icon: Icons.person_add_outlined,
              onTap: () => context.push('/register'),
              isPrimary: false,
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildUserProfile() {
    final user = ref.watch(sessionProvider).value!;

    return SingleChildScrollView(
      padding: const EdgeInsets.symmetric(horizontal: 24),
      child: Column(
        children: [
          const SizedBox(height: 20),
          // Avatar with Glow
          Container(
            padding: const EdgeInsets.all(4),
            decoration: BoxDecoration(
                shape: BoxShape.circle,
                gradient: const LinearGradient(
                    colors: [Colors.purpleAccent, Colors.blueAccent]),
                boxShadow: [
                  BoxShadow(
                      color: Colors.purpleAccent.withOpacity(0.4),
                      blurRadius: 20,
                      spreadRadius: 2)
                ]),
            child: CircleAvatar(
              radius: 60,
              backgroundImage: NetworkImage(
                  user.avatarUrl ?? 'https://i.pravatar.cc/300?u=${user.id}'),
              onBackgroundImageError: (_, __) {},
              child: user.avatarUrl == null
                  ? const Icon(Icons.person, size: 60, color: Colors.white54)
                  : null,
              backgroundColor: Colors.black,
            ),
          ).animate().fadeIn().slideY(begin: 0.2),

          const SizedBox(height: 24),
          Text(user.fullName.isNotEmpty ? user.fullName : user.username,
              style: const TextStyle(
                  color: Colors.white,
                  fontSize: 24,
                  fontWeight: FontWeight.bold)),
          Text(
            '@${user.username}',
            style: const TextStyle(color: Colors.grey, fontSize: 16),
          ),

          const SizedBox(height: 32),

          if (user.interests.isNotEmpty)
            Wrap(
              spacing: 8,
              runSpacing: 8,
              alignment: WrapAlignment.center,
              children: user.interests
                  .map((tag) => Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 16, vertical: 8),
                        decoration: BoxDecoration(
                          color: Colors.white10,
                          borderRadius: BorderRadius.circular(20),
                          border: Border.all(color: Colors.white12),
                        ),
                        child: Text(tag,
                            style: const TextStyle(
                                color: Colors.white70, fontSize: 13)),
                      ))
                  .toList(),
            ),

          const SizedBox(height: 40),

          // Menu Items
          _ProfileMenuItem(
            icon: Icons.event,
            title: "My RSVPs",
            subtitle: "Events you are going to or interested in",
            onTap: () => context.push('/my-events'),
          ).animate().fadeIn(delay: 100.ms),

          const SizedBox(height: 16),

          _ProfileMenuItem(
            icon: Icons.interests,
            title: "Interests",
            subtitle: "Manage your passions",
            onTap: () => context.push('/onboarding'),
          ).animate().fadeIn(delay: 150.ms),

          const SizedBox(height: 16),

          _ProfileMenuItem(
            icon: Icons.group,
            title: "Friends",
            subtitle: "Manage your crew",
            onTap: () => context.push('/friends'),
          ).animate().fadeIn(delay: 200.ms),

          const SizedBox(height: 40),

          TextButton.icon(
            onPressed: () async {
              await ref.read(sessionProvider.notifier).logout();
              if (context.mounted) {
                ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
                    content: Text('Logged out'),
                    backgroundColor: Colors.redAccent));
              }
            },
            icon: const Icon(Icons.logout, color: Colors.redAccent),
            label:
                const Text("Logout", style: TextStyle(color: Colors.redAccent)),
          )
        ],
      ),
    );
  }
}

class _GlassyButton extends StatelessWidget {
  final String label;
  final IconData icon;
  final VoidCallback onTap;
  final bool isPrimary;

  const _GlassyButton(
      {required this.label,
      required this.icon,
      required this.onTap,
      this.isPrimary = false});

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 16),
        decoration: BoxDecoration(
            color:
                isPrimary ? Theme.of(context).primaryColor : Colors.transparent,
            borderRadius: BorderRadius.circular(30),
            border: isPrimary ? null : Border.all(color: Colors.white30),
            boxShadow: isPrimary
                ? [
                    BoxShadow(
                        color: Theme.of(context).primaryColor.withOpacity(0.4),
                        blurRadius: 16)
                  ]
                : null),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(icon, color: Colors.white, size: 20),
            const SizedBox(width: 12),
            Text(label,
                style: const TextStyle(
                    color: Colors.white,
                    fontWeight: FontWeight.bold,
                    fontSize: 16)),
          ],
        ),
      ),
    );
  }
}

class _ProfileMenuItem extends StatelessWidget {
  final IconData icon;
  final String title;
  final String subtitle;
  final VoidCallback onTap;

  const _ProfileMenuItem(
      {required this.icon,
      required this.title,
      required this.subtitle,
      required this.onTap});

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: Colors.white.withOpacity(0.05),
          borderRadius: BorderRadius.circular(20),
          border: Border.all(color: Colors.white10),
        ),
        child: Row(
          children: [
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: Colors.white10,
                shape: BoxShape.circle,
              ),
              child: Icon(icon, color: Colors.white),
            ),
            const SizedBox(width: 16),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(title,
                      style: const TextStyle(
                          color: Colors.white,
                          fontWeight: FontWeight.bold,
                          fontSize: 16)),
                  const SizedBox(height: 2),
                  Text(subtitle,
                      style: const TextStyle(color: Colors.grey, fontSize: 12)),
                ],
              ),
            ),
            const Icon(Icons.arrow_forward_ios,
                color: Colors.white24, size: 16),
          ],
        ),
      ),
    );
  }
}
