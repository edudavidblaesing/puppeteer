import 'package:flutter/material.dart';
import 'package:dio/dio.dart';
import 'package:socket_io_client/socket_io_client.dart' as IO;
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

  // Use robust options for storage
  final _storage = const FlutterSecureStorage(
    aOptions: AndroidOptions(encryptedSharedPreferences: true),
    iOptions: IOSOptions(accessibility: KeychainAccessibility.first_unlock),
  );

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
    debugPrint('ApiService: setToken called');
    _token = token;
    if (kIsWeb) {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString('auth_token', token);
    } else {
      await _storage.write(key: 'auth_token', value: token);
    }
    debugPrint('ApiService: Token stored securely');
  }

  Future<void> clearToken() async {
    debugPrint('ApiService: clearToken called');
    _token = null;
    if (kIsWeb) {
      final prefs = await SharedPreferences.getInstance();
      await prefs.remove('auth_token');
    } else {
      await _storage.delete(key: 'auth_token');
    }
    debugPrint('ApiService: Token cleared');
  }

  Dio get client => _dio;

  // --- Socket.IO ---
  IO.Socket? _socket;

  IO.Socket get socket {
    if (_socket == null) {
      _initSocket();
    }
    return _socket!;
  }

  void _initSocket() {
    _socket = IO.io(
        AppConstants.apiUrl,
        IO.OptionBuilder()
            .setTransports(['websocket'])
            .disableAutoConnect()
            .build());

    _socket!.onConnect((_) {
      debugPrint('Socket connected');
    });

    _socket!.onDisconnect((_) {
      debugPrint('Socket disconnected');
    });
  }

  void connectSocket() {
    if (_socket == null) _initSocket();

    if (_token != null) {
      _socket!.io.options?['extraHeaders'] = {
        'Authorization': 'Bearer $_token'
      };
      _socket!.io.options?['auth'] = {'token': _token};
    }

    if (!_socket!.connected) {
      _socket!.connect();
    }
  }

  void disconnectSocket() {
    _socket?.disconnect();
  }

  Future<String?> getToken() async {
    if (_token != null) return _token;

    debugPrint('ApiService: getToken called (cache miss)');
    if (kIsWeb) {
      final prefs = await SharedPreferences.getInstance();
      _token = prefs.getString('auth_token'); // Update cache
      return _token;
    }
    _token = await _storage.read(key: 'auth_token');
    if (_token != null) {
      debugPrint('ApiService: Token retrieved from storage');
    } else {
      debugPrint('ApiService: No token in storage');
    }
    return _token;
  }
}
