import 'package:flutter/material.dart';
import 'package:cached_network_image/cached_network_image.dart';
import 'package:intl/intl.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../map/models.dart';
import '../../core/auth_guard.dart';

class EventCard extends ConsumerWidget {
  final Event event;
  final VoidCallback? onTap;
  final VoidCallback? onLike;
  final VoidCallback? onRsvp;

  const EventCard({
    super.key,
    required this.event,
    this.onTap,
    this.onLike,
    this.onRsvp,
  });

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final dateFormat = DateFormat('MMM d, y • h:mm a');

    return GestureDetector(
      onTap: onTap,
      child: Container(
        margin: const EdgeInsets.only(bottom: 24),
        decoration: BoxDecoration(
          color: const Color(0xFF1E1E1E),
          borderRadius: BorderRadius.circular(20),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withOpacity(0.3),
              blurRadius: 15,
              offset: const Offset(0, 8),
            ),
          ],
        ),
        clipBehavior: Clip.antiAlias,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Image Section
            Stack(
              children: [
                AspectRatio(
                  aspectRatio: 16 / 9,
                  child: event.flyerFront != null
                      ? Hero(
                          tag: 'event_image_${event.id}',
                          child: CachedNetworkImage(
                            imageUrl: event.flyerFront!,
                            fit: BoxFit.cover,
                            placeholder: (context, url) => Container(
                              color: Colors.grey[900],
                              child: const Center(
                                child: CircularProgressIndicator(strokeWidth: 2),
                              ),
                            ),
                            errorWidget: (context, url, error) => Container(
                              color: Colors.grey[900],
                              child: const Icon(Icons.broken_image, color: Colors.grey),
                            ),
                          ),
                        )
                      : Container(
                          color: Colors.grey[900],
                          child: const Icon(Icons.event,
                              size: 48, color: Colors.white24),
                        ),
                ),
                // Date Badge
                Positioned(
                  top: 12,
                  right: 12,
                  child: Container(
                    padding:
                        const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                    decoration: BoxDecoration(
                      color: Colors.black.withOpacity(0.7),
                      borderRadius: BorderRadius.circular(12),
                      // backdropFilter: null, // Removed invalid property
                    ),
                    child: Column(
                      children: [
                        Text(
                          DateFormat('MMM').format(event.date).toUpperCase(),
                          style: const TextStyle(
                            color: Colors.redAccent,
                            fontSize: 10,
                            fontWeight: FontWeight.w900,
                          ),
                        ),
                        Text(
                          DateFormat('d').format(event.date),
                          style: const TextStyle(
                            color: Colors.white,
                            fontSize: 18,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ],
            ),

            // Content Section
            Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              event.title,
                              style: Theme.of(context)
                                  .textTheme
                                  .titleLarge
                                  ?.copyWith(
                                    fontWeight: FontWeight.bold,
                                    height: 1.1,
                                  ),
                              maxLines: 2,
                              overflow: TextOverflow.ellipsis,
                            ),
                            const SizedBox(height: 6),
                            if (event.venueName != null)
                              Row(
                                children: [
                                  Icon(Icons.location_on,
                                      size: 14, color: Colors.grey[400]),
                                  const SizedBox(width: 4),
                                  Expanded(
                                    child: Text(
                                      event.venueName!,
                                      style: Theme.of(context)
                                          .textTheme
                                          .bodyMedium
                                          ?.copyWith(
                                            color: Colors.grey[400],
                                          ),
                                      maxLines: 1,
                                      overflow: TextOverflow.ellipsis,
                                    ),
                                  ),
                                ],
                              ),
                          ],
                        ),
                      ),
                      // Action Buttons
                      Row(
                        children: [
                          IconButton(
                            onPressed: () async {
                              if (await AuthGuard.ensureLoggedIn(context, ref)) {
                                onRsvp?.call();
                              }
                            },
                            icon: const Icon(Icons.confirmation_number_outlined),
                            color: Theme.of(context).primaryColor,
                            splashRadius: 24,
                          ),
                        ],
                      ),
                    ],
                  ),
                  
                  const SizedBox(height: 12),
                  
                  // Social Proof / Attendees
                  if (event.friendsAttending.isNotEmpty)
                    Row(
                      children: [
                        SizedBox(
                          height: 24,
                          width: 24.0 * event.friendsAttending.length * 0.7 + 10,
                          child: Stack(
                            children: [
                              for (var i = 0; i < event.friendsAttending.length; i++)
                                Positioned(
                                  left: i * 14.0,
                                  child: Container(
                                    decoration: BoxDecoration(
                                      shape: BoxShape.circle,
                                      border: Border.all(color: const Color(0xFF1E1E1E), width: 2),
                                    ),
                                    child: CircleAvatar(
                                      radius: 10,
                                      backgroundColor: Colors.grey[800],
                                      backgroundImage: event.friendsAttending[i].avatarUrl != null 
                                          ? NetworkImage(event.friendsAttending[i].avatarUrl!) 
                                          : null,
                                      child: event.friendsAttending[i].avatarUrl == null
                                          ? Text(event.friendsAttending[i].username[0].toUpperCase(), style: const TextStyle(fontSize: 8))
                                          : null,
                                    ),
                                  ),
                                ),
                            ],
                          ),
                        ),
                        const SizedBox(width: 8),
                        Text(
                          '${event.friendsAttending.length} friends going',
                          style: TextStyle(color: Colors.grey[500], fontSize: 12),
                        ),
                      ],
                    ),
                ],
              ),
            ),
          ],
        ),
      ).animate().fadeIn(duration: 400.ms).moveY(begin: 20),
    );
  }
}
