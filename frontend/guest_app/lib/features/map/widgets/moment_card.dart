import 'dart:math';
import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import '../models.dart';

class MomentCard extends StatefulWidget {
  final Event event;
  final bool isExpanded;
  final VoidCallback onTap;
  final bool enableTilt;
  final bool showTitle;

  const MomentCard({
    super.key,
    required this.event,
    this.isExpanded = false,
    required this.onTap,
    this.enableTilt = true,
    this.showTitle = true,
  });

  @override
  State<MomentCard> createState() => _MomentCardState();
}

class _MomentCardState extends State<MomentCard> {
  late double tilt;

  @override
  void initState() {
    super.initState();
    // Random tilt for dynamic look
    if (widget.enableTilt) {
      final random = Random(widget.event.id.hashCode);
      tilt = (random.nextDouble() - 0.5) * 0.1; // +/- ~3 degrees
    } else {
      tilt = 0;
    }
  }

  @override
  Widget build(BuildContext context) {
    // Premium Design: Less Rounded (16), Shadow, Glow
    return GestureDetector(
      onTap: widget.onTap,
      child: Transform.rotate(
        angle: tilt,
        child: AnimatedContainer(
          duration: 300.ms,
          curve: Curves.elasticOut,
          width: widget.isExpanded ? 300 : 160,
          height: widget.isExpanded ? 400 : 200,
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(16), // Less rounded
            boxShadow: [
              BoxShadow(
                color: Colors.black.withOpacity(0.2),
                blurRadius: 16,
                offset: const Offset(0, 8),
              ),
              if (widget.isExpanded)
                BoxShadow(
                  color: Colors.purple.withOpacity(0.3),
                  blurRadius: 32,
                  spreadRadius: -4,
                ),
            ],
          ),
          child: ClipRRect(
            borderRadius: BorderRadius.circular(16),
            child: Stack(
              fit: StackFit.expand,
              children: [
                // Image Background
                if (widget.event.flyerFront != null)
                  Image.network(
                    widget.event.flyerFront!,
                    fit: BoxFit.cover,
                    errorBuilder: (_, __, ___) =>
                        Container(color: Colors.grey[900]),
                  )
                else
                  Container(
                    color: Colors.grey[900],
                    child: const Center(
                      child: Icon(Icons.event_available,
                          color: Colors.white54, size: 48),
                    ),
                  ),

                // Gradient Overlay
                Container(
                  decoration: BoxDecoration(
                    gradient: LinearGradient(
                      begin: Alignment.topCenter,
                      end: Alignment.bottomCenter,
                      colors: [
                        Colors.transparent,
                        Colors.black.withOpacity(0.2),
                        Colors.black.withOpacity(0.8),
                      ],
                      stops: const [0.5, 0.7, 1.0],
                    ),
                  ),
                ),

                // Content - Title Tag
                if (widget.showTitle)
                  Positioned(
                    top: 12,
                    right: 12,
                    child: Transform.rotate(
                      angle: 0.1,
                      child: Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 12, vertical: 6),
                        decoration: BoxDecoration(
                          color: Colors.white,
                          borderRadius: BorderRadius.circular(8),
                          boxShadow: const [
                            BoxShadow(
                              color: Colors.black26,
                              blurRadius: 4,
                              offset: Offset(2, 2),
                            )
                          ],
                        ),
                        child: Text(
                          widget.event.title.toUpperCase(),
                          style: const TextStyle(
                            fontFamily:
                                'Impact', // Fallback if custom font not loaded
                            fontWeight: FontWeight.bold,
                            color: Colors.black,
                            fontSize: 12,
                          ),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                    ).animate(onPlay: (c) => c.repeat(reverse: true)).scaleXY(
                        begin: 1.0,
                        end: 1.05,
                        duration: 2.seconds,
                        curve: Curves.easeInOut),
                  ),

                // Content - Date Badge
                Positioned(
                  top: 12,
                  left: 12,
                  child: Container(
                    padding:
                        const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
                    decoration: BoxDecoration(
                      color: Colors.white,
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text(
                          _getMonth(widget.event.date),
                          style: const TextStyle(
                            color: Colors.redAccent,
                            fontWeight: FontWeight.bold,
                            fontSize: 12, // Bigger
                          ),
                        ),
                        Text(
                          _getDay(widget.event.date),
                          style: const TextStyle(
                            color: Colors.black,
                            fontWeight: FontWeight.w900,
                            fontSize: 20, // Much Bigger
                            height: 1.0,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),

                // Content - Bottom Info (Avatars etc)
                Positioned(
                  bottom: 12,
                  left: 12,
                  right: 12,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      if (widget.isExpanded) ...[
                        // Description removed or use title/venue
                        const SizedBox(height: 8),
                      ],

                      // Social Signal Mock
                      Row(
                        children: [
                          // Avatar Stack Mock
                          SizedBox(
                            width: 60,
                            height: 24,
                            child: Stack(
                              children: [
                                for (int i = 0; i < 3; i++)
                                  Positioned(
                                    left: i * 16.0,
                                    child: Container(
                                      width: 24,
                                      height: 24,
                                      decoration: BoxDecoration(
                                        shape: BoxShape.circle,
                                        border: Border.all(
                                            color: Colors.white, width: 2),
                                        image: DecorationImage(
                                          image: NetworkImage(
                                              'https://i.pravatar.cc/150?u=$i'),
                                        ),
                                      ),
                                    ),
                                  ),
                              ],
                            ),
                          ),
                          const Spacer(),
                          if (widget.event.venueName != null)
                            Expanded(
                              child: Text(
                                "@ ${widget.event.venueName}",
                                style: const TextStyle(
                                  color: Colors.white,
                                  fontWeight: FontWeight.bold,
                                  fontSize: 12,
                                ),
                                textAlign: TextAlign.right,
                                overflow: TextOverflow.ellipsis,
                              ),
                            ),
                        ],
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  String _getMonth(DateTime? date) {
    if (date == null) return "DEC"; // fallback
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

  String _getDay(DateTime? date) {
    if (date == null) return "31";
    return date.day.toString();
  }
}
