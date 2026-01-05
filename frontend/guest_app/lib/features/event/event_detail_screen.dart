import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/api_service.dart';
import '../../core/auth_guard.dart';
import '../map/models.dart';

import 'event_controller.dart';
import '../chat/chat_repository.dart';

class EventDetailScreen extends ConsumerStatefulWidget {
  final String eventId;
  final Event? eventExtra;

  const EventDetailScreen({super.key, required this.eventId, this.eventExtra});

  @override
  ConsumerState<EventDetailScreen> createState() => _EventDetailScreenState();
}

class _EventDetailScreenState extends ConsumerState<EventDetailScreen> {
  @override
  void initState() {
    super.initState();
    // Trigger fetch if needed is automatic via Riverpod if we watch the provider, 
    // but the controller might need explicit 'refresh' if it doesn't auto-fetch.
    // Assuming EventController(eventId) auto-fetches in its build method.
    // If not, we might need: ref.read(eventControllerProvider(widget.eventId).notifier).loadEvent();
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(eventControllerProvider(widget.eventId));
    final controller = ref.read(eventControllerProvider(widget.eventId).notifier);

    // Use fetched event or extra
    final event = state.event.value ?? widget.eventExtra;

    if (event == null) {
       if (state.event.isLoading) {
         return const Scaffold(body: Center(child: CircularProgressIndicator()));
       }
       return Scaffold(
         appBar: AppBar(title: const Text('Event'), backgroundColor: Colors.black),
         body: const Center(child: Text('Event not found or failed to load')),
       );
    }

    final rsvpStatus = event.myRsvpStatus; // Use event directly, it should be updated by controller state ideally
    // Actually, state.event.value is the source of truth for updates. eventExtra is stale.
    // If state.event.value is null, we use eventExtra, but rsvpStatus might be old.
    // Best to use state.event.value if available, AND if not, use data from extra.

    return Scaffold(
      body: CustomScrollView(
        slivers: [
          SliverAppBar(
            expandedHeight: 250,
            pinned: true,
            flexibleSpace: FlexibleSpaceBar(
              title: Text(event.title, style: const TextStyle(shadows: [Shadow(blurRadius: 10, color: Colors.black)])),
              background: event.flyerFront != null 
                  ? Hero(
                      tag: 'event_image_${event.id}',
                      child: Image.network(
                        event.flyerFront!, 
                        fit: BoxFit.cover,
                        errorBuilder: (context, error, stackTrace) => Container(color: Colors.purple.shade900, child: const Icon(Icons.broken_image, color: Colors.white54)),
                      ),
                    )
                  : Container(color: Colors.purple.shade900),
            ),
          ),
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.all(16.0),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // Venue & Time
                  Row(
                    children: [
                      const Icon(Icons.location_on, color: Colors.white70),
                      const SizedBox(width: 8),
                      Text(event.venueName ?? 'Unknown Location', style: Theme.of(context).textTheme.titleMedium),
                    ],
                  ),
                  const SizedBox(height: 8),
                  Row(
                    children: [
                      const Icon(Icons.access_time, color: Colors.white70),
                      const SizedBox(width: 8),
                      Text('${event.date.hour}:${event.date.minute.toString().padLeft(2, '0')}', style: Theme.of(context).textTheme.titleMedium),
                    ],
                  ),
                  
                  const SizedBox(height: 24),
                  
                  // RSVP Actions
                  if (state.rsvpStatus.isLoading)
                     const Center(child: CircularProgressIndicator())
                  else
                  Row(
                    children: [
                      Expanded(
                        child: ElevatedButton(
                          onPressed: () async {
                              if (await AuthGuard.ensureLoggedIn(context, ref)) {
                                controller.rsvp('going');
                              }
                           }, 
                          style: ElevatedButton.styleFrom(
                            backgroundColor: rsvpStatus == 'going' ? Colors.green : Theme.of(context).primaryColor,
                            side: rsvpStatus == 'going' ? const BorderSide(color: Colors.white, width: 2) : null,
                          ),
                          child: Text(rsvpStatus == 'going' ? 'Going ✓' : 'Going', style: const TextStyle(color: Colors.white)),
                        ),
                      ),
                      const SizedBox(width: 16),
                      Expanded(
                        child: OutlinedButton(
                          onPressed: () async {
                              if (await AuthGuard.ensureLoggedIn(context, ref)) {
                                controller.rsvp('interested');
                              }
                          },
                          style: OutlinedButton.styleFrom(
                            backgroundColor: rsvpStatus == 'interested' ? Colors.white10 : null,
                            side: BorderSide(color: rsvpStatus == 'interested' ? Theme.of(context).primaryColor : Colors.white54),
                          ),
                          child: Text(rsvpStatus == 'interested' ? 'Interested ✓' : 'Interested'),
                        ),
                      ),
                    ],
                  ),
                  
                  const SizedBox(height: 32),
                  
                  // Friends Attending
                  Text('Friends Going', style: Theme.of(context).textTheme.headlineSmall),
                  const SizedBox(height: 16),
                  if (event.friendsAttending.isEmpty)
                    const Text('No friends going yet. Be the first!', style: TextStyle(color: Colors.white54))
                  else
                    SizedBox(
                      height: 60,
                      child: ListView.builder(
                        scrollDirection: Axis.horizontal,
                        itemCount: event.friendsAttending.length,
                        itemBuilder: (context, index) {
                          final friend = event.friendsAttending[index];
                          return Padding(
                            padding: const EdgeInsets.only(right: 12.0),
                            child: Column(
                              children: [
                                CircleAvatar(
                                  backgroundImage: NetworkImage(friend.avatarUrl ?? 'https://i.pravatar.cc/150'),
                                  onBackgroundImageError: (exception, stackTrace) {
                                  },
                                  child: const Icon(Icons.person),
                                ),
                                const SizedBox(height: 4),
                                Text(friend.username, style: const TextStyle(fontSize: 10)),
                              ],
                            ),
                          );
                        },
                      ),
                    ),
                    
                  const SizedBox(height: 32),
                  
                  // Chat Entry
                  ListTile(
                    title: const Text('Event Chat'),
                    subtitle: const Text('Join the conversation'),
                    trailing: const Icon(Icons.arrow_forward_ios),
                    leading: const CircleAvatar(backgroundColor: Colors.blueAccent, child: Icon(Icons.chat)),
                    onTap: () async {
                      if (await AuthGuard.ensureLoggedIn(context, ref)) {
                        // Navigate to Event Chat
                         try {
                           final roomId = await ref.read(chatRepositoryProvider).ensureEventRoom(event.id);
                           if (context.mounted) {
                             context.push('/chat/$roomId', extra: event.title);
                           }
                         } catch (e) {
                           if (context.mounted) {
                             ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Could not join chat: $e')));
                           }
                         }
                      }
                    },
                    tileColor: Colors.white10,
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                  ),

                  const SizedBox(height: 32),

                  // Comments Section
                  Text('Comments', style: Theme.of(context).textTheme.headlineSmall),
                  const SizedBox(height: 16),
                  
                  // Add Comment Input
                  Row(
                    children: [
                      Expanded(
                        child: TextField(
                          decoration: const InputDecoration(
                            hintText: 'Add a comment...',
                            filled: true,
                            fillColor: Colors.white10,
                            border: OutlineInputBorder(borderRadius: BorderRadius.all(Radius.circular(20))),
                          ),
                          onSubmitted: (value) {
                            if (value.isNotEmpty) {
                               controller.addComment(value);
                            }
                          },
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 16),

                  state.comments.when(
                    data: (comments) {
                      if (comments.isEmpty) return const Text('No comments yet.', style: TextStyle(color: Colors.white54));
                      return Column(
                        children: comments.map((c) => ListTile(
                          leading: CircleAvatar(
                            backgroundImage: NetworkImage(c.avatarUrl ?? 'https://i.pravatar.cc/150'),
                            onBackgroundImageError: (_, __) {},
                          ),
                          title: Text(c.username, style: const TextStyle(fontWeight: FontWeight.bold)),
                          subtitle: Text(c.content),
                          contentPadding: EdgeInsets.zero,
                        )).toList(),
                      );
                    }, 
                    error: (e, st) => const Text('Failed to load comments'), 
                    loading: () => const Center(child: CircularProgressIndicator())
                  )

                ],
              ),
            ),
          )
        ],
      ),
    );
  }
}
