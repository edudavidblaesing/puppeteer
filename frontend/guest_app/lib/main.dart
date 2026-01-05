import 'package:flutter/material.dart';
import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'core/app_router.dart';
import 'core/theme.dart';
import 'features/auth/session_provider.dart';

import 'package:mapbox_maps_flutter/mapbox_maps_flutter.dart';
import 'core/constants.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  if (!kIsWeb) {
    MapboxOptions.setAccessToken(AppConstants.mapboxAccessToken);
  }
  runApp(const ProviderScope(child: SocialEventApp()));
}

class SocialEventApp extends ConsumerStatefulWidget {
  const SocialEventApp({super.key});

  @override
  ConsumerState<SocialEventApp> createState() => _SocialEventAppState();
}

class _SocialEventAppState extends ConsumerState<SocialEventApp> {
  @override
  void initState() {
    super.initState();
    // Initialize session check immediately on app start
    // Use addPostFrameCallback to ensure provider is ready if needed, 
    // though initState is usually fine for reading providers via ref.read
    WidgetsBinding.instance.addPostFrameCallback((_) {
       ref.read(sessionProvider.notifier).restoreSession();
    });
  }

  @override
  Widget build(BuildContext context) {
    final router = ref.watch(appRouterProvider);

    return MaterialApp.router(
      title: 'The Social Event',
      theme: AppTheme.darkTheme, // High-end dark mode
      routerConfig: router,
      debugShowCheckedModeBanner: false,
    );
  }
}
