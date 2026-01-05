import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/api_service.dart';
import 'user_model.dart';

final sessionProvider = StateNotifierProvider<SessionController, AsyncValue<User?>>((ref) {
  return SessionController(ref.watch(apiServiceProvider));
});

class SessionController extends StateNotifier<AsyncValue<User?>> {
  final ApiService _apiService;

  SessionController(this._apiService) : super(const AsyncValue.data(null)) {
    restoreSession();
  }

  Future<void> restoreSession() async {
    state = const AsyncValue.loading();
    try {
      final token = await _apiService.getToken();
      if (token != null) {
        try {
          print('DEBUG: Fetching /auth/me'); // LOG
          final response = await _apiService.client.get('/auth/me');
          print('DEBUG: /auth/me response: ${response.data}'); // LOG
          
          if (response.data != null) {
             final Map<String, dynamic> userData;
             if (response.data is Map<String, dynamic> && response.data.containsKey('user')) {
                userData = response.data['user'];
             } else if (response.data is Map<String, dynamic>) {
                userData = response.data;
             } else {
                debugPrint('DEBUG: Invalid response format');
                throw Exception('Invalid me response');
             }
             
             debugPrint('DEBUG: Parsing user data: $userData');
             final user = User.fromJson(userData);
             debugPrint('DEBUG: User parsed successfully: ${user.username}');
             state = AsyncValue.data(user);
             return; 
          }
        } catch (e, st) {
          debugPrint('DEBUG: Error in restoreSession: $e\n$st');
          // Only clear token if it's strictly an auth error (401), otherwise keep it and retry later?
           // _apiService.clearToken(); 
        }
      } else {
         print('DEBUG: No token found in storage');
      }
      state = const AsyncValue.data(null);
    } catch (e, st) {
      print('DEBUG: Outer error in restoreSession: $e\n$st');
      state = const AsyncValue.data(null);
    }
  }

  Future<void> loginSuccess(User user) async {
    state = AsyncValue.data(user);
  }

  Future<void> logout() async {
    await _apiService.clearToken();
    state = const AsyncValue.data(null);
  }
}
