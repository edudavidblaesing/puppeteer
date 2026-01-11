class User {
  final String id;
  final String username;
  final String fullName;
  final String? avatarUrl;
  final List<String> interests;
  final bool isFollowing;

  User({
    required this.id,
    required this.username,
    required this.fullName,
    this.avatarUrl,
    this.interests = const [],
    this.isFollowing = false,
  });

  factory User.fromJson(Map<String, dynamic> json) {
    return User(
      id: json['id'],
      username: json['username'],
      fullName: json['full_name'],
      avatarUrl: json['avatar_url'],
      interests:
          (json['interests'] as List?)?.map((e) => e.toString()).toList() ?? [],
      isFollowing: json['is_following'] ?? false,
    );
  }
}

class Artist {
  final String id;
  final String name;
  final String? imageUrl;
  final String? role; // e.g., "HEADLINER", "SUPPORT"
  final String? startTime;

  Artist({
    required this.id,
    required this.name,
    this.imageUrl,
    this.role,
    this.startTime,
  });

  factory Artist.fromJson(Map<String, dynamic> json) {
    return Artist(
      id: json['id'].toString(),
      name: json['name'],
      imageUrl: json['image_url'],
      role: json['role'],
      startTime: json['start_time'],
    );
  }
}

class Organizer {
  final String id;
  final String name;
  final String? imageUrl;

  Organizer({
    required this.id,
    required this.name,
    this.imageUrl,
  });

  factory Organizer.fromJson(Map<String, dynamic> json) {
    return Organizer(
      id: json['id'].toString(),
      name: json['name'],
      imageUrl: json['image_url'],
    );
  }
}

class Event {
  final String id;
  final String title;
  final DateTime date;
  final String? startTime;
  final DateTime? endDate;
  final String? endTime;
  final String? venueName;
  final String? venueAddress;
  final double? lat;
  final double? lng;
  final String? flyerFront;
  final int popularity;
  final List<User> friendsAttending;
  final List<User> friendsInterested;
  final List<User> previewAttendees;
  final int totalAttendees;
  final int totalInterested;
  final List<Artist> artists;
  final List<Organizer> organizers;
  final String publishStatus;
  final String? myRsvpStatus;

  Event({
    required this.id,
    required this.title,
    required this.date,
    this.startTime,
    this.endDate,
    this.endTime,
    this.venueName,
    this.venueAddress,
    this.lat,
    this.lng,
    this.flyerFront,
    this.popularity = 0,
    this.friendsAttending = const [],
    this.friendsInterested = const [],
    this.previewAttendees = const [],
    this.totalAttendees = 0,
    this.totalInterested = 0,
    this.artists = const [],
    this.organizers = const [],
    this.publishStatus = 'published',
    this.myRsvpStatus,
  });

  factory Event.fromJson(Map<String, dynamic> json) {
    return Event(
      id: json['id'],
      title: json['title'],
      date: DateTime.parse(json['date']),
      startTime: json['start_time'],
      endDate:
          json['end_date'] != null ? DateTime.parse(json['end_date']) : null,
      endTime: json['end_time'],
      venueName: json['venue_name'],
      venueAddress: json['venue_address'],
      lat: json['latitude'] != null
          ? double.tryParse(json['latitude'].toString())
          : null,
      lng: json['longitude'] != null
          ? double.tryParse(json['longitude'].toString())
          : null,
      flyerFront: json['flyer_front'],
      friendsAttending: (json['friends_attending'] as List?)
              ?.map((e) => User.fromJson(e))
              .toList() ??
          [],
      friendsInterested: (json['friends_interested'] as List?)
              ?.map((e) => User.fromJson(e))
              .toList() ??
          [],
      previewAttendees: (json['preview_attendees'] as List?)
              ?.map((e) => User.fromJson(e))
              .toList() ??
          [],
      totalAttendees: json['total_attendees'] != null
          ? int.tryParse(json['total_attendees'].toString()) ?? 0
          : 0,
      totalInterested: json['total_interested'] != null
          ? int.tryParse(json['total_interested'].toString()) ?? 0
          : 0,
      artists: (json['artists_list'] as List?)
              ?.map((e) => Artist.fromJson(e))
              .toList() ??
          [],
      organizers: (json['organizers_list'] as List?)
              ?.map((e) => Organizer.fromJson(e))
              .toList() ??
          [],
      publishStatus: json['publish_status'] ?? 'published',
      myRsvpStatus: json['my_rsvp_status'],
    );
  }
}

class City {
  final String id;
  final String name;
  final double lat;
  final double lng;

  City(
      {required this.id,
      required this.name,
      required this.lat,
      required this.lng});

  factory City.fromJson(Map<String, dynamic> json) {
    return City(
      id: json['id'].toString(),
      name: json['name'],
      lat: double.parse(json['latitude'].toString()),
      lng: double.parse(json['longitude'].toString()),
    );
  }
}
