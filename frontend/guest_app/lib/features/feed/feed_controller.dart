import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/api_service.dart';
import '../event/event_repository.dart';
import '../map/models.dart';

final feedControllerProvider = StateNotifierProvider<FeedController, AsyncValue<List<Event>>>((ref) {
  return FeedController(ref.watch(eventRepositoryProvider), ref.watch(apiServiceProvider));
});

class FeedController extends StateNotifier<AsyncValue<List<Event>>> {
  final EventRepository _repo;
  final ApiService _apiService; // Keep for now if needed, or remove if repo handles all

  FeedController(this._repo, this._apiService) : super(const AsyncValue.loading()) {
    loadEvents();
  }

  Future<void> loadEvents() async {
    try {
      // Temporarily using getEventsForMap as feed endpoint
      final response = await _apiService.client.get('/events/map');
      
      final List<dynamic> data = response.data['data'];
      final events = data.map((json) => Event.fromJson(json)).toList();
      
      // Sort by date approaching
      events.sort((a, b) => a.date.compareTo(b.date));

      state = AsyncValue.data(events);
    } catch (e, st) {
      state = AsyncValue.error(e, st);
    }
  }

  Future<void> refresh() async {
    state = const AsyncValue.loading();
    await loadEvents();
  }

  Future<void> rsvpEvent(String eventId, String status) async {
    try {
      await _repo.rsvpEvent(eventId, status);
      // Ideally update local state optimistically
      // For now, refresh list to get updated friend attendance
      await loadEvents();
    } catch (e) {
      // Handle error
    }
  }
}
