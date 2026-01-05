class User {
  final String id;
  final String username;
  final String fullName;
  final String? avatarUrl;
  
  User({required this.id, required this.username, required this.fullName, this.avatarUrl});
  
  factory User.fromJson(Map<String, dynamic> json) {
    return User(
      id: json['id'],
      username: json['username'],
      fullName: json['full_name'],
      avatarUrl: json['avatar_url'],
    );
  }
}

class Event {
  final String id;
  final String title;
  final DateTime date;
  final String? venueName;
  final double? lat;
  final double? lng;
  final String? flyerFront;
  final int popularity; // For now random or attendee count
  final List<User> friendsAttending; // For social layer
  
  Event({
    required this.id,
    required this.title,
    required this.date,
    this.venueName,
    this.lat,
    this.lng,
    this.flyerFront,
    this.popularity = 0,
    this.friendsAttending = const [],
    this.publishStatus = 'published',
    this.myRsvpStatus,
  });
  
  final String publishStatus;
  final String? myRsvpStatus;
  
  factory Event.fromJson(Map<String, dynamic> json) {
    return Event(
      id: json['id'],
      title: json['title'],
      date: DateTime.parse(json['date']),
      venueName: json['venue_name'],
      lat: json['latitude'] != null ? double.tryParse(json['latitude'].toString()) : null,
      lng: json['longitude'] != null ? double.tryParse(json['longitude'].toString()) : null,
      flyerFront: json['flyer_front'],
      friendsAttending: (json['friends_attending'] as List?)
          ?.map((e) => User.fromJson(e))
          .toList() ?? [],
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
  
  City({required this.id, required this.name, required this.lat, required this.lng});
  
  factory City.fromJson(Map<String, dynamic> json) {
    return City(
      id: json['id'].toString(),
      name: json['name'],
      lat: double.parse(json['latitude'].toString()),
      lng: double.parse(json['longitude'].toString()),
    );
  }
}
