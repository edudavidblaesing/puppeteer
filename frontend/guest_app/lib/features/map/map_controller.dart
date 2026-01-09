import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'map_repository.dart';
import 'models.dart';

final citiesProvider =
    FutureProvider((ref) => ref.watch(mapRepositoryProvider).getCities());

final mapControllerProvider =
    StateNotifierProvider<MapController, AsyncValue<List<Event>>>((ref) {
  return MapController(ref.watch(mapRepositoryProvider));
});

class MapController extends StateNotifier<AsyncValue<List<Event>>> {
  final MapRepository _repo;

  MapController(this._repo) : super(const AsyncValue.loading()) {
    loadEvents();
  }

  Future<void> loadEvents(
      {double? lat, double? lng, double radius = 20}) async {
    try {
      state = const AsyncValue.loading();
      // If lat/lng provided, use them. Otherwise defaults (or could get user location here)
      final events =
          await _repo.getEventsInArea(lat: lat, lng: lng, radius: radius);

      if (mounted) state = AsyncValue.data(events);
    } catch (e, st) {
      if (mounted) state = AsyncValue.error(e, st);
    }
  }
}
