import 'dart:math';
import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import '../models.dart';

class MomentMapMarker extends StatelessWidget {
  final Event event;
  final VoidCallback onTap;

  const MomentMapMarker({
    super.key,
    required this.event,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    // Determine friends to show
    final friends = event.friendsAttending ?? [];
    final hasFriends = friends.isNotEmpty;

    // Dynamic Tilt (Random stable per event)
    final random = Random(event.id.hashCode);
    final double tilt =
        (random.nextDouble() - 0.5) * 0.15; // +/- approx ~0.075 rad (~4deg)
    final bool isLabelRight = random.nextBool();

    return GestureDetector(
      onTap: onTap,
      child: SizedBox(
        width: 120, // Slightly wider for polaroid look
        height: 120,
        child: Stack(
          alignment: Alignment.center,
          clipBehavior: Clip.none,
          children: [
            // Orbiting Friends Layer (Behind or Around)
            if (hasFriends)
              ...List.generate(min(friends.length, 3), (index) {
                return _OrbitingFriend(
                  imageUrl: friends[index].avatarUrl,
                  index: index,
                  total: min(friends.length, 3),
                );
              }),

            // Main Event Polaroid
            Transform.rotate(
              angle: tilt,
              child: Container(
                width: 70,
                height: 85, // Rectangular aspect ratio for moment/polaroid
                padding: const EdgeInsets.all(3), // White border thickness
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(8), // Less rounded
                  boxShadow: const [
                    BoxShadow(
                        color: Colors.black45,
                        blurRadius: 6,
                        offset: Offset(0, 3))
                  ],
                ),
                child: Column(
                  children: [
                    Expanded(
                      child: ClipRRect(
                        borderRadius: BorderRadius.circular(6),
                        child: event.flyerFront != null
                            ? Image.network(
                                event.flyerFront!,
                                fit: BoxFit.cover,
                                width: double.infinity,
                                errorBuilder: (context, error, stackTrace) =>
                                    Container(color: Colors.grey[800]),
                              )
                            : Container(
                                color: Colors.grey[900],
                                child: const Icon(Icons.event,
                                    color: Colors.white70)),
                      ),
                    ),
                    const SizedBox(height: 6), // Bottom polaroid space
                  ],
                ),
              ),
            ).animate(onPlay: (c) => c.repeat(reverse: true)).scale(
                begin: const Offset(1, 1),
                end: const Offset(1.05, 1.05),
                duration: 2.seconds,
                curve: Curves.easeInOut),

            // Date Badge (Popping out)
            Positioned(
              top: 10,
              left: 5,
              child: Transform.rotate(
                angle: -0.1, // Slight counter-tilt
                child: Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 6, vertical: 4),
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(8),
                    boxShadow: const [
                      BoxShadow(color: Colors.black26, blurRadius: 2)
                    ],
                  ),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(
                        _getMonth(event.date).toUpperCase(),
                        style: const TextStyle(
                            fontSize: 10, // Bigger
                            fontWeight: FontWeight.bold,
                            color: Colors.red,
                            height: 1.0),
                      ),
                      Text(
                        _getDay(event.date),
                        style: const TextStyle(
                            fontSize: 16, // Much Bigger
                            fontWeight: FontWeight.w900,
                            color: Colors.black,
                            height: 1.0),
                      ),
                    ],
                  ),
                ),
              ),
            ),

            // Title Floating Tag (Dynamic Position & Tilt)
            Positioned(
              bottom: 25,
              right: isLabelRight ? -10 : null,
              left: isLabelRight ? null : -10,
              child: Transform.rotate(
                angle:
                    (random.nextDouble() - 0.5) * 0.3, // Random +/- ~0.15 rad
                child: Container(
                  constraints: const BoxConstraints(maxWidth: 100),
                  padding:
                      const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                  decoration: BoxDecoration(
                    color: Colors.blueAccent, // Vibrant contrast
                    borderRadius: BorderRadius.circular(6),
                    boxShadow: const [
                      BoxShadow(
                          color: Colors.black38,
                          blurRadius: 4,
                          offset: Offset(2, 2))
                    ],
                  ),
                  child: Text(
                    event.title.toUpperCase(),
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    textAlign: TextAlign.center,
                    style: const TextStyle(
                      color: Colors.white,
                      fontFamily: 'Impact', // Fallback
                      fontWeight: FontWeight.bold,
                      fontSize: 10,
                      height: 1.0,
                    ),
                  ),
                ),
              ).animate(onPlay: (c) => c.repeat(reverse: true)).scale(
                  begin: const Offset(1, 1),
                  end: const Offset(1.1, 1.1),
                  duration: 1.5.seconds,
                  curve: Curves.easeInOut),
            ),
          ],
        ),
      ),
    );
  }

  String _getMonth(DateTime? date) {
    if (date == null) return "DEC";
    const months = [
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
    return months[date.month - 1];
  }

  String _getDay(DateTime? date) => date?.day.toString() ?? "31";
}

class _OrbitingFriend extends StatelessWidget {
  final String? imageUrl;
  final int index;
  final int total;

  const _OrbitingFriend(
      {this.imageUrl, required this.index, required this.total});

  @override
  Widget build(BuildContext context) {
    // Randomize initial phase slightly based on index
    final delay = (index * 1000).ms;

    return Container(
      width: 90, // Slightly larger orbit for rectangular marker
      height: 90,
      alignment: Alignment.topCenter,
      child: Transform.translate(
        offset: const Offset(0, -10),
        child: Container(
          width: 24,
          height: 24,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            border: Border.all(color: Colors.white, width: 1.5),
            image: imageUrl != null
                ? DecorationImage(
                    image: NetworkImage(imageUrl!), fit: BoxFit.cover)
                : null,
            color: Colors.blueAccent,
          ),
        ),
      ),
    ).animate(onPlay: (c) => c.repeat()).rotate(
        begin: 0,
        end: 1,
        duration: 4.seconds,
        curve: Curves.linear,
        delay: delay * 0);
  }
}
