import 'package:flutter_contacts/flutter_contacts.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:permission_handler/permission_handler.dart';
import '../../core/api_service.dart';
import '../map/models.dart'; // Reusing User model

final contactSyncServiceProvider =
    Provider((ref) => ContactSyncService(ref.watch(apiServiceProvider)));

class ContactSyncService {
  final ApiService _api;

  ContactSyncService(this._api);

  Future<List<User>> syncContacts() async {
    // 1. Request Permission
    final permission = await Permission.contacts.request();
    if (!permission.isGranted) {
      throw Exception('Contact permission denied');
    }

    // 2. Get Contacts
    final contacts = await FlutterContacts.getContacts(withProperties: true);

    // 3. Extract Phone Numbers (normalize)
    final phones = contacts
        .expand((c) => c.phones)
        .map((p) => p.number.replaceAll(RegExp(r'\s+'), '')) // Basic cleanup
        .toList();

    if (phones.isEmpty) return [];

    // 4. Send to Backend
    try {
      final response =
          await _api.client.post('/contacts/sync', data: {'contacts': phones});

      final List<dynamic> data = response.data['data'];
      return data.map((json) => User.fromJson(json)).toList();
    } catch (e) {
      throw Exception('Failed to sync contacts: $e');
    }
  }

  Future<void> followUser(String userId) async {
    await _api.client.post('/users/follow', data: {'targetUserId': userId});
  }

  Future<void> followAll(List<String> userIds) async {
    // In a real app, backend should support batch follow.
    // For now, simple parallelism or loop.
    await Future.wait(userIds.map((id) => followUser(id)));
  }
}
