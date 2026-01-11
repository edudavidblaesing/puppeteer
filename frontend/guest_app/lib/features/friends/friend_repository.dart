import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/api_service.dart';
import '../auth/user_model.dart';

final friendRepositoryProvider =
    Provider((ref) => FriendRepository(ref.watch(apiServiceProvider)));

class FriendRepository {
  final ApiService _api;
  FriendRepository(this._api);

  Future<List<User>> getFriends() async {
    final response = await _api.client.get('/me/following');
    final List<dynamic> data = response.data['data'];
    return data.map((json) => User.fromJson(json)).toList();
  }

  Future<List<User>> searchUsers(String query) async {
    if (query.length < 2) return [];
    final response =
        await _api.client.get('/users/search', queryParameters: {'q': query});
    final List<dynamic> data = response.data['data'];
    return data.map((json) => User.fromJson(json)).toList();
  }

  Future<List<User>> getFollowers() async {
    final response = await _api.client.get('/me/followers');
    final List<dynamic> data = response.data['data'];
    return data.map((json) => User.fromJson(json)).toList();
  }

  Future<void> followUser(String targetUserId) async {
    await _api.client
        .post('/users/follow', data: {'targetUserId': targetUserId});
  }

  Future<void> unfollowUser(String targetUserId) async {
    await _api.client
        .post('/users/unfollow', data: {'targetUserId': targetUserId});
  }
}
