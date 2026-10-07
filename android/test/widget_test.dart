import 'package:flutter_test/flutter_test.dart';
import 'package:coucou/main.dart';
import 'package:coucou/screens/home_screen.dart';

void main() {
  testWidgets('CoucouApp smoke test', (WidgetTester tester) async {
    await tester.pumpWidget(const CoucouApp());
    await tester.pump();

    expect(find.byType(HomeScreen), findsOneWidget);
    expect(find.text('Coucou Companion'), findsOneWidget);
  });
}
