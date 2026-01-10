class AppConstants {
  static const String appName = 'The Social Event';

  // API Config
  // Use 10.0.2.2 for Android Emulator, localhost for iOS Simulator
  // In production, this would be the deployed URL
  static const String baseUrl = String.fromEnvironment('API_URL',
      defaultValue: 'https://pptr.davidblaesing.com');
  static const String apiUrl = '$baseUrl/api/guest';

  // Mapbox
  static const String mapboxAccessToken =
      'pk.eyJ1IjoiZGF2aWRibGFlc2luZyIsImEiOiJjamlnMjI3cm0wYmdwM3FvNTR4a3FkcG1sIn0.gW8LfIz1p1igVBasYC8CpQ';
  static const String mapStyle =
      'mapbox://styles/mapbox/dark-v11'; // Dark minimal style
}
