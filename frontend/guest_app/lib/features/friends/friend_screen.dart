import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'friend_repository.dart';
import '../auth/user_model.dart';
import '../auth/session_provider.dart';
import 'package:go_router/go_router.dart';

class FriendScreen extends ConsumerStatefulWidget {
  const FriendScreen({super.key});

  @override
  ConsumerState<FriendScreen> createState() => _FriendScreenState();
}

class _FriendScreenState extends ConsumerState<FriendScreen> with SingleTickerProviderStateMixin {
  late TabController _tabController;
  final TextEditingController _searchController = TextEditingController();
  
  List<User> _friends = [];
  List<User> _searchResults = [];
  bool _isLoading = false;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 3, vsync: this);
    _loadFriends();
  }

  Future<void> _loadFriends() async {
    if (!mounted) return;
    setState(() => _isLoading = true);
    try {
      final friends = await ref.read(friendRepositoryProvider).getFriends();
      if (mounted) setState(() => _friends = friends);
    } catch (e) {
      // Handle error
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  Future<void> _searchUsers(String query) async {
    if (query.length < 2) return;
    setState(() => _isLoading = true);
    try {
      final results = await ref.read(friendRepositoryProvider).searchUsers(query);
      if (mounted) setState(() => _searchResults = results);
    } catch (e) {
      // Handle error
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  Future<void> _sendRequest(String userId) async {
    try {
      await ref.read(friendRepositoryProvider).sendFriendRequest(userId);
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Request sent!')));
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Error: $e')));
    }
  }

  @override
  Widget build(BuildContext context) {
    final session = ref.watch(sessionProvider);
    
    // Show loading indicator while restoring session
    if (session.isLoading) {
      return const Scaffold(
        backgroundColor: Colors.black,
        body: Center(child: CircularProgressIndicator()),
      );
    }

    if (session.value == null) {
      return Scaffold(
        appBar: AppBar(title: const Text('Friends'), backgroundColor: Colors.black),
        body: Center(
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const Text('Login to see your friends', style: TextStyle(color: Colors.white)),
              const SizedBox(height: 16),
              ElevatedButton(
                onPressed: () => context.push('/login'),
                child: const Text('Login'),
              ),
            ],
          ),
        ),
      );
    }
    return Scaffold(
      appBar: AppBar(
        title: const Text('Friends'),
        backgroundColor: Colors.black,
        bottom: TabBar(
          controller: _tabController,
          tabs: const [
            Tab(text: 'My Friends'),
            Tab(text: 'Find Friends'),
            Tab(text: 'Requests'),
          ],
          indicatorColor: Theme.of(context).primaryColor,
        ),
      ),
      body: TabBarView(
        controller: _tabController,
        children: [
          // My Friends List
          _isLoading && _friends.isEmpty 
              ? const Center(child: CircularProgressIndicator())
              : _friends.isEmpty 
                  ? const Center(child: Text('No friends yet. Go find some!', style: TextStyle(color: Colors.white54)))
                  : RefreshIndicator(
                      onRefresh: _loadFriends,
                      child: ListView.builder(
                        itemCount: _friends.length,
                        itemBuilder: (context, index) {
                          final friend = _friends[index];
                          return ListTile(
                            leading: CircleAvatar(
                              backgroundImage: NetworkImage(friend.avatarUrl ?? 'https://i.pravatar.cc/150?u=${friend.username}'),
                            ),
                            title: Text(friend.username, style: const TextStyle(color: Colors.white)),
                            subtitle: Text(friend.fullName, style: TextStyle(color: Colors.grey[400])),
                          );
                        },
                      ),
                    ),

          // Search / Find Friends
          Column(
            children: [
              Padding(
                padding: const EdgeInsets.all(16.0),
                child: TextField(
                  controller: _searchController,
                  style: const TextStyle(color: Colors.white),
                  decoration: InputDecoration(
                    hintText: 'Search by username...',
                    hintStyle:  TextStyle(color: Colors.grey[600]),
                    prefixIcon: const Icon(Icons.search, color: Colors.white54),
                    filled: true,
                    fillColor: Colors.grey[900],
                    border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide.none),
                  ),
                  onSubmitted: _searchUsers,
                ),
              ),
              Expanded(
                child: _isLoading && _searchResults.isEmpty
                  ? const Center(child: CircularProgressIndicator())
                  : _searchResults.isEmpty
                      ? const Center(child: Text('Search for users to add.', style: TextStyle(color: Colors.white54)))
                      : ListView.builder(
                          itemCount: _searchResults.length,
                          itemBuilder: (context, index) {
                            final user = _searchResults[index];
                            return ListTile(
                              leading: CircleAvatar(
                                backgroundImage: NetworkImage(user.avatarUrl ?? 'https://i.pravatar.cc/150?u=${user.username}'),
                              ),
                              title: Text(user.username, style: const TextStyle(color: Colors.white)),
                              subtitle: Text(user.fullName, style: TextStyle(color: Colors.grey[400])),
                              trailing: IconButton(
                                icon: const Icon(Icons.person_add, color: Colors.blueAccent),
                                onPressed: () => _sendRequest(user.id),
                              ),
                            );
                          },
                        ),
              ),
            ],
          ),

          // Requests Tab
          const _FriendRequestsTab(),
        ],
      ),
    );
  }
}

class _FriendRequestsTab extends ConsumerStatefulWidget {
  const _FriendRequestsTab();

  @override
  ConsumerState<_FriendRequestsTab> createState() => _FriendRequestsTabState();
}

class _FriendRequestsTabState extends ConsumerState<_FriendRequestsTab> {
  List<User> _requests = [];
  bool _isLoading = true;

  @override
  void initState() {
    super.initState();
    _loadRequests();
  }

  Future<void> _loadRequests() async {
    try {
      final requests = await ref.read(friendRepositoryProvider).getFriendRequests();
      if (mounted) setState(() { _requests = requests; _isLoading = false; });
    } catch (e) {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  Future<void> _respond(String userId, String status) async {
    try {
      await ref.read(friendRepositoryProvider).respondToRequest(userId, status);
      await _loadRequests(); // Refresh list
      if (mounted && status == 'accepted') {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Friend request accepted!')));
        // Ideally prompt parent to refresh friends list
      }
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Error: $e')));
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_isLoading) return const Center(child: CircularProgressIndicator());
    if (_requests.isEmpty) return const Center(child: Text('No pending friend requests.', style: TextStyle(color: Colors.white54)));

    return RefreshIndicator(
      onRefresh: _loadRequests,
      child: ListView.builder(
        itemCount: _requests.length,
        itemBuilder: (context, index) {
          final user = _requests[index];
          return ListTile(
            leading: CircleAvatar(
               backgroundImage: NetworkImage(user.avatarUrl ?? 'https://i.pravatar.cc/150?u=${user.username}'),
            ),
            title: Text(user.username, style: const TextStyle(color: Colors.white)),
            subtitle: Text('Sent you a friend request', style: TextStyle(color: Colors.grey[400], fontSize: 12)),
            trailing: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                IconButton(
                  icon: const Icon(Icons.check, color: Colors.green),
                  onPressed: () => _respond(user.id, 'accepted'),
                ),
                IconButton(
                  icon: const Icon(Icons.close, color: Colors.red),
                  onPressed: () => _respond(user.id, 'rejected'),
                ),
              ],
            ),
          );
        },
      ),
    );
  }
}
