import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/api_service.dart';
import '../map/models.dart';

final eventRepositoryProvider = Provider((ref) => EventRepository(ref.watch(apiServiceProvider)));

class EventRepository {
  final ApiService _api;
  EventRepository(this._api);

  Future<void> rsvpEvent(String eventId, String status) async {
    await _api.client.post('/events/$eventId/rsvp', data: {'status': status});
  }

  Future<List<Comment>> getComments(String eventId) async {
    final response = await _api.client.get('/events/$eventId/comments');
    final List<dynamic> data = response.data['data'];
    return data.map((json) => Comment.fromJson(json)).toList();
  }

  Future<void> addComment(String eventId, String content) async {
    await _api.client.post('/events/$eventId/comments', data: {'content': content});
  }

  Future<List<Event>> getMyEvents() async {
    final response = await _api.client.get('/events/my');
    final List<dynamic> data = response.data['data'];
    return data.map((json) {
       // Backend returns event_id, status, title, date, venue_name, flyer_front
       // We map this to a partial Event object
       return Event(
         id: json['event_id'].toString(),
         title: json['title'],
         date: DateTime.parse(json['date']),
         venueName: json['venue_name'],
         flyerFront: json['flyer_front'],
         lat: 0, // Placeholder
         lng: 0, // Placeholder
         publishStatus: 'published',
       );
    }).toList();
  }
  Future<Event> getEventDetails(String eventId) async {
    final response = await _api.client.get('/events/$eventId');
    return Event.fromJson(response.data);
  }
}

class Comment {
  final String id;
  final String content;
  final String username;
  final String? avatarUrl;
  final DateTime createdAt;

  Comment({required this.id, required this.content, required this.username, this.avatarUrl, required this.createdAt});

  factory Comment.fromJson(Map<String, dynamic> json) {
    return Comment(
      id: json['id'],
      content: json['content'],
      username: json['username'] ?? json['user']?['username'] ?? 'Unknown',
      avatarUrl: json['avatar_url'] ?? json['user']?['avatar_url'],
      createdAt: DateTime.parse(json['created_at']),
    );
  }
}
