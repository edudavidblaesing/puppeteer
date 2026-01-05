
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
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
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    }

    return Scaffold(
      appBar: AppBar(
        title: const Text('Profile'),
        backgroundColor: Colors.black,
      ),
      body: Padding(
        padding: const EdgeInsets.all(24.0),
        child: isLoggedIn ? _buildUserProfile() : _buildGuestView(),
      ),
    );
  }

  Widget _buildGuestView() {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          const Icon(Icons.person_outline, size: 80, color: Colors.white54),
          // ... rest same ...
          const SizedBox(height: 24),
          Text(
            'Join the Party!',
            style: Theme.of(context).textTheme.headlineMedium,
          ),
          const SizedBox(height: 12),
          const Text(
            'Login or register to RSVP for events, chat with friends, and more.',
            textAlign: TextAlign.center,
            style: TextStyle(color: Colors.white70),
          ),
          const SizedBox(height: 48),
          SizedBox(
            width: double.infinity,
            height: 50,
            child: ElevatedButton(
              onPressed: () => context.push('/login'),
              style: ElevatedButton.styleFrom(
                backgroundColor: Theme.of(context).primaryColor,
              ),
              child: const Text('Login', style: TextStyle(color: Colors.white, fontSize: 16)),
            ),
          ),
          const SizedBox(height: 16),
          SizedBox(
            width: double.infinity,
            height: 50,
            child: OutlinedButton(
              onPressed: () => context.push('/register'),
              style: OutlinedButton.styleFrom(
                side: BorderSide(color: Theme.of(context).primaryColor),
              ),
              child: const Text('Create Account', style: TextStyle(fontSize: 16)),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildUserProfile() {
    final user = ref.watch(sessionProvider).value!;
    
    // api variable removed as it was unused
    
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          CircleAvatar(
            radius: 50,
            backgroundImage: NetworkImage(user.avatarUrl ?? 'https://i.pravatar.cc/300'),
            onBackgroundImageError: (_, __) {},
            child: user.avatarUrl == null ? const Icon(Icons.person, size: 50) : null,
          ),
          const SizedBox(height: 24),
          Text(
            user.fullName.isNotEmpty ? user.fullName : user.username, 
            style: Theme.of(context).textTheme.headlineSmall
          ),
           const SizedBox(height: 8),
          Text(
            '@${user.username}',
            style: const TextStyle(color: Colors.white54),
          ),
          const SizedBox(height: 48),
          
          ListTile(
            leading: const Icon(Icons.event),
            title: const Text('My RSVPS'),
            trailing: const Icon(Icons.arrow_forward_ios, size: 16),
             onTap: () {
               context.push('/my-events');
             },
          ),
          const Divider(color: Colors.white10),
          ListTile(
            leading: const Icon(Icons.settings),
            title: const Text('Settings'),
             trailing: const Icon(Icons.arrow_forward_ios, size: 16),
             onTap: () => context.push('/settings'),
          ),
          
          const Spacer(),
          
          SizedBox(
            width: double.infinity,
            height: 50,
            child: OutlinedButton(
              onPressed: () async {
                 await ref.read(sessionProvider.notifier).logout();
                 ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Logged out')));
              },
              style: OutlinedButton.styleFrom(
                foregroundColor: Colors.redAccent,
                side: const BorderSide(color: Colors.redAccent),
              ),
              child: const Text('Logout'),
            ),
          ),
        ],
      ),
    );
  }
}
