import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'friend_repository.dart';
import '../chat/chat_repository.dart';
import '../auth/user_model.dart';
import '../auth/session_provider.dart';
import 'package:go_router/go_router.dart';

class FriendScreen extends ConsumerStatefulWidget {
  const FriendScreen({super.key});

  @override
  ConsumerState<FriendScreen> createState() => _FriendScreenState();
}

class _FriendScreenState extends ConsumerState<FriendScreen>
    with SingleTickerProviderStateMixin {
  late TabController _tabController;
  final TextEditingController _searchController = TextEditingController();

  List<User> _following = [];
  List<User> _followers = [];
  List<User> _searchResults = [];
  bool _isLoading = false;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 3, vsync: this);
    _loadData();
  }

  Future<void> _loadData() async {
    if (!mounted) return;
    setState(() => _isLoading = true);
    try {
      final repo = ref.read(friendRepositoryProvider);
      final following = await repo.getFriends(); // Actually getting following
      final followers = await repo.getFollowers();
      if (mounted) {
        setState(() {
          _following = following;
          _followers = followers;
        });
      }
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
      final results =
          await ref.read(friendRepositoryProvider).searchUsers(query);
      if (mounted) setState(() => _searchResults = results);
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text('Error: $e')));
      }
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  Future<void> _followUser(User user) async {
    try {
      await ref.read(friendRepositoryProvider).followUser(user.id);
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text('Followed ${user.username}')));
        _loadData(); // Refresh lists
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text('Error: $e')));
      }
    }
  }

  Future<void> _unfollowUser(User user) async {
    try {
      await ref.read(friendRepositoryProvider).unfollowUser(user.id);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text('Unfollowed ${user.username}')));
        _loadData();
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text('Error: $e')));
      }
    }
  }

  // Reusable User Tile Helper
  Widget _buildUserTile(User user) {
    // Determine button state
    // In Following Tab -> Show Unfollow
    // In Followers Tab -> Show Follow (if not following back) / Unfollow ?
    // In Search -> Show Follow / Unfollow

    // For simplistic MVP:
    // Search Results might not pop 'isFollowing' correctly unless we merge with 'following' list.
    // Let's check _following list manually for status if needed.

    final isAlreadyFollowing = _following.any((u) => u.id == user.id);

    return ListTile(
      leading: CircleAvatar(
        backgroundImage: NetworkImage(
            user.avatarUrl ?? 'https://i.pravatar.cc/150?u=${user.username}'),
        onBackgroundImageError: (_, __) {},
        backgroundColor: Colors.grey[800],
        child: user.avatarUrl == null
            ? Text(
                user.username.isNotEmpty ? user.username[0].toUpperCase() : '?')
            : null,
      ),
      title: Text(user.username, style: const TextStyle(color: Colors.white)),
      subtitle: Text(user.fullName, style: TextStyle(color: Colors.grey[400])),
      trailing: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          IconButton(
            icon: const Icon(Icons.chat_bubble_outline, color: Colors.white70),
            onPressed: () async {
              try {
                final roomId = await ref
                    .read(chatRepositoryProvider)
                    .createDirectChat(user.id);
                if (context.mounted) {
                  context.push('/chat/$roomId');
                }
              } catch (e) {
                // Handle error
              }
            },
          ),
          if (isAlreadyFollowing)
            IconButton(
              icon: const Icon(Icons.person_remove, color: Colors.redAccent),
              onPressed: () => _unfollowUser(user),
            )
          else
            IconButton(
              icon: const Icon(Icons.person_add, color: Colors.blueAccent),
              onPressed: () => _followUser(user),
            ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final session = ref.watch(sessionProvider);

    if (session.isLoading) {
      return const Scaffold(
          backgroundColor: Colors.black,
          body: Center(child: CircularProgressIndicator()));
    }

    if (session.value == null) {
      return Scaffold(
        backgroundColor: Colors.black,
        body: Center(
          child: ElevatedButton(
            onPressed: () => context.push('/login'),
            child: const Text('Login to see your friends'),
          ),
        ),
      );
    }

    return Scaffold(
      backgroundColor: Colors.black,
      extendBodyBehindAppBar: true,
      appBar: AppBar(
        title: const Text('Community'),
        backgroundColor: Colors.transparent,
        elevation: 0,
        bottom: TabBar(
          controller: _tabController,
          tabs: const [
            Tab(text: 'Following'),
            Tab(text: 'Followers'),
            Tab(text: 'Find'),
          ],
          indicatorColor: Theme.of(context).primaryColor,
          dividerColor: Colors.transparent,
        ),
      ),
      body: Stack(
        children: [
          // Mesh Background (Simplified for brevity)
          Positioned(
            top: -100,
            right: -100,
            child: Container(
              width: 300,
              height: 300,
              decoration: BoxDecoration(boxShadow: [
                BoxShadow(
                  color: Colors.purple.withOpacity(0.2),
                  blurRadius: 100,
                )
              ]),
            ),
          ),

          SafeArea(
            child: Padding(
              padding: const EdgeInsets.only(top: kToolbarHeight + 48),
              child: TabBarView(
                controller: _tabController,
                children: [
                  // 1. Following
                  _following.isEmpty
                      ? const Center(
                          child: Text("You aren't following anyone yet.",
                              style: TextStyle(color: Colors.white54)))
                      : RefreshIndicator(
                          onRefresh: _loadData,
                          child: ListView.builder(
                            itemCount: _following.length,
                            itemBuilder: (context, index) =>
                                _buildUserTile(_following[index]),
                          ),
                        ),

                  // 2. Followers
                  _followers.isEmpty
                      ? const Center(
                          child: Text("No followers yet.",
                              style: TextStyle(color: Colors.white54)))
                      : RefreshIndicator(
                          onRefresh: _loadData,
                          child: ListView.builder(
                            itemCount: _followers.length,
                            itemBuilder: (context, index) =>
                                _buildUserTile(_followers[index]),
                          ),
                        ),

                  // 3. Find
                  Column(
                    children: [
                      Padding(
                        padding: const EdgeInsets.all(16.0),
                        child: TextField(
                          controller: _searchController,
                          style: const TextStyle(color: Colors.white),
                          decoration: InputDecoration(
                            hintText: 'Search username...',
                            hintStyle: TextStyle(color: Colors.grey[600]),
                            prefixIcon:
                                const Icon(Icons.search, color: Colors.white54),
                            filled: true,
                            fillColor: Colors.grey[900]?.withOpacity(0.8),
                            border: OutlineInputBorder(
                                borderRadius: BorderRadius.circular(12),
                                borderSide: BorderSide.none),
                          ),
                          onSubmitted: _searchUsers,
                        ),
                      ),
                      Expanded(
                        child: _isLoading && _searchResults.isEmpty
                            ? const Center(child: CircularProgressIndicator())
                            : _searchResults.isEmpty
                                ? const Center(
                                    child: Text('Search to find people.',
                                        style:
                                            TextStyle(color: Colors.white54)))
                                : ListView.builder(
                                    itemCount: _searchResults.length,
                                    itemBuilder: (context, index) =>
                                        _buildUserTile(_searchResults[index]),
                                  ),
                      ),
                    ],
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
