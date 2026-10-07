// Coucou Android Companion App.
// Mirroring NotchBuddy iPhone companion with full Windows-to-Mobile sync parity.

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'screens/home_screen.dart';
import 'services/notification_service.dart';
import 'services/sync_client.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // Dark navigation bar and status bar to match Coucou theme
  SystemChrome.setSystemUIOverlayStyle(
    const SystemUiOverlayStyle(
      statusBarColor: Colors.transparent,
      statusBarIconBrightness: Brightness.light,
      systemNavigationBarColor: Color(0xFF0B0C0E),
      systemNavigationBarIconBrightness: Brightness.light,
    ),
  );

  // Initialize notifications
  await NotificationService.initialize();

  // Initialize sync client and load paired config
  await SyncClient.instance.initialize();

  runApp(const CoucouApp());
}

class CoucouApp extends StatelessWidget {
  const CoucouApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Coucou',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        brightness: Brightness.dark,
        scaffoldBackgroundColor: const Color(0xFF0B0C0E),
        primaryColor: const Color(0xFF22C55E),
        colorScheme: const ColorScheme.dark(
          primary: Color(0xFF22C55E),
          secondary: Color(0xFF3B82F6),
          surface: Color(0xFF14161B),
          error: Color(0xFFEF4444),
        ),
        appBarTheme: const AppBarTheme(
          backgroundColor: Color(0xFF0B0C0E),
          elevation: 0,
          scrolledUnderElevation: 0,
        ),
        useMaterial3: true,
      ),
      home: const HomeScreen(),
    );
  }
}
