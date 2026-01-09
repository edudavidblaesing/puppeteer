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
  CircleAnnotationManager? _circleAnnotationManager;
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
      score += (e.friendsAttending?.length ?? 0) * 5;
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

          // Map Tap Area (Invisible layer to detect taps on "empty" map when detail is open)
          // Actually, FlutterMap handles taps, but for Native?
          // Let's rely on map's own OnMapClick for now.

          // 2. Floating UI Layer (Search, Profile)
          // Hide when event is selected to reduce clutter
          if (_selectedEvent == null)
            Transform.translate(
              offset: Offset(0, _mapOffset),
              child: FloatingMapUI(
                onMenuTap: () => Scaffold.of(context).openDrawer(),
                onSearchTap: () => context.push('/friends'),
                onAvatarTap: () => context.push('/profile'),
                onNewMomentTap: () {
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(content: Text("Create Moment Flow")),
                  );
                },
              ),
            ),

          // 3. Create Button (if no event selected)
          if (_selectedEvent == null)
            Positioned(
              bottom: 100, // Above feed sheet offset
              right: 20,
              child: FloatingActionButton(
                backgroundColor: Colors.white,
                child: const Icon(Icons.add, color: Colors.black),
                onPressed: () {
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(content: Text("Create Moment Flow")),
                  );
                },
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
                // Optional: Close if user drags very low?
                // DraggableScrollableSheet handles minChildSize.
                // We can create a "drag to dismiss" feel if we want,
                // but standard behavior is fine for now.
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
                                // Ensure it respects notch inside the sheet context?
                                // Actually SafeArea is usually top-level.
                                // The sheet might be scrolled up.
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
    final events = eventsAsync.valueOrNull ?? [];
    final bool showCityClusters = _currentZoom < 11.0;

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
          markers: showCityClusters
              ? [
                  fm.Marker(
                    point: const ll.LatLng(52.5200, 13.4050),
                    width: 160,
                    height: 60,
                    child: GestureDetector(
                        onTap: () => _flutterMapController.move(
                            const ll.LatLng(52.5200, 13.4050), 13.0),
                        child: _buildCityBadge(events.length)),
                  )
                ]
              : _groupEventsByLocation(events).map<fm.Marker>((group) {
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
                        // markersAlignment: Alignment.center, // Removed invalid property
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

  Widget _buildCityBadge(int count) {
    return Container(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
        decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(30),
            boxShadow: const [
              BoxShadow(
                  color: Colors.black45, blurRadius: 10, offset: Offset(0, 4))
            ]),
        child: Row(mainAxisAlignment: MainAxisAlignment.center, children: [
          const Text("BERLIN",
              style: TextStyle(
                  color: Colors.black,
                  fontWeight: FontWeight.w900,
                  fontSize: 16)),
          const SizedBox(width: 8),
          Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
              decoration: BoxDecoration(
                  color: Colors.purpleAccent,
                  borderRadius: BorderRadius.circular(12)),
              child: Text("$count",
                  style: const TextStyle(
                      color: Colors.white, fontWeight: FontWeight.bold)))
        ]));
  }

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
      onTapListener: (context) => _onMapTap(), // Pass simple callback
    );
  }

  void _onMapCreated(MapboxMap mapboxMap) {
    _mapboxMap = mapboxMap;
    _mapboxMap?.location.updateSettings(
        LocationComponentSettings(enabled: true, pulsingEnabled: true));

    _mapboxMap?.annotations.createCircleAnnotationManager().then((manager) {
      _circleAnnotationManager = manager;
      _loadMarkers();
      _circleAnnotationManager?.addOnCircleAnnotationClickListener(
          _MomentAnnotationClickListener(this));
    });
  }

  void _loadMarkers() async {
    final events = ref.read(mapControllerProvider).valueOrNull;
    if (events == null || _circleAnnotationManager == null) return;
    await _circleAnnotationManager?.deleteAll();
    for (var event in events) {
      if (event.lat == null || event.lng == null) continue;
      await _circleAnnotationManager?.create(CircleAnnotationOptions(
        geometry: Point(coordinates: Position(event.lng!, event.lat!)),
        circleRadius: 10.0,
        circleColor: Colors.purpleAccent.value,
        circleStrokeWidth: 2.0,
        circleStrokeColor: Colors.white.value,
      ));
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
}

// --- Mapbox Listener Classes ---

// Click Listener for Circle Annotations (Must implement interface)
class _MomentAnnotationClickListener
    implements OnCircleAnnotationClickListener {
  final _MomentsMapScreenState state;
  _MomentAnnotationClickListener(this.state);

  @override
  void onCircleAnnotationClick(CircleAnnotation annotation) {
    // Basic native tap handler - just find match
    final events = state.ref.read(mapControllerProvider).valueOrNull;
    if (events == null || events.isEmpty) return;

    // For now, naive matching or just open first
    state._showMomentDialog(events.first);
  }
}
