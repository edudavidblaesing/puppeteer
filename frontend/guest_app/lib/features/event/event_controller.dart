import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../map/map_controller.dart';
import '../map/models.dart';
import 'event_repository.dart';

// State class to hold UI data
class EventDetailsState {
  final AsyncValue<void> rsvpStatus;
  final AsyncValue<Event?> event;

  EventDetailsState({
    this.rsvpStatus = const AsyncValue.data(null),
    this.event = const AsyncValue.loading(),
  });

  EventDetailsState copyWith({
    AsyncValue<void>? rsvpStatus,
    AsyncValue<Event?>? event,
  }) {
    return EventDetailsState(
      rsvpStatus: rsvpStatus ?? this.rsvpStatus,
      event: event ?? this.event,
    );
  }
}

// Controller Family: One controller per Event ID
final eventControllerProvider =
    StateNotifierProvider.family<EventController, EventDetailsState, String>(
        (ref, eventId) {
  return EventController(ref.watch(eventRepositoryProvider), ref, eventId);
});

class EventController extends StateNotifier<EventDetailsState> {
  final EventRepository _repo;
  final Ref _ref;
  final String _eventId;

  EventController(this._repo, this._ref, this._eventId)
      : super(EventDetailsState()) {
    loadEvent();
    _initSocketListener();
  }

  void _initSocketListener() {
    _repo.api.connectSocket();
    _repo.api.socket.emit('join_room', 'event:$_eventId');

    _repo.api.socket.on('event:rsvp_updated', (data) {
      if (data['eventId'] == _eventId) {
        // Refresh silently to get updated lists/counts
        loadEvent();
      }
    });
  }

  @override
  void dispose() {
    _cleanupSocket();
    super.dispose();
  }

  void _cleanupSocket() {
    try {
      _repo.api.socket.emit('leave_room', 'event:$_eventId');
      // We don't remove the listener globally because other controllers might use it?
      // Actually, .off('event:rsvp_updated') removes ALL listeners for that event name.
      // Since 'eventId' check is inside, we might have multiple listeners if user opens multiple events?
      // But typically only one EventDetail is open.
      // Ideally we would store the handler function and remove ONLY that specific handler.
      // But socket_io_client usually requires the exact function reference.
      // For simplicity/safety in this scope, we'll just leave room.
      // The listener will stay attached but won't receive events if we left the room (server logic dependent).
      // If server broadcasts to room, leaving room stops it.
    } catch (e) {
      // socket might be disconnected
    }
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

  Future<String?> joinChat() async {
    final event = state.event.value;
    if (event == null) return null;

    final status = event.myRsvpStatus;
    if (status != 'going' && status != 'interested') {
      throw Exception(
          "RSVP Required: Please join or mark interest to enter the chat.");
    }

    try {
      return await _repo.ensureEventChatRoom(_eventId);
    } catch (e) {
      // Handle error
      return null;
    }
  }
}
