import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/api_service.dart';
import '../map/map_controller.dart';
import '../map/models.dart';
import 'event_repository.dart';

// State class to hold UI data
class EventDetailsState {
  final AsyncValue<List<Comment>> comments;
  final AsyncValue<void> rsvpStatus;
  final AsyncValue<Event?> event;

  EventDetailsState({
    this.comments = const AsyncValue.loading(), 
    this.rsvpStatus = const AsyncValue.data(null),
    this.event = const AsyncValue.loading(),
  });

  EventDetailsState copyWith({
    AsyncValue<List<Comment>>? comments,
    AsyncValue<void>? rsvpStatus,
    AsyncValue<Event?>? event,
  }) {
    return EventDetailsState(
      comments: comments ?? this.comments,
      rsvpStatus: rsvpStatus ?? this.rsvpStatus,
      event: event ?? this.event,
    );
  }
}

// Controller Family: One controller per Event ID
final eventControllerProvider = StateNotifierProvider.family<EventController, EventDetailsState, String>((ref, eventId) {
  return EventController(ref.watch(eventRepositoryProvider), ref, eventId);
});

class EventController extends StateNotifier<EventDetailsState> {
  final EventRepository _repo;
  final Ref _ref;
  final String _eventId;

  EventController(this._repo, this._ref, this._eventId) : super(EventDetailsState()) {
    loadEvent();
    loadComments();
  }

  Future<void> loadEvent() async {
    try {
      // Don't set loading if we have data (silent refresh)
      final event = await _repo.getEventDetails(_eventId);
      state = state.copyWith(event: AsyncValue.data(event));
    } catch (e, st) {
      // Keep old data if refresh fails
      if (state.event.value == null) {
         state = state.copyWith(event: AsyncValue.error(e, st));
      }
    }
  }

  Future<void> loadComments() async {
    try {
      state = state.copyWith(comments: const AsyncValue.loading());
      final comments = await _repo.getComments(_eventId);
      state = state.copyWith(comments: AsyncValue.data(comments));
    } catch (e, st) {
      state = state.copyWith(comments: AsyncValue.error(e, st));
    }
  }

  Future<void> rsvp(String status) async {
    try {
      state = state.copyWith(rsvpStatus: const AsyncValue.loading());
      await _repo.rsvpEvent(_eventId, status);
      state = state.copyWith(rsvpStatus: const AsyncValue.data(null));
      
      // Refresh event details to get updated status/counts
      await loadEvent();

      // Refresh global map data to show updated attendance
      _ref.invalidate(mapControllerProvider);
    } catch (e, st) {
      state = state.copyWith(rsvpStatus: AsyncValue.error(e, st));
    }
  }

  Future<void> addComment(String content) async {
    try {
      await _repo.addComment(_eventId, content);
      loadComments(); // Refresh list
    } catch (e) {
      // Handle error
    }
  }
}
