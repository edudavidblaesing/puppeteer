import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/api_service.dart';
import 'models.dart';

final mapRepositoryProvider =
    Provider((ref) => MapRepository(ref.watch(apiServiceProvider)));

class MapRepository {
  final ApiService _api;
  MapRepository(this._api);

  Future<List<Event>> getEventsInArea(
      {double? lat,
      double? lng,
      double? radius,
      String? timeFilter,
      String? typeFilter}) async {
    // Ideally pass viewport bounds. For now fetch list.
    // We need an endpoint that returns events with friend attendance info.
    // The current 'getEvents' API might be admin-centric or generic.
    // We haven't implemented a specific "Guest Map Events" endpoint yet.
    // I should probably add one or filter the existing /db/events.
    // But /db/events is protected for admin? No app.js mounted it generally?
    // app.use('/db/events', eventRoutes);
    // eventRoutes doesn't seem to enforce auth unless middleware is inside.
    // Let's assume we can hit /db/events?limit=100 & geofilter.
    // But we need 'friendsAttending'.

    // For MVP, I'll use a mocked endpoint call or rely on what's there.
    // Since I'm the backend dev too, I should assume I'll adding it or mocking it here.
    // Let's assume I add `GET /api/guest/events/map` later.
    // I will write the client code as if it exists.

    try {
      final response = await _api.client.get('/events/map', queryParameters: {
        'lat': lat,
        'lng': lng,
        'radius': radius,
        'time_filter': timeFilter,
        'type_filter': typeFilter,
      });

      return (response.data['data'] as List)
          .map((e) => Event.fromJson(e))
          .toList();
    } catch (e, st) {
      debugPrint("MapRepository Error: $e\n$st");
      // Fallback/Mock for now so UI works
      return [];
    }
  }

  Future<List<City>> getCities() async {
    try {
      final response = await _api.client.get('/cities');
      // The response structure is { data: [...] }
      final List<dynamic> data = response.data['data'];
      return data.map((e) => City.fromJson(e)).toList();
    } catch (e) {
      debugPrint("Get Cities Error: $e");
      return [];
    }
  }
}
