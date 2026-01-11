import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/api_service.dart';

final chatRepositoryProvider =
    Provider((ref) => ChatRepository(ref.watch(apiServiceProvider)));

class ChatRepository {
  final ApiService _api;
  ChatRepository(this._api);

  Future<List<ChatRoom>> getMyChats() async {
    final response = await _api.client.get('/chat');
    final List<dynamic> data = response.data['data'];
    return data.map((json) => ChatRoom.fromJson(json)).toList();
  }

  Future<List<ChatMessage>> getMessages(String roomId) async {
    final response = await _api.client.get('/chat/$roomId/messages');
    final List<dynamic> data = response.data['data'];
    return data.map((json) => ChatMessage.fromJson(json)).toList();
  }

  Future<void> sendMessage(String roomId, String content) async {
    await _api.client
        .post('/chat/$roomId/messages', data: {'content': content});
  }

  Future<String> createDirectChat(String targetUserId) async {
    final response = await _api.client
        .post('/chat/direct', data: {'targetUserId': targetUserId});
    return response.data['id'];
  }

  Future<String> ensureEventRoom(String eventId) async {
    final response = await _api.client.post('/chat/event/$eventId');
    return response.data['id'];
  }
}

class ChatRoom {
  final String id;
  final String? name;
  final String? type; // 'direct', 'event', 'group'
  final String? lastMessage;
  final DateTime? lastMessageAt;
  final String? iconUrl;

  ChatRoom(
      {required this.id,
      this.name,
      this.type,
      this.lastMessage,
      this.lastMessageAt,
      this.iconUrl});

  factory ChatRoom.fromJson(Map<String, dynamic> json) {
    return ChatRoom(
      id: json['id'],
      name: json['name'] ?? 'Chat',
      type: json['type'],
      lastMessage: json['last_message'],
      lastMessageAt: json['last_message_at'] != null
          ? DateTime.parse(json['last_message_at'])
          : null,
      iconUrl: json['icon_url'],
    );
  }
}

class ChatMessage {
  final String id;
  final String content;
  final String senderId;
  final String senderName;
  final String? senderAvatar;
  final bool isMe;
  final DateTime createdAt;

  ChatMessage({
    required this.id,
    required this.content,
    required this.senderId,
    required this.senderName,
    this.senderAvatar,
    required this.isMe,
    required this.createdAt,
  });

  factory ChatMessage.fromJson(Map<String, dynamic> json) {
    // NOTE: We need current User ID to determine isMe reliably, usually strict separation is better.
    // For MVP, assume backend flag or we pass myId.
    // Let's assume backend returns 'is_me' or similar, OR we check against stored ID.
    // For now, let's default false and fix in Screen.
    return ChatMessage(
      id: json['id'],
      content: json['content'],
      senderId: json['sender_id'] ?? '',
      senderName: json['username'] ?? json['sender_username'] ?? 'Unknown',
      senderAvatar: json['sender_avatar'],
      isMe: json['is_me'] ?? false,
      createdAt: DateTime.parse(json['created_at']),
    );
  }
}
