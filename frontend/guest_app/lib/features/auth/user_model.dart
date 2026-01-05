class User {
  final String id;
  final String username;
  final String fullName;
  final String? avatarUrl;
  final String? email;
  final String? bio;

  User({
    required this.id,
    required this.username,
    required this.fullName,
    this.avatarUrl,
    this.email,
    this.bio,
  });

  factory User.fromJson(Map<String, dynamic> json) {
    return User(
      id: json['id'].toString(),
      username: json['username'] ?? '',
      fullName: json['full_name'] ?? '',
      avatarUrl: json['avatar_url'],
      email: json['email'],
      bio: json['bio'],
    );
  }
}
