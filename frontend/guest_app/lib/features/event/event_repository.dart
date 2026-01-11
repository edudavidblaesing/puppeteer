import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/api_service.dart';
import '../map/models.dart';

final eventRepositoryProvider =
    Provider((ref) => EventRepository(ref.watch(apiServiceProvider)));

class EventRepository {
  final ApiService api;
  EventRepository(this.api);

  Future<void> rsvpEvent(String eventId, String status) async {
    await api.client.post('/events/$eventId/rsvp', data: {'status': status});
  }

  Future<String> ensureEventChatRoom(String eventId) async {
    final response = await api.client.post('/chat/event/$eventId');
    return response.data['id'];
  }

  Future<List<Event>> getMyEvents() async {
    final response = await api.client.get('/events/my');
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
        myRsvpStatus: json['status'],
        lat: 0, // Placeholder
        lng: 0, // Placeholder
        publishStatus: 'published',
      );
    }).toList();
  }

  Future<Event> getEventDetails(String eventId) async {
    final response = await api.client.get('/events/$eventId');
    return Event.fromJson(response.data);
  }
}
