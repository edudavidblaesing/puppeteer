import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/api_service.dart';
import '../auth/user_model.dart';

final friendRepositoryProvider = Provider((ref) => FriendRepository(ref.watch(apiServiceProvider)));

class FriendRepository {
  final ApiService _api;
  FriendRepository(this._api);

  Future<List<User>> getFriends() async {
    final response = await _api.client.get('/friends');
    final List<dynamic> data = response.data['data'];
    return data.map((json) => User.fromJson(json)).toList();
  }

  Future<List<User>> getFriendRequests() async {
    final response = await _api.client.get('/friends/requests');
    final List<dynamic> data = response.data['data'];
    return data.map((json) => User.fromJson(json)).toList();
  }

  Future<List<User>> searchUsers(String query) async {
    if (query.length < 2) return [];
    final response = await _api.client.get('/search', queryParameters: {'q': query});
    final List<dynamic> data = response.data['data'];
    return data.map((json) => User.fromJson(json)).toList();
  }

  Future<void> sendFriendRequest(String targetUserId) async {
    await _api.client.post('/friends/request', data: {'targetUserId': targetUserId});
  }

  Future<void> respondToRequest(String targetUserId, String status) async {
    // status: 'accepted' or 'rejected'
    await _api.client.post('/friends/respond', data: {'targetUserId': targetUserId, 'status': status});
  }
}
