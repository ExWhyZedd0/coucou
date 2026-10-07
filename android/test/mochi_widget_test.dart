import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:coucou/models/session.dart';
import 'package:coucou/mochi/mochi_outfits.dart';
import 'package:coucou/mochi/mochi_widget.dart';

void main() {
  group('Mochi Widget and Character Engine Tests', () {
    testWidgets('Renders MochiWidget in idle state', (WidgetTester tester) async {
      await tester.pumpWidget(
        const MaterialApp(
          home: Scaffold(
            body: Center(
              child: MochiWidget(
                size: 140,
                state: BotState.idle,
              ),
            ),
          ),
        ),
      );

      expect(find.byType(MochiWidget), findsOneWidget);
    });

    testWidgets('Renders MochiWidget in working, approval, and error states', (WidgetTester tester) async {
      for (final state in [BotState.working, BotState.approval, BotState.error, BotState.finished]) {
        await tester.pumpWidget(
          MaterialApp(
            home: Scaffold(
              body: Center(
                child: MochiWidget(
                  size: 120,
                  state: state,
                ),
              ),
            ),
          ),
        );

        expect(find.byType(MochiWidget), findsOneWidget);
        await tester.pump(const Duration(milliseconds: 100));
      }
    });

    testWidgets('Renders MochiWidget with outfits', (WidgetTester tester) async {
      for (final outfit in [
        MochiOutfit.partyHat,
        MochiOutfit.crown,
        MochiOutfit.sunglasses,
        MochiOutfit.beanie,
        MochiOutfit.santaHat,
      ]) {
        await tester.pumpWidget(
          MaterialApp(
            home: Scaffold(
              body: Center(
                child: MochiWidget(
                  size: 140,
                  outfit: outfit,
                ),
              ),
            ),
          ),
        );

        expect(find.byType(MochiWidget), findsOneWidget);
      }
    });

    testWidgets('Tapping MochiWidget triggers onTap callback', (WidgetTester tester) async {
      var tapped = false;

      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: Center(
              child: MochiWidget(
                size: 140,
                onTap: () => tapped = true,
              ),
            ),
          ),
        ),
      );

      await tester.tap(find.byType(MochiWidget));
      await tester.pump();
      expect(tapped, isTrue);
    });

    testWidgets('Renders MochiWidget via widgets/mochi_widget forwarder', (WidgetTester tester) async {
      await tester.pumpWidget(
        const MaterialApp(
          home: Scaffold(
            body: Center(
              child: MochiWidget(
                size: 100,
                outfit: MochiOutfit.roundGlasses,
              ),
            ),
          ),
        ),
      );

      expect(find.byType(MochiWidget), findsOneWidget);
    });
  });
}
