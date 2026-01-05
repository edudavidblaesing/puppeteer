import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:flutter/foundation.dart' show kIsWeb;
import 'constants.dart';

final apiServiceProvider = Provider((ref) => ApiService());

class ApiService {
  final Dio _dio = Dio(BaseOptions(
    baseUrl: AppConstants.apiUrl,
    connectTimeout: const Duration(seconds: 10),
    receiveTimeout: const Duration(seconds: 10),
  ));
  
  final _storage = const FlutterSecureStorage();
  String? _token;

  ApiService() {
    _dio.interceptors.add(InterceptorsWrapper(
      onRequest: (options, handler) async {
        if (_token == null) {
          if (kIsWeb) {
            final prefs = await SharedPreferences.getInstance();
            _token = prefs.getString('auth_token');
          } else {
            _token = await _storage.read(key: 'auth_token');
          }
        }
        
        if (_token != null) {
          options.headers['Authorization'] = 'Bearer $_token';
        }
        return handler.next(options);
      },
      onError: (DioException e, handler) {
        // Handle global errors (401, etc.)
        return handler.next(e);
      },
    ));
  }

  Future<void> setToken(String token) async {
    _token = token;
    if (kIsWeb) {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString('auth_token', token);
    } else {
      await _storage.write(key: 'auth_token', value: token);
    }
  }

  Future<void> clearToken() async {
    _token = null;
    if (kIsWeb) {
      final prefs = await SharedPreferences.getInstance();
      await prefs.remove('auth_token');
    } else {
      await _storage.delete(key: 'auth_token');
    }
  }

  Dio get client => _dio;
  
  Future<String?> getToken() async {
    if (_token != null) return _token;
    
    if (kIsWeb) {
      final prefs = await SharedPreferences.getInstance();
      _token = prefs.getString('auth_token'); // Update cache
      return _token;
    }
    _token = await _storage.read(key: 'auth_token');
    return _token;
  }
}
