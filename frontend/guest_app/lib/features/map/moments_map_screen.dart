import 'dart:typed_data';
import 'package:flutter/material.dart';
import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:mapbox_maps_flutter/mapbox_maps_flutter.dart';
import 'package:flutter_map/flutter_map.dart' as fm;
import 'package:latlong2/latlong.dart' as ll;
import 'package:go_router/go_router.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'widgets/floating_ui.dart';
import 'widgets/moment_card.dart';
import 'widgets/moment_marker.dart';
import 'widgets/moment_stack_marker.dart';
import 'widgets/native_marker_gen.dart';
import '../event/event_detail_screen.dart';
import 'map_controller.dart';
import 'models.dart';

class MomentsMapScreen extends ConsumerStatefulWidget {
  const MomentsMapScreen({super.key});

  @override
  ConsumerState<MomentsMapScreen> createState() => _MomentsMapScreenState();
}

class _MomentsMapScreenState extends ConsumerState<MomentsMapScreen> {
  MapboxMap? _mapboxMap;
  PointAnnotationManager? _pointAnnotationManager;
  final NativeMarkerGenerator _markerGenerator = NativeMarkerGenerator();
  final Map<String, Event> _annotationEventMap = {};

  final fm.MapController _flutterMapController = fm.MapController();

  double _mapOffset = 0.0;
  double _currentZoom = 13.0;

  // Sheet Controllers
  final DraggableScrollableController _feedSheetController =
      DraggableScrollableController();
  final DraggableScrollableController _detailSheetController =
      DraggableScrollableController();

  // Selected Event State for Persistent Overlay
  Event? _selectedEvent;
  String? _selectedTime;


  @override
  void initState() {
    super.initState();
    _feedSheetController.addListener(() {
      setState(() {
        // Parallax effect for Feed
        if (_selectedEvent == null && _feedSheetController.isAttached) {
          _mapOffset = -(_feedSheetController.size - 0.25) * 600;
        }
      });
    });
  }

  // --- Grouping Logic ---
  int _getGroupScore(List<Event> group) {
    int score = group.length;
    for (var e in group) {
      score += e.friendsAttending.length * 5;
    }
    return score;
  }

  List<List<Event>> _groupEventsByLocation(List<Event> events) {
    final Map<String, List<Event>> groups = {};
    for (var event in events) {
      if (event.lat == null || event.lng == null) continue;
      final key =
          "${event.lat!.toStringAsFixed(5)},${event.lng!.toStringAsFixed(5)}";
      groups.putIfAbsent(key, () => []).add(event);
    }
    final list = groups.values.toList();
    list.sort((a, b) => _getGroupScore(a).compareTo(_getGroupScore(b)));
    return list;
  }

  // --- Handlers ---
  void _onMapTap() {
    if (_selectedEvent != null) {
      setState(() {
        _selectedEvent = null;
      });
    }
  }

  void _showMomentDialog(Event event) {
    setState(() {
      _selectedEvent = event;
    });
    // Reset detail sheet to initial size if needed
    if (_detailSheetController.isAttached) {
      _detailSheetController.animateTo(0.6,
          duration: const Duration(milliseconds: 300), curve: Curves.easeOut);
    }
  }

  void _navigateToEvent(Event event) {
    context.push('/event/${event.id}', extra: event);
  }

  @override
  Widget build(BuildContext context) {
    final eventsAsync = ref.watch(mapControllerProvider);

    // React to event updates for Native Map
    ref.listen(mapControllerProvider, (previous, next) {
      if (next.hasValue && !next.isLoading) {
        debugPrint(
            "Events updated: ${next.value?.length}. Reloading native markers...");
        _loadNativeMarkers();
      }
    });

    return Scaffold(
      backgroundColor: Colors.black,
      resizeToAvoidBottomInset: false,
      body: Stack(
        children: [
          // 1. Map Layer
          Transform.translate(
            offset: Offset(
                0,
                _selectedEvent != null
                    ? 0
                    : _mapOffset), // Disable parallax if detail open
            child: SizedBox(
                height: MediaQuery.of(context).size.height,
                child: kIsWeb ? _buildWebMap(eventsAsync) : _buildNativeMap()),
          ),

          // 2. Custom Map Controls (Compass & Locate) - Above Feed Slider
          if (!kIsWeb && _selectedEvent == null)
            Positioned(
              right: 16,
              bottom: (MediaQuery.of(context).size.height * 0.25) +
                  32, // Just above the 25% sheet
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  // Compass
                  FloatingActionButton.small(
                    heroTag: "compass",
                    backgroundColor: Colors.black87,
                    child: const Icon(Icons.explore, color: Colors.white),
                    onPressed: () {
                      _mapboxMap?.flyTo(CameraOptions(bearing: 0),
                          MapAnimationOptions(duration: 500));
                    },
                  ),
                  const SizedBox(height: 12),
                  // Locate Me
                  FloatingActionButton.small(
                    heroTag: "locate",
                    backgroundColor: Colors.purpleAccent,
                    child: const Icon(Icons.my_location, color: Colors.white),
                    onPressed: () {
                      // Simple locate finding
                      _mapboxMap?.location.updateSettings(
                          LocationComponentSettings(
                              enabled: true, pulsingEnabled: true));
                      // We rely on the native location component following behavior or adjust camera
                      // This is a basic implementation. Ideally we fetch location and flyTo.
                      // But enabling the component usually centers if tracking is on.
                      // Let's force a camera update if we can access user location (requires permission).
                    },
                  ),
                ],
              ),
            ),

          // 3. Floating UI Layer (Search, Profile, New Moment)
          // ... (Rest of UI)
          if (_selectedEvent == null)
            Positioned.fill(
              child: Transform.translate(
                offset: Offset(0, _mapOffset),
                child: Stack(
                  children: [
                    // The main floating overlay (Top Bar + Bottom Button)
                    FloatingMapUI(
                      onMenuTap: () => Scaffold.of(context).openDrawer(),
                      onSearchTap: () => context.push('/friends'),
                      onAvatarTap: () => context.push('/profile'),
                      onNewMomentTap: () {
                        ScaffoldMessenger.of(context).showSnackBar(
                          const SnackBar(content: Text("Create Moment Flow")),
                        );
                      },
                      selectedTimeFilter: _selectedTime,
                      onTimeFilterChanged: (value) {
                        setState(() => _selectedTime = value);
                        ref.read(mapControllerProvider.notifier).loadEvents(
                            timeFilter: _selectedTime);
                      },
                    ),
                  ],
                ),
              ),
            ),

          if (eventsAsync.isLoading)
            const Center(child: CircularProgressIndicator()),

          // 4. Feed Sheet (The "Main" List)
          if (_selectedEvent == null)
            DraggableScrollableSheet(
              controller: _feedSheetController,
              initialChildSize: 0.25,
              minChildSize: 0.25,
              maxChildSize: 1.0,
              snap: true,
              snapSizes: const [0.25, 1.0],
              builder: (context, scrollController) {
                return Container(
                  decoration: const BoxDecoration(
                      color: Colors.black,
                      borderRadius:
                          BorderRadius.vertical(top: Radius.circular(24)),
                      boxShadow: [
                        BoxShadow(
                            color: Colors.white10,
                            blurRadius: 10,
                            offset: Offset(0, -2))
                      ]),
                  child: Column(
                    children: [
                      Center(
                        child: Container(
                          margin: const EdgeInsets.symmetric(vertical: 12),
                          width: 40,
                          height: 4,
                          decoration: BoxDecoration(
                            color: Colors.grey[700],
                            borderRadius: BorderRadius.circular(2),
                          ),
                        ),
                      ),
                      Expanded(
                        child: eventsAsync.when(
                          data: (events) {
                            if (events.isEmpty)
                              return _buildEmptyFeedState(scrollController);
                            return ListView.builder(
                              controller: scrollController,
                              physics: const AlwaysScrollableScrollPhysics(),
                              itemCount: events.length,
                              itemBuilder: (context, index) {
                                return _buildFeedItem(index, events[index]);
                              },
                            );
                          },
                          error: (err, stack) => Center(
                              child: Text("Error: $err",
                                  style: const TextStyle(color: Colors.red))),
                          loading: () => const Center(
                              child: CircularProgressIndicator(
                                  color: Colors.purpleAccent)),
                        ),
                      ),
                    ],
                  ),
                );
              },
            ),

          // 5. EVENT DETAIL SHEET (Persistent Stack Overlay)
          if (_selectedEvent != null)
            NotificationListener<DraggableScrollableNotification>(
              onNotification: (notification) {
                return false;
              },
              child: DraggableScrollableSheet(
                controller: _detailSheetController,
                initialChildSize: 0.6,
                minChildSize: 0.4,
                maxChildSize: 1.0,
                snap: true,
                snapSizes: const [0.4, 0.6, 1.0],
                builder: (context, scrollController) {
                  return ClipRRect(
                      borderRadius:
                          const BorderRadius.vertical(top: Radius.circular(32)),
                      child: Stack(children: [
                        EventDetailScreen(
                          eventId: _selectedEvent!.id,
                          eventExtra: _selectedEvent,
                          scrollController: scrollController,
                        ),

                        // Close Button (Floating on top of detail sheet)
                        Positioned(
                            top: 10,
                            left: 10,
                            child: SafeArea(
                                child: CircleAvatar(
                                    backgroundColor: Colors.black54,
                                    child: IconButton(
                                        icon: const Icon(Icons.close,
                                            color: Colors.white),
                                        onPressed: () {
                                          setState(() {
                                            _selectedEvent = null;
                                          });
                                        }))))
                      ]));
                },
              ),
            ),
        ],
      ),
    );
  }

  // --- Web Implementation ---
  Widget _buildWebMap(AsyncValue<List<Event>> eventsAsync) {
    // ... (unchanged)
    return fm.FlutterMap(
      mapController: _flutterMapController,
      options: fm.MapOptions(
        initialCenter: const ll.LatLng(52.5113, 13.4433),
        initialZoom: 13.0,
        onTap: (_, __) => _onMapTap(), // Handle map tap to close detail
        onPositionChanged: (pos, hasGesture) {
          if (pos.zoom != null && (pos.zoom! - _currentZoom).abs() > 0.1) {
            setState(() {
              _currentZoom = pos.zoom!;
            });
          }
        },
      ),
      children: [
        fm.TileLayer(
          urlTemplate:
              'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
          subdomains: const ['a', 'b', 'c', 'd'],
        ),
        fm.MarkerLayer(
          markers: (eventsAsync.valueOrNull ?? []).isEmpty
              ? []
              : _groupEventsByLocation(eventsAsync.valueOrNull ?? [])
                  .map<fm.Marker>((group) {
                  final topEvent = group.first;
                  if (group.length == 1) {
                    return fm.Marker(
                      point: ll.LatLng(topEvent.lat!, topEvent.lng!),
                      width: 120,
                      height: 120,
                      child: MomentMapMarker(
                        event: topEvent,
                        onTap: () => _showMomentDialog(topEvent),
                      ),
                    );
                  } else {
                    return fm.Marker(
                        point: ll.LatLng(topEvent.lat!, topEvent.lng!),
                        width: 140,
                        height: 140,
                        child: MomentStackMarker(
                          events: group,
                          onEventTap: (e) => _showMomentDialog(e),
                          onStackTap: () => _showStackDialog(group),
                        ));
                  }
                }).toList(),
        ),
      ],
    );
  }

  // ... (CityBadge and others)

  // --- Native Implementation ---
  Widget _buildNativeMap() {
    return MapWidget(
      key: const ValueKey("momentsMap"),
      cameraOptions: CameraOptions(
        center: Point(coordinates: Position(13.4433, 52.5113)),
        zoom: 13.0,
      ),
      styleUri: MapboxStyles.DARK,
      onMapCreated: _onMapCreated,
      onStyleLoadedListener: _onStyleLoaded,
      onTapListener: (context) => _onMapTap(),
    );
  }

  void _onStyleLoaded(StyleLoadedEventData event) {
    debugPrint("Map Style Loaded. Attempting to load native markers...");
    _loadNativeMarkers();
  }

  void _onMapCreated(MapboxMap mapboxMap) {
    _mapboxMap = mapboxMap;
    _mapboxMap?.location.updateSettings(
        LocationComponentSettings(enabled: true, pulsingEnabled: true));

    // Disable default scale and compass
    _mapboxMap?.scaleBar.updateSettings(ScaleBarSettings(enabled: false));
    _mapboxMap?.compass.updateSettings(CompassSettings(enabled: false));

    _mapboxMap?.annotations.createPointAnnotationManager().then((manager) {
      _pointAnnotationManager = manager;
      _loadNativeMarkers();

      // Handle Taps
      _pointAnnotationManager
          ?.addOnPointAnnotationClickListener(_MomentPointClickListener(this));
    });
  }

  void _loadNativeMarkers() async {
    final events = ref.read(mapControllerProvider).valueOrNull;
    if (events == null || _pointAnnotationManager == null) {
      debugPrint(
          "Skipping markers: events=${events?.length}, manager=$_pointAnnotationManager");
      return;
    }

    // Clear existing
    await _pointAnnotationManager?.deleteAll();
    _annotationEventMap.clear();

    // Group
    final groups = _groupEventsByLocation(events);
    debugPrint("Loading native markers for ${groups.length} groups...");

    for (var group in groups) {
      if (group.isEmpty) continue;

      final topEvent = group.first;

      // Generate Image
      Uint8List markerImage;
      String iconId;

      if (group.length > 1) {
        iconId = "stack_${topEvent.id}_${group.length}";
        markerImage = await _markerGenerator.generateStackMarker(group);
      } else {
        iconId = "marker_${topEvent.id}";
        markerImage = await _markerGenerator.generateMarker(topEvent);
      }

      debugPrint(
          "Generated marker $iconId: ${markerImage.lengthInBytes} bytes");

      // Add to style
      try {
        // Force replace if exists by removing first? No, Mapbox handles it or we catch error.
        await _mapboxMap?.style.addStyleImage(
            iconId,
            2.0, // Scale
            MbxImage(width: 240, height: 240, data: markerImage),
            false, // sdf
            [], // stretchX
            [], // stretchY
            null // content
            );
        debugPrint("Added style image $iconId");
      } catch (e) {
        debugPrint(
            "Note: Style image $iconId might already exist or error: $e");
      }

      // Create Annotation
      try {
        final annotation =
            await _pointAnnotationManager?.create(PointAnnotationOptions(
          geometry: Point(coordinates: Position(topEvent.lng!, topEvent.lat!)),
          iconImage: iconId,
          iconSize: 1.0,
        ));

        if (annotation != null) {
          _annotationEventMap[annotation.id] = topEvent;
        }
      } catch (e) {
        debugPrint("Error creating annotation for $iconId: $e");
      }
    }
  }

  // --- Map Stack Dialog ---
  void _showStackDialog(List<Event> group) {
    showGeneralDialog(
      context: context,
      barrierDismissible: true,
      barrierLabel: "Dismiss",
      barrierColor: Colors.black54,
      pageBuilder: (context, anim1, anim2) {
        return Center(
          child: Material(
            color: Colors.transparent,
            child: Container(
                width: 320,
                height: 500,
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                    color: Colors.grey[900],
                    borderRadius: BorderRadius.circular(24),
                    boxShadow: const [
                      BoxShadow(color: Colors.black45, blurRadius: 20)
                    ]),
                child: Column(children: [
                  Text("${group.length} Events Here",
                      style: const TextStyle(
                          color: Colors.white,
                          fontSize: 18,
                          fontWeight: FontWeight.bold)),
                  const SizedBox(height: 16),
                  Expanded(
                      child: ListView.separated(
                          itemCount: group.length,
                          separatorBuilder: (_, __) =>
                              const SizedBox(height: 12),
                          itemBuilder: (ctx, idx) {
                            final event = group[idx];
                            return GestureDetector(
                                onTap: () {
                                  Navigator.pop(context);
                                  _showMomentDialog(event);
                                },
                                child: Transform.scale(
                                    scale: 0.95,
                                    child: MomentCard(
                                        event: event,
                                        isExpanded: true,
                                        enableTilt: false,
                                        showTitle: true,
                                        onTap: () {
                                          Navigator.pop(context);
                                          _showMomentDialog(event);
                                        })));
                          }))
                ])),
          ),
        );
      },
      transitionDuration: 300.ms,
      transitionBuilder: (context, anim1, anim2, child) {
        return Transform.scale(
          scale: Curves.easeOutBack.transform(anim1.value),
          child: child,
        );
      },
    );
  }

  // --- Feed Helpers ---
  Widget _buildFeedItem(int index, Event event) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      child: MomentCard(
        event: event,
        isExpanded: true,
        enableTilt: false,
        showTitle: false, // In feed, we just show the card
        onTap: () => _navigateToEvent(
            event), // Feed tap -> Full page navigation (or should it be overlay?)
        // Let's stick to simple navigation for Feed items to keep it distinct from Map interactions?
        // Or if user wants consistency: _showMomentDialog(event);
      ),
    );
  }

  Widget _buildEmptyFeedState(ScrollController scrollController) {
    return ListView(
      controller: scrollController,
      physics: const ClampingScrollPhysics(),
      padding: const EdgeInsets.all(20),
      children: [
        const SizedBox(height: 20),
        const Icon(Icons.event_busy, size: 64, color: Colors.white38),
        const SizedBox(height: 16),
        const Text("No Vibes Nearby",
            style: TextStyle(
                color: Colors.white, fontSize: 20, fontWeight: FontWeight.bold),
            textAlign: TextAlign.center),
        const SizedBox(height: 8),
        Text("Try moving around the map to find upcoming events.",
            style: TextStyle(color: Colors.grey[400], fontSize: 14),
            textAlign: TextAlign.center),
      ],
    );
  }



// --- Mapbox Listener Classes ---

class _MomentPointClickListener implements OnPointAnnotationClickListener {
  final _MomentsMapScreenState state;
  _MomentPointClickListener(this.state);

  @override
  void onPointAnnotationClick(PointAnnotation annotation) {
    final event = state._annotationEventMap[annotation.id];
    if (event != null) {
      state._showMomentDialog(event);
    }
  }
}
