import 'dart:math';
import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import '../models.dart';
import 'moment_marker.dart';

class MomentStackMarker extends StatelessWidget {
  final List<Event> events;
  final Function(Event) onEventTap;
  final VoidCallback onStackTap;

  const MomentStackMarker({
    super.key,
    required this.events,
    required this.onEventTap,
    required this.onStackTap,
  });

  @override
  Widget build(BuildContext context) {
    if (events.isEmpty) return const SizedBox();

    // Sort by date or "interest" (mock logic for now)
    // Assuming events are already sorted by date from API
    final topEvent = events.first;
    final count = events.length;
    final random = Random(topEvent.id.hashCode);

    return GestureDetector(
      onTap: onStackTap,
      child: SizedBox(
        width: 140,
        height: 140, // Larger hit area
        child: Stack(
          clipBehavior: Clip.none,
          alignment: Alignment.center,
          children: [
            // Background Cards (Rotated Stack Effect)
            if (count > 1)
              Transform.rotate(
                angle: -0.2, // Tilted left
                child: _StackLayer(color: Colors.white.withOpacity(0.8)),
              )
                  .animate()
                  .slide(begin: const Offset(0.1, 0.1), duration: 600.ms),

            if (count > 2)
              Transform.rotate(
                angle: 0.15, // Tilted right
                child: _StackLayer(color: Colors.white.withOpacity(0.6)),
              )
                  .animate()
                  .slide(begin: const Offset(-0.1, -0.05), duration: 700.ms),

            // Top Card (The Main Event Marker)
            // reusing logic similar to MomentMapMarker but wrapped
            MomentMapMarker(
              event: topEvent,
              onTap: onStackTap, // Tapping the top card also opens the stack
            ),

            // Badge for Count (+3)
            if (count > 1)
              Positioned(
                top: 10,
                right: 10,
                child: Container(
                  padding: const EdgeInsets.all(8),
                  decoration: const BoxDecoration(
                    color: Colors.red,
                    shape: BoxShape.circle,
                    boxShadow: [
                      BoxShadow(
                        color: Colors.black45,
                        blurRadius: 4,
                        offset: Offset(0, 2),
                      )
                    ],
                  ),
                  child: Text(
                    "+${count - 1}",
                    style: const TextStyle(
                      color: Colors.white,
                      fontWeight: FontWeight.bold,
                      fontSize: 14,
                    ),
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

class _StackLayer extends StatelessWidget {
  final Color color;

  const _StackLayer({required this.color});

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 70,
      height: 85,
      decoration: BoxDecoration(
        color: color,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: Colors.white, width: 2),
        boxShadow: const [
          BoxShadow(color: Colors.black26, blurRadius: 4, offset: Offset(0, 2))
        ],
      ),
    );
  }
}
