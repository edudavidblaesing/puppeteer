import 'package:go_router/go_router.dart';
import '../features/auth/splash_screen.dart';
import '../features/auth/login_screen.dart';
import '../features/auth/register_screen.dart';
import '../features/auth/verification_screen.dart';
import '../features/map/moments_map_screen.dart';
import '../features/event/event_detail_screen.dart';
import '../features/profile/profile_screen.dart';
import '../features/event/my_events_screen.dart';
import '../features/profile/settings_screen.dart';
import '../features/friends/friend_screen.dart';
import '../features/chat/chat_screen.dart';
import '../features/profile/edit_profile_screen.dart';
import '../features/friends/find_friends_screen.dart';
import '../features/onboarding/onboarding_screen.dart';

// Simple Riverpod provider for router (placeholder for now)
import 'package:flutter_riverpod/flutter_riverpod.dart';

final appRouterProvider = Provider<GoRouter>((ref) {
  return GoRouter(
    initialLocation: '/', // Start at Splash
    routes: [
      GoRoute(
        path: '/',
        builder: (context, state) => const SplashScreen(),
      ),
      GoRoute(
        path: '/login',
        builder: (context, state) => const LoginScreen(),
      ),
      GoRoute(
        path: '/register',
        builder: (context, state) => const RegisterScreen(),
      ),
      GoRoute(
        path: '/verify',
        builder: (context, state) {
          final email = state.extra as String;
          return VerificationScreen(email: email);
        },
      ),
      GoRoute(
        path: '/find-friends',
        builder: (context, state) => const FindFriendsScreen(),
      ),
      GoRoute(
        path: '/onboarding',
        builder: (context, state) => const OnboardingScreen(),
      ),
      // Main Application Routes (No Shell/Tabs)
      GoRoute(
        path: '/map',
        builder: (context, state) => const MomentsMapScreen(),
      ),
      GoRoute(
        path: '/friends',
        builder: (context, state) => const FriendScreen(),
      ),
      GoRoute(
          path: '/profile',
          builder: (context, state) => const ProfileScreen(),
          routes: [
            GoRoute(
              path: 'my-events',
              builder: (context, state) => const MyEventsScreen(),
            ),
            GoRoute(
              path: 'settings',
              builder: (context, state) => const SettingsScreen(),
              routes: [
                GoRoute(
                  path: 'edit-profile',
                  builder: (context, state) => const EditProfileScreen(),
                ),
              ],
            ),
          ]),
      // Event Details (Full Screen, outside shell or inside? Usually pushed on top)
      GoRoute(
        path: '/event/:id',
        builder: (context, state) {
          final event = state.extra as dynamic; // Cast to Event
          return EventDetailScreen(
              eventId: state.pathParameters['id']!, eventExtra: event);
        },
      ),
      GoRoute(
        path: '/chat/:roomId',
        builder: (context, state) {
          final roomId = state.pathParameters['roomId']!;
          final title = state.extra as String? ?? 'Chat';
          return ChatScreen(roomId: roomId, title: title);
        },
      ),
    ],
  );
});
