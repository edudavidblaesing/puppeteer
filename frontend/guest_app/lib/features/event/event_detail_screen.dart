import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'dart:math' as math;
import 'package:flutter/services.dart'; // For Clipboard
import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';
import 'package:map_launcher/map_launcher.dart';
import 'package:mapbox_maps_flutter/mapbox_maps_flutter.dart' as mapbox;
import 'package:url_launcher/url_launcher.dart';
import 'package:cached_network_image/cached_network_image.dart';
import '../../core/auth_guard.dart';
import '../../core/constants.dart';
import '../map/models.dart';
import 'event_controller.dart';

class EventDetailScreen extends ConsumerStatefulWidget {
  final String eventId;
  final Event? eventExtra;
  final ScrollController? scrollController; // For DraggableScrollableSheet

  const EventDetailScreen({
    super.key,
    required this.eventId,
    this.eventExtra,
    this.scrollController,
  });

  @override
  ConsumerState<EventDetailScreen> createState() => _EventDetailScreenState();
}

class _EventDetailScreenState extends ConsumerState<EventDetailScreen> {
  @override
  Widget build(BuildContext context) {
    final state = ref.watch(eventControllerProvider(widget.eventId));
    final controller =
        ref.read(eventControllerProvider(widget.eventId).notifier);

    // Use fetched event or extra
    final event = state.event.value ?? widget.eventExtra;

    if (event == null) {
      if (state.event.isLoading) {
        return const Center(child: CircularProgressIndicator());
      }
      return const Center(
          child:
              Text('Event not found', style: TextStyle(color: Colors.white)));
    }

    final rsvpStatus = event.myRsvpStatus;
    // Format Date: "MAY 25"
    final months = [
      "JAN",
      "FEB",
      "MAR",
      "APR",
      "MAY",
      "JUN",
      "JUL",
      "AUG",
      "SEP",
      "OCT",
      "NOV",
      "DEC"
    ];
    final monthStr = months[event.date.month - 1];
    final dayStr = event.date.day.toString();
    final timeStr =
        "${event.date.hour}:${event.date.minute.toString().padLeft(2, '0')}";
    final weekDayStr = _getWeekday(event.date.weekday);

    return Scaffold(
      backgroundColor: const Color(0xFF000000),
      body: CustomScrollView(
        controller: widget.scrollController,
        slivers: [
          // --- HEADER / HERO SECTION ---
          SliverToBoxAdapter(
            child: Stack(
              children: [
                // Background Gradient/Blur
                if (event.flyerFront != null)
                  Positioned.fill(
                    child: Opacity(
                      opacity: 0.3,
                      child: Image.network(
                        event.flyerFront!,
                        fit: BoxFit.cover,
                      ).animate().fade(duration: 800.ms),
                    ),
                  ),
                Positioned.fill(
                  child: Container(
                    decoration: const BoxDecoration(
                      gradient: LinearGradient(
                          colors: [
                            Colors.black,
                            Colors.transparent,
                            Colors.black
                          ],
                          begin: Alignment.topCenter,
                          end: Alignment.bottomCenter,
                          stops: [0.0, 0.5, 1.0]),
                    ),
                  ),
                ),

                Padding(
                  padding: const EdgeInsets.fromLTRB(16, 60, 16, 0),
                  child: Column(
                    children: [
                      // Top Bar
                      if (widget.scrollController == null)
                        Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            IconButton(
                              icon: const Icon(Icons.arrow_back,
                                  color: Colors.white),
                              onPressed: () => context.pop(),
                              style: IconButton.styleFrom(
                                  backgroundColor: Colors.white10),
                            ),
                          ],
                        ),

                      const SizedBox(height: 20),

                      // Title Hero
                      Hero(
                        tag: 'event-title-${event.id}',
                        child: Material(
                          color: Colors.transparent,
                          child: Text(
                            event.title.toUpperCase(),
                            textAlign: TextAlign.center,
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                                fontSize: 32,
                                fontWeight: FontWeight.w900,
                                color: Colors.white,
                                fontFamily: 'Impact',
                                letterSpacing: 1.5,
                                shadows: [
                                  Shadow(color: Colors.black, blurRadius: 10)
                                ]),
                          ),
                        ),
                      ),

                      const SizedBox(height: 30),

                      // Image Hero
                      Hero(
                        tag: 'event-img-${event.id}',
                        child: Container(
                          height: 320,
                          width: double.infinity,
                          alignment: Alignment.center,
                          child: Transform.rotate(
                            angle: 0.05,
                            child:
                                _buildPhotoCard(event.flyerFront, height: 300),
                          ),
                        ),
                      ),

                      const SizedBox(height: 20),
                    ],
                  ),
                ),
              ],
            ),
          ),

          // --- INFO SECTION ---
          SliverToBoxAdapter(
            child: Container(
              padding: const EdgeInsets.all(24),
              decoration: const BoxDecoration(
                color: Color(0xFF121212),
                borderRadius: BorderRadius.vertical(top: Radius.circular(32)),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // Date & Time Row
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      // Date Hero
                      Hero(
                        tag: 'event-date-${event.id}',
                        child: Material(
                          color: Colors.transparent,
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(monthStr,
                                  style: const TextStyle(
                                      color: Colors.purpleAccent,
                                      fontWeight: FontWeight.bold,
                                      fontSize: 16)),
                              Text(dayStr,
                                  style: const TextStyle(
                                      color: Colors.white,
                                      fontSize: 36,
                                      fontWeight: FontWeight.w900)),
                            ],
                          ),
                        ),
                      ),

                      // Time Capsule (Start - End)
                      Expanded(
                        child: Container(
                          padding: const EdgeInsets.all(12),
                          decoration: BoxDecoration(
                              color: Colors.white10,
                              borderRadius: BorderRadius.circular(16)),
                          child: Row(
                            children: [
                              const Icon(Icons.access_time,
                                  color: Colors.purpleAccent),
                              const SizedBox(width: 12),
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(
                                        "$weekDayStr, ${event.startTime ?? timeStr}",
                                        style: const TextStyle(
                                            color: Colors.white,
                                            fontWeight: FontWeight.w600)),
                                    if (event.endTime != null)
                                      Text(
                                          "Until ${event.endTime} ${event.endDate != null && event.endDate!.day != event.date.day ? '(${_getWeekday(event.endDate!.weekday)})' : ''}",
                                          style: const TextStyle(
                                              color: Colors.white54,
                                              fontSize: 12))
                                  ],
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                    ],
                  ),

                  const SizedBox(height: 30),

                  // WHO'S GOING
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      const Text("Who's going?",
                          style: TextStyle(
                              color: Colors.white,
                              fontSize: 18,
                              fontWeight: FontWeight.bold)),
                      Text(
                          "${event.totalAttendees} Going • ${event.totalInterested} Interested",
                          style:
                              const TextStyle(color: Colors.grey, fontSize: 14))
                    ],
                  ),
                  const SizedBox(height: 12),
                  if (event.previewAttendees.isNotEmpty) ...[
                    // Logic for "Joined by..." text
                    if (event.friendsAttending.isNotEmpty)
                      Text(
                          "Joined by ${event.friendsAttending.first.username} ${event.friendsAttending.length > 1 ? 'and ${event.friendsAttending.length - 1} friends' : ''} ${event.totalAttendees - event.friendsAttending.length > 0 ? '+ ${event.totalAttendees - event.friendsAttending.length} others' : ''}",
                          style: const TextStyle(
                              color: Colors.white70, fontSize: 12)),
                    const SizedBox(height: 8),
                    _buildAttendeeStack(event.previewAttendees),
                  ] else if (event.totalAttendees > 0) ...[
                    // If we have count but no preview
                    Text("${event.totalAttendees} people are going",
                        style: const TextStyle(color: Colors.white70)),
                  ] else ...[
                    const Text("Be the first to join!",
                        style: TextStyle(
                            color: Colors.grey, fontStyle: FontStyle.italic)),
                  ],

                  const SizedBox(height: 30),

                  // VENUE / LOCATION (Map Preview)
                  // VENUE / LOCATION (Hybrid Map Preview)
                  const Text("LOCATION",
                      style: TextStyle(
                          color: Colors.white,
                          fontWeight: FontWeight.bold,
                          letterSpacing: 1.2)),
                  const SizedBox(height: 12),
                  if (event.lat != null && event.lng != null)
                    Column(
                      children: [
                        GestureDetector(
                          onTap: () => _launchMap(context, event.lat!,
                              event.lng!, event.venueName ?? event.title),
                          child: Container(
                            height: 200,
                            width: double.infinity,
                            clipBehavior: Clip.antiAlias,
                            decoration: BoxDecoration(
                              color: Colors.grey[900],
                              borderRadius: BorderRadius.circular(16),
                              border: Border.all(color: Colors.white10),
                            ),
                            child: Stack(
                              children: [
                                // MAP IMPLEMENTATION (Web vs Mobile)
                                if (kIsWeb)
                                  IgnorePointer(
                                    child: FlutterMap(
                                      options: MapOptions(
                                        initialCenter:
                                            LatLng(event.lat!, event.lng!),
                                        initialZoom: 15,
                                        interactionOptions:
                                            const InteractionOptions(
                                                flags: InteractiveFlag.none),
                                      ),
                                      children: [
                                        TileLayer(
                                          urlTemplate:
                                              "https://api.mapbox.com/styles/v1/mapbox/dark-v11/tiles/256/{z}/{x}/{y}@2x?access_token=${AppConstants.mapboxAccessToken}",
                                          additionalOptions: const {
                                            'accessToken':
                                                AppConstants.mapboxAccessToken,
                                            'id': 'mapbox.dark-v11',
                                          },
                                        ),
                                        MarkerLayer(markers: [
                                          Marker(
                                            point:
                                                LatLng(event.lat!, event.lng!),
                                            width: 40,
                                            height: 40,
                                            child: const Icon(Icons.location_on,
                                                color: Colors.redAccent,
                                                size: 40),
                                          )
                                        ])
                                      ],
                                    ),
                                  )
                                else
                                  mapbox.MapWidget(
                                    key: ValueKey("map-${event.id}"),
                                    cameraOptions: mapbox.CameraOptions(
                                      center: mapbox.Point(
                                          coordinates: mapbox.Position(
                                              event.lng!, event.lat!)),
                                      zoom: 14.0,
                                    ),
                                    styleUri: AppConstants.mapStyle,
                                    onMapCreated: (mapboxMap) {
                                      // Add marker on creation
                                      mapboxMap.annotations
                                          .createCircleAnnotationManager()
                                          .then((manager) {
                                        manager.create(
                                            mapbox.CircleAnnotationOptions(
                                          geometry: mapbox.Point(
                                              coordinates: mapbox.Position(
                                                  event.lng!, event.lat!)),
                                          circleRadius: 8.0,
                                          circleColor: Colors.redAccent.value,
                                          circleStrokeWidth: 2.0,
                                          circleStrokeColor: Colors.white.value,
                                        ));
                                      });
                                    },
                                    // Disable interaction for preview
                                    onScrollListener:
                                        (context) {}, // No-op to consume? No, use gestures settings if available or overlay
                                  ),

                                // Interaction Overlay (to catch taps over native view if needed, though GestureDetector above handles it)
                                Positioned.fill(
                                    child:
                                        Container(color: Colors.transparent)),

                                // "Open Map" Badge
                                Positioned(
                                  top: 12,
                                  right: 12,
                                  child: Container(
                                    padding: const EdgeInsets.symmetric(
                                        horizontal: 12, vertical: 6),
                                    decoration: BoxDecoration(
                                      color: Colors.black87,
                                      borderRadius: BorderRadius.circular(20),
                                      border: Border.all(color: Colors.white24),
                                    ),
                                    child: const Row(
                                      mainAxisSize: MainAxisSize.min,
                                      children: [
                                        Icon(Icons.map,
                                            color: Colors.white, size: 16),
                                        SizedBox(width: 8),
                                        Text("Open Map",
                                            style: TextStyle(
                                                color: Colors.white,
                                                fontWeight: FontWeight.bold,
                                                fontSize: 12)),
                                      ],
                                    ),
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ),
                        const SizedBox(height: 16),
                        // Address & Directions Row
                        Row(
                          children: [
                            Container(
                              padding: const EdgeInsets.all(10),
                              decoration: BoxDecoration(
                                  color: Colors.white10,
                                  borderRadius: BorderRadius.circular(12)),
                              child: const Icon(Icons.location_on_outlined,
                                  color: Colors.white70),
                            ),
                            const SizedBox(width: 16),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    event.venueName ?? "Event Location",
                                    style: const TextStyle(
                                        color: Colors.white,
                                        fontWeight: FontWeight.bold,
                                        fontSize: 16),
                                  ),
                                  if (event.venueAddress != null)
                                    Padding(
                                      padding: const EdgeInsets.only(top: 4.0),
                                      child: SelectableText(
                                        event.venueAddress!,
                                        style: const TextStyle(
                                            color: Colors.white54,
                                            fontSize: 14),
                                        onTap: () {
                                          Clipboard.setData(ClipboardData(
                                              text: event.venueAddress!));
                                          ScaffoldMessenger.of(context)
                                              .showSnackBar(const SnackBar(
                                                  content: Text(
                                                      "Address copied to clipboard"),
                                                  duration:
                                                      Duration(seconds: 1)));
                                        },
                                      ),
                                    ),
                                ],
                              ),
                            ),
                            // Copy Button
                            IconButton(
                              onPressed: () {
                                if (event.venueAddress != null) {
                                  Clipboard.setData(
                                      ClipboardData(text: event.venueAddress!));
                                  ScaffoldMessenger.of(context).showSnackBar(
                                      const SnackBar(
                                          content: Text("Copied!"),
                                          duration: Duration(seconds: 1)));
                                }
                              },
                              icon: const Icon(Icons.copy,
                                  color: Colors.white30, size: 20),
                            ),
                          ],
                        ),
                        const SizedBox(height: 16),
                        // Get Directions Button
                        SizedBox(
                          width: double.infinity,
                          child: OutlinedButton.icon(
                            onPressed: () => _launchMap(context, event.lat!,
                                event.lng!, event.venueName ?? event.title),
                            icon: const Icon(Icons.directions,
                                color: Colors.blueAccent),
                            label: const Text("Get Directions",
                                style: TextStyle(color: Colors.blueAccent)),
                            style: OutlinedButton.styleFrom(
                              side: const BorderSide(color: Colors.blueAccent),
                              shape: RoundedRectangleBorder(
                                  borderRadius: BorderRadius.circular(12)),
                              padding: const EdgeInsets.symmetric(vertical: 12),
                            ),
                          ),
                        ),
                      ],
                    )
                  else
                    // Fallback
                    Container(
                      width: double.infinity,
                      padding: const EdgeInsets.all(16),
                      decoration: BoxDecoration(
                          color: Colors.grey[900],
                          borderRadius: BorderRadius.circular(16)),
                      child: const Center(
                          child: Text("Location details not available",
                              style: TextStyle(color: Colors.white54))),
                    ),

                  const SizedBox(height: 40),

                  // ACTIONS
                  Row(
                    children: [
                      // GOING BUTTON
                      Expanded(
                        child: SizedBox(
                          height: 56, // Fixed Equal Height
                          child: ElevatedButton(
                            onPressed: () async {
                              if (await AuthGuard.ensureLoggedIn(
                                  context, ref)) {
                                controller.rsvp(rsvpStatus == 'going'
                                    ? 'not_going'
                                    : 'going');
                              }
                            },
                            style: ElevatedButton.styleFrom(
                              backgroundColor: rsvpStatus == 'going'
                                  ? const Color(0xFF5D3FD3)
                                  : Colors.white10,
                              shape: RoundedRectangleBorder(
                                  borderRadius: BorderRadius.circular(16)),
                              elevation: 0,
                            ),
                            child: Text(
                              rsvpStatus == 'going' ? "GOING" : "JOIN",
                              style: TextStyle(
                                  color: rsvpStatus == 'going'
                                      ? Colors.white
                                      : Colors.white70,
                                  fontWeight: FontWeight.bold,
                                  letterSpacing: 1),
                            ),
                          ),
                        ),
                      ),
                      const SizedBox(width: 16),
                      // INTERESTED BUTTON
                      Expanded(
                        child: SizedBox(
                          height: 56, // Fixed Equal Height
                          child: OutlinedButton(
                            onPressed: () async {
                              if (await AuthGuard.ensureLoggedIn(
                                  context, ref)) {
                                controller.rsvp(rsvpStatus == 'interested'
                                    ? 'not_going'
                                    : 'interested');
                              }
                            },
                            style: OutlinedButton.styleFrom(
                                side: BorderSide(
                                    color: rsvpStatus == 'interested'
                                        ? Colors.purpleAccent
                                        : Colors.white24,
                                    width: 2),
                                shape: RoundedRectangleBorder(
                                    borderRadius: BorderRadius.circular(16)),
                                backgroundColor: rsvpStatus == 'interested'
                                    ? Colors.purpleAccent.withOpacity(0.1)
                                    : Colors.transparent),
                            child: Text(
                              "INTERESTED",
                              style: TextStyle(
                                  color: rsvpStatus == 'interested'
                                      ? Colors.purpleAccent
                                      : Colors.white70,
                                  fontWeight: FontWeight.bold,
                                  letterSpacing: 1),
                            ),
                          ),
                        ),
                      ),
                    ],
                  ),

                  const SizedBox(height: 20),

                  // CHAT BUTTON
                  SizedBox(
                    width: double.infinity,
                    height: 56,
                    child: TextButton.icon(
                        onPressed: () async {
                          if (await AuthGuard.ensureLoggedIn(context, ref)) {
                            // ... join chat logic
                            try {
                              final roomId = await controller.joinChat();
                              if (roomId != null && context.mounted) {
                                context.push('/chat/$roomId',
                                    extra: event.title);
                              }
                            } catch (e) {
                              // show error
                            }
                          }
                        },
                        icon: const Icon(Icons.chat_bubble_outline,
                            color: Colors.white54),
                        label: const Text("Join Discussion",
                            style: TextStyle(color: Colors.white54))),
                  ),

                  const SizedBox(height: 80),
                ],
              ),
            ),
          )
        ],
      ),
    );
  }

  Widget _buildPhotoCard(String? url, {double height = 200}) {
    return Container(
      height: height,
      width: 250, // Slightly wider
      clipBehavior: Clip.antiAlias,
      decoration: BoxDecoration(
          color: Colors.grey[800],
          borderRadius: BorderRadius.circular(24),
          border: Border.all(color: Colors.white, width: 4),
          boxShadow: const [
            BoxShadow(
                color: Colors.black54, blurRadius: 20, offset: Offset(0, 10))
          ]),
      child: url != null
          ? CachedNetworkImage(
              imageUrl: url,
              fit: BoxFit.cover,
              placeholder: (context, url) => Container(
                color: Colors.grey[900],
                child: const Center(child: CircularProgressIndicator()),
              ),
              errorWidget: (context, url, error) => const Icon(Icons.error),
            )
          : const Center(
              child: Icon(Icons.image, color: Colors.white24, size: 40)),
    );
  }

  // Updated to use List<User> and fix layout constraints
  Widget _buildAttendeeStack(List<User> users) {
    // Ensure we have a container with width to allow Stack to calculate positions
    return SizedBox(
      width: double.infinity,
      height: 48,
      child: Stack(
        children: [
          for (int i = 0; i < math.min(users.length, 5); i++)
            Positioned(
              left: i * 32.0,
              child: Container(
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  border: Border.all(
                      color: const Color(0xFF121212),
                      width: 3), // Dark border to blend with bg
                ),
                child: CircleAvatar(
                  radius: 20,
                  backgroundColor: Colors.grey[800],
                  backgroundImage: (users[i].avatarUrl != null)
                      ? CachedNetworkImageProvider(users[i].avatarUrl!)
                      : null,
                  child: users[i].avatarUrl == null
                      ? const Icon(Icons.person, size: 20, color: Colors.white)
                      : null,
                ),
              ),
            ),
          if (users.length > 5)
            Positioned(
              left: 5 * 32.0,
              child: Container(
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  border: Border.all(color: const Color(0xFF121212), width: 3),
                ),
                child: CircleAvatar(
                  radius: 20,
                  backgroundColor: Colors.grey[800],
                  child: Text("+${users.length - 5}",
                      style: const TextStyle(
                          color: Colors.white, fontWeight: FontWeight.bold)),
                ),
              ),
            )
        ],
      ),
    );
  }

  String _getWeekday(int day) {
    const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    return days[day - 1];
  }

  Future<void> _launchMap(
      BuildContext context, double lat, double lng, String title) async {
    try {
      if (kIsWeb) {
        final url = Uri.parse(
            'https://www.google.com/maps/search/?api=1&query=$lat,$lng');
        if (await canLaunchUrl(url)) {
          await launchUrl(url, mode: LaunchMode.externalApplication);
        } else {
          debugPrint('Could not launch $url');
        }
      } else {
        final availableMaps = await MapLauncher.installedMaps;
        if (availableMaps.isNotEmpty && context.mounted) {
          await availableMaps.first.showMarker(
            coords: Coords(lat, lng),
            title: title,
          );
        }
      }
    } catch (e) {
      debugPrint('Error launching map: $e');
    }
  }
}
