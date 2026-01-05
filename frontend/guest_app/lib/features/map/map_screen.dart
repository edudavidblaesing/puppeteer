import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_map/flutter_map.dart' as fm;
import 'package:latlong2/latlong.dart' as ll;
import 'package:mapbox_maps_flutter/mapbox_maps_flutter.dart'; 
import 'package:go_router/go_router.dart'; 
import 'package:flutter/foundation.dart' show kIsWeb; 
import '../../core/constants.dart';
import 'map_controller.dart';
import 'models.dart';
import 'location_service.dart';

class MapScreen extends ConsumerStatefulWidget {
  const MapScreen({super.key});

  @override
  ConsumerState<MapScreen> createState() => _MapScreenState();
}

class _MapScreenState extends ConsumerState<MapScreen> {
  MapboxMap? _mapboxMap;
  PointAnnotationManager? _pointAnnotationManager;
  final fm.MapController _flutterMapController = fm.MapController();

  @override
  Widget build(BuildContext context) {
    final eventsAsync = ref.watch(mapControllerProvider);
    final userLocationAsync = ref.watch(userLocationProvider);

    return Scaffold(
      body: Stack(
        children: [
          kIsWeb 
            ? fm.FlutterMap(
                mapController: _flutterMapController,
                options: fm.MapOptions(
                  initialCenter: const ll.LatLng(52.5113, 13.4433), // Berlin
                  initialZoom: 13.0,
                ),
                children: [
                   fm.TileLayer(
                     urlTemplate: "https://api.mapbox.com/styles/v1/mapbox/dark-v11/tiles/256/{z}/{x}/{y}@2x?access_token=${AppConstants.mapboxAccessToken}",
                     additionalOptions: const {
                       'accessToken': AppConstants.mapboxAccessToken,
                       'id': 'mapbox.dark-v11',
                     },
                   ),
                   // Events Layer
                   if (eventsAsync.valueOrNull != null)
                     fm.MarkerLayer(
                       markers: eventsAsync.valueOrNull!.where((e) => e.lat != null && e.lng != null).map((event) {
                         return fm.Marker(
                           point: ll.LatLng(event.lat!, event.lng!),
                           width: 60,
                           height: 60,
                           child: GestureDetector(
                                 onTap: () {
                                 debugPrint("Tapped Event: ${event.title}");
                          // Navigate to event
    if (mounted) {
      context.push('/event/${event.id}', extra: event);
    }
                               }, 
                               child: Stack(
                                  alignment: Alignment.center,
                                  children: [
                                    Icon(
                                      Icons.location_on, 
                                      color: event.publishStatus == 'cancelled' ? Colors.red : Colors.blueAccent, 
                                      size: 50
                                    ),
                                    if (event.friendsAttending.isNotEmpty)
                                      Positioned(
                                        right: 0,
                                        top: 0,
                                        child: CircleAvatar(
                                          radius: 10,
                                          backgroundColor: Colors.white,
                                          child: CircleAvatar(
                                            radius: 8,
                                            backgroundImage: ResizeImage(
                                              NetworkImage(event.friendsAttending.first.avatarUrl ?? 'https://i.pravatar.cc/150'),
                                              width: 30, // Optimize: load smaller version
                                              height: 30,
                                            ),
                                            onBackgroundImageError: (_, __) {},
                                          ),
                                        ),
                                      ),
                                    if (event.friendsAttending.length > 1)
                                      Positioned(
                                        right: -5,
                                        top: 0,
                                        child: CircleAvatar(
                                          radius: 8,
                                          backgroundColor: Colors.black54,
                                          child: Text('+${event.friendsAttending.length - 1}', style: const TextStyle(fontSize: 8, color: Colors.white)),
                                        ),
                                      )
                                  ],
                                ),
                           ),
                         );
                       }).toList(),
                     ),
                     
                   // User Location Layer (Web)
                   if (userLocationAsync.valueOrNull != null)
                      fm.MarkerLayer(
                        markers: [
                          fm.Marker(
                            point: ll.LatLng(
                              userLocationAsync.value!.latitude,
                              userLocationAsync.value!.longitude,
                            ),
                            width: 20,
                            height: 20,
                            child: Container(
                              decoration: BoxDecoration(
                                color: Colors.blue,
                                shape: BoxShape.circle,
                                border: Border.all(color: Colors.white, width: 2),
                                boxShadow: const [BoxShadow(blurRadius: 5, color: Colors.black26)],
                              ),
                            ),
                          ),
                        ],
                      ),
                ],
              )
            : MapWidget(
            key: const ValueKey("mapWidget"),
            // resourceOptions: ResourceOptions(
            //   accessToken: AppConstants.mapboxAccessToken,
            // ),
            cameraOptions: CameraOptions(
              center: Point(coordinates: Position(13.4433, 52.5113)).toJson(),
              zoom: 13.0,
            ),
            styleUri: AppConstants.mapStyle,
            onMapCreated: _onMapCreated,
          ),
          

          
          // City Switcher
          Positioned(
            top: 50,
            left: 20,
            right: 20,
            child: Consumer(
              builder: (context, ref, child) {
                final citiesAsync = ref.watch(citiesProvider);
                return citiesAsync.when(
                  data: (cities) {
                    if (cities.isEmpty) return const SizedBox.shrink();
                    return Card(
                      color: Colors.black87,
                      child: Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 16.0),
                        child: DropdownButtonHideUnderline(
                          child: DropdownButton<City>(
                            hint: const Text("Select City", style: TextStyle(color: Colors.white70)),
                            dropdownColor: Colors.grey[900],
                            isExpanded: true,
                            value: null, // Reset value logic needed if we want to show selected.
                            // Simplified: Just use it as a switcher action.
                            // Or better: maintain selectedCity state.
                            // Ideally match "All Cities" or specific.
                            items: [
                               const DropdownMenuItem<City>(
                                value: null, 
                                child: Text("All Cities", style: TextStyle(color: Colors.white)),
                              ),
                              ...cities.map((city) => DropdownMenuItem<City>(
                                value: city,
                                child: Text(city.name, style: const TextStyle(color: Colors.white)),
                              ))
                            ],
                            onChanged: (City? city) {
                              if (city != null) {
                                // Move Map
                                if (kIsWeb) {
                                   _flutterMapController.move(ll.LatLng(city.lat, city.lng), 12.0);
                                } else {
                                   _mapboxMap?.setCamera(CameraOptions(
                                     center: Point(coordinates: Position(city.lng, city.lat)).toJson(),
                                     zoom: 12.0,
                                   ));
                                }
                                // Load Events
                                ref.read(mapControllerProvider.notifier).loadEvents(
                                  lat: city.lat, 
                                  lng: city.lng,
                                  radius: 50
                                );
                              } else {
                                // All Cities
                                ref.read(mapControllerProvider.notifier).loadEvents();
                              }
                            },
                          ),
                        ),
                      ),
                    );
                  },
                  loading: () => const SizedBox.shrink(),
                  error: (_, __) => const SizedBox.shrink(),
                );
              },
            ),
          ),
          
          // Event Loading State
          if (eventsAsync.isLoading)
            const Center(child: CircularProgressIndicator()),
            
          Positioned(
            bottom: 24,
            right: 24,
            child: FloatingActionButton(
              backgroundColor: Colors.blueAccent,
              child: const Icon(Icons.my_location, color: Colors.white),
              onPressed: _recenterMap,
            ),
          ),
        ],
      ),
    );
  }

  void _onMapCreated(MapboxMap mapboxMap) {
    _mapboxMap = mapboxMap;
    
    // Enable Location Component on Native
    _mapboxMap?.location.updateSettings(LocationComponentSettings(
      enabled: true,
      pulsingEnabled: true,
    ));

    // Initialize annotations
    _mapboxMap?.annotations.createPointAnnotationManager().then((manager) {
      _pointAnnotationManager = manager;
      if (mounted) {
        _pointAnnotationManager?.addOnPointAnnotationClickListener(MyPointAnnotationClickListener(context, ref));
        _loadMarkers();
      }
    });
  }

  void _loadMarkers() async {
    final events = ref.read(mapControllerProvider).valueOrNull;
    if (events == null || _pointAnnotationManager == null) return;

    _pointAnnotationManager?.deleteAll();

    for (var event in events) {
       if (event.lat == null || event.lng == null) continue;
       
       // Simple marker setup (using default icon or assets if available)
       // Note: Mapbox SDK needs image added to style or sprite before using 'iconImage'
       // For this MVP, assuming 'marker-icon-id' exists or we skip iconImage to rely on default circle if possible?
       // Actually without an image, PointAnnotation might not show.
       // Let's try to use a default circle via circleAnnotationManager instead if no image?
       // Or better: Assume the style has a marker or we add one.
       // For now, let's just create points.
       
       final options = PointAnnotationOptions(
          geometry: Point(coordinates: Position(event.lng!, event.lat!)).toJson(),
          iconSize: 1.0,
          // iconImage: "marker-15", // If using Maki icons
       );
       
       await _pointAnnotationManager?.create(options);
    }
  }

  Future<void> _recenterMap() async {
    final locationAsync = ref.read(userLocationProvider);
    
    locationAsync.whenData((pos) {
       if (kIsWeb) {
          _flutterMapController.move(ll.LatLng(pos.latitude, pos.longitude), 15.0);
       } else {
          _mapboxMap?.setCamera(CameraOptions(
            center: Point(coordinates: Position(pos.longitude, pos.latitude)).toJson(),
            zoom: 15.0,
          ));
       }
    });

    // If stream not ready, try explicit fetch
    if (!locationAsync.hasValue) {
       try {
         final pos = await ref.read(locationServiceProvider).getCurrentLocation();
         if (pos != null) {
            if (kIsWeb) {
               _flutterMapController.move(ll.LatLng(pos.latitude, pos.longitude), 15.0);
            } else {
                _mapboxMap?.setCamera(CameraOptions(
                  center: Point(coordinates: Position(pos.longitude, pos.latitude)).toJson(),
                  zoom: 15.0,
                ));
            }
         }
       } catch (e) {
         if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Error: $e')));
       }
    }
  }
}

class MyPointAnnotationClickListener extends OnPointAnnotationClickListener {
  final BuildContext context;
  final WidgetRef ref;

  MyPointAnnotationClickListener(this.context, this.ref);

  @override
  void onPointAnnotationClick(PointAnnotation annotation) {
    // Find event by location or ID ideally stored in annotation data
    // For now just navigate to a demo event
    // In real app, store eventId in annotation.active or similar custom data if wrapper supports it,
    // or look up by lat/lng
    
    // context.push('/event/1'); // context not directly usable if async ops?
    // Using GoRouter helper
    GoRouter.of(context).push('/event/1');
  }
}
