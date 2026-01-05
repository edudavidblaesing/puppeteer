import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/api_service.dart';

final authControllerProvider = StateNotifierProvider<AuthController, AsyncValue<void>>((ref) {
  return AuthController(ref.watch(apiServiceProvider));
});

class AuthController extends StateNotifier<AsyncValue<void>> {
  final ApiService _apiService;

  AuthController(this._apiService) : super(const AsyncValue.data(null));

  Future<bool> login(String email, String password) async {
    state = const AsyncValue.loading();
    try {
      final response = await _apiService.client.post('/auth/login', data: {
        'email': email,
        'password': password,
      });

      final token = response.data['token'];
      await _apiService.setToken(token);
      
      state = const AsyncValue.data(null);
      return true;
    } catch (e, st) {
      state = AsyncValue.error(e, st);
      return false;
    }
  }

  Future<bool> register(String email, String password, String username, String fullName) async {
    state = const AsyncValue.loading();
    try {
      final response = await _apiService.client.post('/auth/register', data: {
        'email': email,
        'password': password,
        'username': username,
        'full_name': fullName,
      });

      // Backend now returns success: true, message: '...'
      // No token yet.
      
      state = const AsyncValue.data(null);
      return true;
    } catch (e, st) {
      state = AsyncValue.error(e, st);
      return false;
    }
  }

  Future<bool> verifyEmail(String email, String code) async {
    state = const AsyncValue.loading();
    try {
      final response = await _apiService.client.post('/auth/verify', data: {
        'email': email,
        'code': code,
      });

      final token = response.data['token'];
      await _apiService.setToken(token);
      
      state = const AsyncValue.data(null);
      return true;
    } catch (e, st) {
      state = AsyncValue.error(e, st);
      return false;
    }
  }

  Future<bool> resendVerificationCode(String email) async {
    state = const AsyncValue.loading();
    try {
      await _apiService.client.post('/auth/verify/resend', data: {
        'email': email,
      });
      state = const AsyncValue.data(null);
      return true;
    } catch (e, st) {
      state = AsyncValue.error(e, st);
      return false;
    }
  }
  Future<bool> checkAuthStatus() async {
    state = const AsyncValue.loading();
    try {
      final token = await _apiService.getToken();
      
      if (token != null) {
        // Optional: Verify token with backend /me endpoint here
        // For now, we trust storage for speed (offline first)
        state = const AsyncValue.data(null);
        return true;
      }
      state = const AsyncValue.data(null); // Reset loading state
      return false;
    } catch (e) {
      state = const AsyncValue.data(null); // Reset loading state
      return false;
    }
  }
  Future<bool> updateProfile({String? fullName, String? username, String? bio}) async {
    state = const AsyncValue.loading();
    try {
      final data = <String, dynamic>{};
      if (fullName != null) data['full_name'] = fullName;
      if (username != null) data['username'] = username;
      if (bio != null) data['bio'] = bio;

      await _apiService.client.patch('/profile', data: data);
      state = const AsyncValue.data(null);
      return true;
    } catch (e, st) {
      state = AsyncValue.error(e, st);
      return false;
    }
  }
}
