import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import 'event_repository.dart';
import '../map/models.dart';

class MyEventsScreen extends ConsumerStatefulWidget {
  const MyEventsScreen({super.key});

  @override
  ConsumerState<MyEventsScreen> createState() => _MyEventsScreenState();
}

class _MyEventsScreenState extends ConsumerState<MyEventsScreen> {
  late Future<List<Event>> _myEventsFuture;

  @override
  void initState() {
    super.initState();
    _loadEvents();
  }

  void _loadEvents() {
    _myEventsFuture = ref.read(eventRepositoryProvider).getMyEvents();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('My RSVPs'),
        backgroundColor: Colors.black,
      ),
      body: FutureBuilder<List<Event>>(
        future: _myEventsFuture,
        builder: (context, snapshot) {
          if (snapshot.connectionState == ConnectionState.waiting) {
            return const Center(child: CircularProgressIndicator());
          }
          if (snapshot.hasError) {
            return Center(child: Text('Error: ${snapshot.error}', style: const TextStyle(color: Colors.white)));
          }
          final events = snapshot.data ?? [];
          if (events.isEmpty) {
            return const Center(child: Text('No RSVPs yet.', style: TextStyle(color: Colors.white54)));
          }

          return ListView.separated(
            padding: const EdgeInsets.all(16),
            itemCount: events.length,
            separatorBuilder: (_, __) => const SizedBox(height: 12),
            itemBuilder: (context, index) {
              final event = events[index];
              return Card(
                color: Colors.grey[900],
                child: ListTile(
                  leading: event.flyerFront != null
                      ? ClipRRect(
                          borderRadius: BorderRadius.circular(4),
                          child: Image.network(
                            event.flyerFront!,
                            width: 50,
                            height: 50,
                            fit: BoxFit.cover,
                            errorBuilder: (_, __, ___) => const Icon(Icons.event),
                          ),
                        )
                      : const Icon(Icons.event, size: 40),
                  title: Text(event.title, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
                  subtitle: Text(
                    '${DateFormat.MMMd().format(event.date)} at ${event.venueName}',
                    style: TextStyle(color: Colors.grey[400]),
                  ),
                  trailing: const Chip(
                    label: Text('Going', style: TextStyle(color: Colors.white, fontSize: 10)),
                    backgroundColor: Colors.green,
                    padding: EdgeInsets.zero,
                  ),
                  onTap: () => context.push('/event/${event.id}', extra: event),
                ),
              );
            },
          );
        },
      ),
    );
  }
}
