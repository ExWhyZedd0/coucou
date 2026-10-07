// Notification Service reproducing Dynamic Island experience in Android notification drawer.

import 'package:flutter_local_notifications/flutter_local_notifications.dart';

class NotificationService {
  static final FlutterLocalNotificationsPlugin _notifications =
      FlutterLocalNotificationsPlugin();
  static bool _initialized = false;

  static const int islandNotificationId = 1001;
  static const int approvalNotificationId = 1002;

  static const String islandChannelId = 'coucou_dynamic_island';
  static const String approvalChannelId = 'coucou_approvals';

  static Future<void> initialize() async {
    if (_initialized) return;

    const androidSettings = AndroidInitializationSettings('@mipmap/ic_launcher');
    const initSettings = InitializationSettings(android: androidSettings);

    await _notifications.initialize(
      settings: initSettings,
      onDidReceiveNotificationResponse: (response) {
        // Handle notification click if needed
      },
    );

    // Request notification permission on Android 13+ (API 33+)
    final androidImpl = _notifications
        .resolvePlatformSpecificImplementation<AndroidFlutterLocalNotificationsPlugin>();
    await androidImpl?.requestNotificationsPermission();

    _initialized = true;
  }

  /// Updates the ongoing persistent notification that mirrors the Dynamic Island.
  static Future<void> updateDynamicIsland({
    required String agentName,
    required String status,
    required String? step,
    String? colorHex,
  }) async {
    if (!_initialized) await initialize();

    final title = '$agentName · $status';
    final body = step?.isNotEmpty == true ? step! : 'Active and monitoring';

    final androidDetails = AndroidNotificationDetails(
      islandChannelId,
      'Coucou Island Activity',
      channelDescription: 'Ongoing persistent Dynamic Island status drawer',
      importance: Importance.low,
      priority: Priority.low,
      ongoing: true,
      autoCancel: false,
      onlyAlertOnce: true,
      showWhen: false,
      styleInformation: BigTextStyleInformation(
        body,
        contentTitle: title,
        summaryText: 'Coucou Island',
      ),
    );

    final notificationDetails = NotificationDetails(android: androidDetails);

    await _notifications.show(
      id: islandNotificationId,
      title: title,
      body: body,
      notificationDetails: notificationDetails,
    );
  }

  /// Clears the ongoing Dynamic Island notification when all agents are idle.
  static Future<void> clearDynamicIsland() async {
    if (!_initialized) return;
    await _notifications.cancel(id: islandNotificationId);
  }

  /// Shows high-priority alert when an agent is waiting for command approval.
  static Future<void> showApprovalAlert({
    required String tool,
    required String command,
    required String requestId,
  }) async {
    if (!_initialized) await initialize();

    final title = 'Waiting for your OK: $tool';
    final body = command.isNotEmpty ? command : 'An agent requires your authorization.';

    final androidDetails = AndroidNotificationDetails(
      approvalChannelId,
      'Approval Requests',
      channelDescription: 'Alerts when agents request tool execution approval',
      importance: Importance.max,
      priority: Priority.high,
      ticker: 'Coucou Approval Request',
      styleInformation: BigTextStyleInformation(
        body,
        contentTitle: title,
        summaryText: 'Permission Request',
      ),
    );

    final notificationDetails = NotificationDetails(android: androidDetails);

    await _notifications.show(
      id: approvalNotificationId,
      title: title,
      body: body,
      notificationDetails: notificationDetails,
      payload: requestId,
    );
  }

  static Future<void> clearApprovalAlert() async {
    if (!_initialized) return;
    await _notifications.cancel(id: approvalNotificationId);
  }
}
