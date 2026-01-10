import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'dart:math' as math;
import '../../core/auth_guard.dart';
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
      return const Center(child: Text('Event not found'));
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
      backgroundColor: Colors.white, // Light mockup style (or adapt to dark?)
      // User accepted plan to "Adapt to Dark Mode".
      // Let's stick to a Dark Theme base for consistency with Map.
      body: Container(
        color: const Color(0xFF121212), // Dark Background
        child: CustomScrollView(
          controller: widget.scrollController,
          slivers: [
            // --- HEADER / HERO SECTION ---
            SliverToBoxAdapter(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(16, 60, 16, 0),
                child: Column(
                  children: [
                    // Top Bar (only if not in sheet? Sheet has grab handle)
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
                          const Text("LIVE MOMENT",
                              style: TextStyle(
                                  color: Colors.purpleAccent,
                                  fontWeight: FontWeight.bold,
                                  letterSpacing: 1.2)),
                          IconButton(
                            icon: const Icon(Icons.more_horiz,
                                color: Colors.white),
                            onPressed: () {},
                            style: IconButton.styleFrom(
                                backgroundColor: Colors.white10),
                          ),
                        ],
                      ),

                    const SizedBox(height: 20),

                    // "PLACE OF POWER" Text (Stylized)
                    // We'll use the Event Title or a catchphrase here if distinct
                    ShaderMask(
                      shaderCallback: (bounds) => const LinearGradient(
                        colors: [Colors.white, Colors.white38],
                        begin: Alignment.topCenter,
                        end: Alignment.bottomCenter,
                      ).createShader(bounds),
                      child: Text(
                        event.title.toUpperCase(),
                        textAlign: TextAlign.center,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          fontSize: 32,
                          fontWeight: FontWeight.w900,
                          color: Colors.white,
                          fontFamily: 'Impact', // Or nearest bold font
                          letterSpacing: 1.5,
                        ),
                      ),
                    ),

                    const SizedBox(height: 30),

                    // TILTED PHOTO STACK
                    SizedBox(
                      height: 320,
                      child: Stack(
                        alignment: Alignment.center,
                        clipBehavior: Clip.none,
                        children: [
                          // Back Card (Rotated Left)
                          Transform.rotate(
                            angle: -0.15,
                            child: _buildPhotoCard(event.flyerFront,
                                height: 260, opacity: 0.6),
                          ),
                          // Front Card (Rotated Right)
                          Transform.rotate(
                            angle: 0.08,
                            child:
                                _buildPhotoCard(event.flyerFront, height: 280),
                          ),
                          // "87 photos" Badge
                          Positioned(
                            bottom: 10,
                            right: 40,
                            child: Container(
                              padding: const EdgeInsets.symmetric(
                                  horizontal: 16, vertical: 8),
                              decoration: BoxDecoration(
                                  color: const Color(0xFF5D3FD3), // Deep Purple
                                  borderRadius: BorderRadius.circular(20),
                                  boxShadow: const [
                                    BoxShadow(
                                        color: Colors.black45,
                                        blurRadius: 8,
                                        offset: Offset(0, 4))
                                  ]),
                              child: const Text(
                                  "12 photos", // MOCKED DO NOT HAVE COUNT YET
                                  style: TextStyle(
                                      color: Colors.white,
                                      fontWeight: FontWeight.bold)),
                            ),
                          )
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ),

            // --- INFO SECTION ---
            SliverToBoxAdapter(
              child: Container(
                margin: const EdgeInsets.only(top: 20),
                padding: const EdgeInsets.all(24),
                decoration: const BoxDecoration(
                  color: Color(0xFF1E1E1E), // Slightly lighter dark for card
                  borderRadius: BorderRadius.vertical(top: Radius.circular(32)),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    // Title & Date Row
                    Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(event.title,
                                  style: const TextStyle(
                                      color: Colors.white,
                                      fontSize: 24,
                                      fontWeight: FontWeight.bold)),
                              const SizedBox(height: 8),
                              Row(
                                children: [
                                  const Icon(Icons.location_on,
                                      color: Colors.grey, size: 16),
                                  const SizedBox(width: 4),
                                  Expanded(
                                    child: Text(
                                        event.venueName ?? "Secret Location",
                                        style: const TextStyle(
                                            color: Colors.grey, fontSize: 14)),
                                  ),
                                ],
                              )
                            ],
                          ),
                        ),
                        // Date Badge
                        Column(
                          children: [
                            Text(monthStr,
                                style: const TextStyle(
                                    color: Colors.purpleAccent,
                                    fontWeight: FontWeight.bold)),
                            Text(dayStr,
                                style: const TextStyle(
                                    color: Colors.white,
                                    fontSize: 28,
                                    fontWeight: FontWeight.w900)),
                          ],
                        )
                      ],
                    ),

                    const SizedBox(height: 20),

                    // Time Capsule
                    Container(
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                          color: Colors.white10,
                          borderRadius: BorderRadius.circular(16)),
                      child: Row(
                        children: [
                          const Icon(Icons.access_time,
                              color: Colors.purpleAccent),
                          const SizedBox(width: 12),
                          Text("$weekDayStr, $timeStr",
                              style: const TextStyle(
                                  color: Colors.white,
                                  fontWeight: FontWeight.w600)),
                        ],
                      ),
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
                            style: const TextStyle(
                                color: Colors.grey, fontSize: 14))
                      ],
                    ),
                    const SizedBox(height: 12),
                    if (event.friendsAttending.isNotEmpty) ...[
                      const Text("Friends Going",
                          style:
                              TextStyle(color: Colors.white70, fontSize: 12)),
                      const SizedBox(height: 8),
                      _buildAttendeeStack(event.friendsAttending),
                      const SizedBox(height: 16),
                    ],
                    if (event.friendsInterested.isNotEmpty) ...[
                      const Text("Friends Interested",
                          style:
                              TextStyle(color: Colors.white70, fontSize: 12)),
                      const SizedBox(height: 8),
                      _buildAttendeeStack(event.friendsInterested),
                    ],
                    if (event.friendsAttending.isEmpty &&
                        event.friendsInterested.isEmpty)
                      const Text("Be the first friend to join!",
                          style: TextStyle(color: Colors.grey)),

                    const SizedBox(height: 30),

                    // YOUR STATUS ACTION ROW
                    const Text("Your Status",
                        style: TextStyle(
                            color: Colors.white,
                            fontSize: 18,
                            fontWeight: FontWeight.bold)),
                    const SizedBox(height: 16),
                    Row(
                      children: [
                        Expanded(
                          flex: 2,
                          child: ElevatedButton.icon(
                            onPressed: () async {
                              if (await AuthGuard.ensureLoggedIn(
                                  context, ref)) {
                                controller.rsvp('going');
                              }
                            },
                            icon: const Icon(Icons.check_circle,
                                color: Colors.white),
                            label:
                                Text(rsvpStatus == 'going' ? "Going" : "Join"),
                            style: ElevatedButton.styleFrom(
                              backgroundColor: const Color(0xFF5D3FD3),
                              foregroundColor: Colors.white,
                              padding: const EdgeInsets.symmetric(vertical: 16),
                              shape: RoundedRectangleBorder(
                                  borderRadius: BorderRadius.circular(30)),
                              elevation: rsvpStatus == 'going' ? 4 : 8,
                            ),
                          ),
                        ),
                        const SizedBox(width: 12),
                        _buildStatusButton(context,
                            label: "Interested",
                            icon: Icons.star_border,
                            isSelected: rsvpStatus == 'interested',
                            onTap: () async {
                          if (await AuthGuard.ensureLoggedIn(context, ref)) {
                            controller.rsvp('interested');
                          }
                        }),
                        const SizedBox(width: 12),
                        _buildStatusButton(context,
                            label: "No",
                            icon: Icons.cancel_outlined,
                            isSelected: false,
                            onTap: () {}),
                      ],
                    ),

                    const SizedBox(height: 40),
                    const SizedBox(height: 40),
                    Center(
                      child: ElevatedButton.icon(
                        onPressed: () async {
                          if (await AuthGuard.ensureLoggedIn(context, ref)) {
                            try {
                              final roomId = await controller.joinChat();
                              if (roomId != null && context.mounted) {
                                context.push('/chat/$roomId',
                                    extra:
                                        event.title); // Pass title for header
                              }
                            } catch (e) {
                              if (context.mounted) {
                                ScaffoldMessenger.of(context)
                                    .showSnackBar(SnackBar(
                                  content: Text(e
                                      .toString()
                                      .replaceAll('Exception: ', '')),
                                  backgroundColor: Colors.redAccent,
                                  behavior: SnackBarBehavior.floating,
                                  action: SnackBarAction(
                                    label: 'Join',
                                    textColor: Colors.white,
                                    onPressed: () {
                                      controller.rsvp('interested');
                                    },
                                  ),
                                ));
                              }
                            }
                          }
                        },
                        icon: const Icon(Icons.chat_bubble_outline),
                        label: const Text("Join Discussion"),
                        style: ElevatedButton.styleFrom(
                          backgroundColor: Colors.white10,
                          foregroundColor: Colors.white,
                          padding: const EdgeInsets.symmetric(
                              horizontal: 32, vertical: 16),
                          shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(30)),
                        ),
                      ),
                    ),
                    const SizedBox(height: 100), // Bottom padding
                  ],
                ),
              ),
            )
          ],
        ),
      ),
    );
  }

  Widget _buildPhotoCard(String? url,
      {double height = 200, double opacity = 1.0}) {
    return Container(
      height: height,
      width: 220,
      decoration: BoxDecoration(
          color: Colors.grey[800],
          borderRadius: BorderRadius.circular(24),
          border: Border.all(color: Colors.white, width: 4),
          boxShadow: const [
            BoxShadow(
                color: Colors.black54, blurRadius: 20, offset: Offset(0, 10))
          ],
          image: url != null
              ? DecorationImage(
                  image: NetworkImage(url),
                  fit: BoxFit.cover,
                  colorFilter: opacity < 1.0
                      ? ColorFilter.mode(Colors.black.withOpacity(1 - opacity),
                          BlendMode.dstATop)
                      : null)
              : null),
      child: url == null
          ? const Center(
              child: Icon(Icons.image, color: Colors.white24, size: 40))
          : null,
    );
  }

  Widget _buildStatusButton(BuildContext context,
      {required String label,
      required IconData icon,
      required bool isSelected,
      required VoidCallback onTap}) {
    return Expanded(
        child: GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 16),
        decoration: BoxDecoration(
            color: isSelected ? Colors.white : Colors.transparent,
            borderRadius: BorderRadius.circular(30),
            border: Border.all(color: Colors.white24)),
        child: Column(
          children: [
            Icon(icon,
                color: isSelected ? Colors.black : Colors.white, size: 20),
            const SizedBox(height: 4),
            Text(label,
                style: TextStyle(
                    color: isSelected ? Colors.black : Colors.white,
                    fontSize: 12,
                    fontWeight: FontWeight.bold))
          ],
        ),
      ),
    ));
  }

  Widget _buildAttendeeStack(List<dynamic> friends) {
    // Logic for stacked avatars
    return SizedBox(
      width: double.infinity,
      height: 40,
      child: Stack(
        children: [
          for (int i = 0; i < math.min(friends.length, 5); i++)
            Positioned(
              left: i * 28.0,
              child: CircleAvatar(
                radius: 18,
                backgroundColor: Colors.white,
                child: CircleAvatar(
                  radius: 16,
                  backgroundImage: NetworkImage(
                      friends[i].avatarUrl ?? 'https://i.pravatar.cc/150'),
                ),
              ),
            ),
          if (friends.length > 3)
            Positioned(
              left: 3 * 24.0,
              child: CircleAvatar(
                radius: 18,
                backgroundColor: Colors.white,
                child: CircleAvatar(
                  radius: 16,
                  backgroundColor: Colors.grey[200],
                  child: Text("+${friends.length - 3}",
                      style: const TextStyle(
                          color: Colors.black,
                          fontSize: 10,
                          fontWeight: FontWeight.bold)),
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
}
