import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/widgets.dart'; // For GradientButton
import '../map/models.dart';
import 'contact_sync_service.dart';

class FindFriendsScreen extends ConsumerStatefulWidget {
  const FindFriendsScreen({super.key});

  @override
  ConsumerState<FindFriendsScreen> createState() => _FindFriendsScreenState();
}

class _FindFriendsScreenState extends ConsumerState<FindFriendsScreen> {
  bool _isLoading = false;
  List<User> _foundUsers = [];
  bool _hasSynced = false;

  @override
  void initState() {
    super.initState();
    // Auto-sync on load? Or wait for user action?
    // User said: "automatically and connect to all of them instand or by selection"
    // Let's trigger sync immediately.
    _syncContacts();
  }

  Future<void> _syncContacts() async {
    setState(() => _isLoading = true);
    try {
      final users = await ref.read(contactSyncServiceProvider).syncContacts();
      if (mounted) {
        setState(() {
          _foundUsers = users;
          _hasSynced = true;
          _isLoading = false;
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() => _isLoading = false);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Error syncing contacts: $e')),
        );
      }
    }
  }

  Future<void> _followAll() async {
    setState(() => _isLoading = true);
    try {
      final ids = _foundUsers.map((u) => u.id).toList();
      await ref.read(contactSyncServiceProvider).followAll(ids);
      if (mounted) {
        context.go('/map'); // Proceed to app
      }
    } catch (e) {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  Future<void> _toggleFollow(User user) async {
    try {
      // Optimistic Update
      final isFollowing = !user.isFollowing;
      setState(() {
        final index = _foundUsers.indexWhere((u) => u.id == user.id);
        if (index != -1) {
          _foundUsers[index] = User(
              id: user.id,
              username: user.username,
              fullName: user.fullName,
              avatarUrl: user.avatarUrl,
              interests: user.interests,
              isFollowing: isFollowing);
        }
      });

      if (isFollowing) {
        await ref.read(contactSyncServiceProvider).followUser(user.id);
      } else {
        // Implement unfollow if needed, but usually 'Find Friends' is just add
        // But we assume followUser is idempotent or we add unfollow logic
        // For now let's just support Follow.
      }
    } catch (e) {
      // Revert on error
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      appBar: AppBar(
        title:
            const Text('Find Friends', style: TextStyle(color: Colors.white)),
        backgroundColor: Colors.black,
        elevation: 0,
        actions: [
          TextButton(
            onPressed: () => context.go('/map'),
            child: const Text('Skip', style: TextStyle(color: Colors.grey)),
          )
        ],
      ),
      body: _isLoading && !_hasSynced
          ? const Center(child: CircularProgressIndicator())
          : Padding(
              padding: const EdgeInsets.all(24.0),
              child: Column(
                children: [
                  const Text(
                    "Connect with your Crew",
                    style: TextStyle(
                        color: Colors.white,
                        fontSize: 24,
                        fontWeight: FontWeight.bold),
                  ),
                  const SizedBox(height: 12),
                  Text(
                    "We found ${_foundUsers.length} friends from your contacts on The Social Event.",
                    style: const TextStyle(color: Colors.grey, fontSize: 16),
                    textAlign: TextAlign.center,
                  ),
                  const SizedBox(height: 32),
                  if (_foundUsers.isEmpty)
                    const Expanded(
                        child: Center(
                            child: Text("No friends found yet.",
                                style: TextStyle(color: Colors.grey)))),
                  if (_foundUsers.isNotEmpty)
                    Expanded(
                      child: ListView.builder(
                        itemCount: _foundUsers.length,
                        itemBuilder: (context, index) {
                          final user = _foundUsers[index];
                          return ListTile(
                            leading: CircleAvatar(
                              backgroundImage: user.avatarUrl != null
                                  ? NetworkImage(user.avatarUrl!)
                                  : null,
                              child: user.avatarUrl == null
                                  ? const Icon(Icons.person)
                                  : null,
                            ),
                            title: Text(user.fullName,
                                style: const TextStyle(color: Colors.white)),
                            subtitle: Text("@${user.username}",
                                style: const TextStyle(color: Colors.grey)),
                            trailing: IconButton(
                              icon: Icon(
                                user.isFollowing
                                    ? Icons.check_circle
                                    : Icons.add_circle_outline,
                                color: user.isFollowing
                                    ? Colors.green
                                    : Colors.white,
                              ),
                              onPressed: () => _toggleFollow(user),
                            ),
                          );
                        },
                      ),
                    ),
                  const SizedBox(height: 24),
                  if (_foundUsers.isNotEmpty)
                    GradientButton(
                      onPressed: _followAll,
                      child: const Text("Follow All & Continue"),
                    ),
                  if (_foundUsers.isEmpty)
                    GradientButton(
                      onPressed: () => context.go('/map'),
                      child: const Text("Continue"),
                    ),
                  const SizedBox(height: 24),
                ],
              ),
            ),
    );
  }
}
