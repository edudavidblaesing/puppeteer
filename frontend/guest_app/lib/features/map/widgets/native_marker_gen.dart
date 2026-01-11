import 'dart:ui' as ui;
import 'dart:async';
import 'dart:typed_data';
import 'dart:math';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:dio/dio.dart';
import '../models.dart';

class NativeMarkerGenerator {
  final Dio _dio = Dio();

  // Cache for downloaded images to avoid re-fetching
  final Map<String, ui.Image> _imageCache = {};

  Future<Uint8List> generateMarker(Event event) async {
    final ui.PictureRecorder pictureRecorder = ui.PictureRecorder();
    final Canvas canvas = Canvas(pictureRecorder);

    // Config matches MomentMapMarker
    const double size = 120.0; // 120 logical pixels
    // We scale everything by 2.0 or 3.0 for Retina displays, but Mapbox native scaling
    // handles 1.0 = 1 point roughly if we set scale correctly.
    // Let's generate at 2x for crispness.
    const double scale = 2.0;
    const double width = size * scale;
    const double height = size * scale;

    canvas.scale(scale);

    // Dynamic Tilt (simulated)
    final random = Random(event.id.hashCode);
    final double tilt = (random.nextDouble() - 0.5) * 0.15; // +/- 0.075 rad

    // Draw Center Point debugging? No.

    // Translate to center to rotate
    canvas.save();
    canvas.translate(size / 2, size / 2);
    canvas.rotate(tilt);
    canvas.translate(-size / 2, -size / 2);

    // --- Main Polaroid rect ---
    // Width 70, Height 85 centered in 120x120
    const double cardW = 70.0;
    const double cardH = 85.0;
    final double cardX = (size - cardW) / 2;
    final double cardY = (size - cardH) / 2;

    final RRect cardRRect = RRect.fromRectAndRadius(
      Rect.fromLTWH(cardX, cardY, cardW, cardH),
      const Radius.circular(8),
    );

    // Shadow
    final Path shadowPath = Path()
      ..addRRect(cardRRect.shift(const Offset(0, 3)));
    canvas.drawShadow(shadowPath, Colors.black45, 6.0, true);

    // White Background
    final Paint whitePaint = Paint()..color = Colors.white;
    canvas.drawRRect(cardRRect, whitePaint);

    // Image Area
    // Padding 3
    final double imgX = cardX + 3;
    final double imgY = cardY + 3;
    final double imgW = cardW - 6;
    final double imgH = cardH - 6 - 6; // -6 for padding, -6 for bottom space

    final RRect imgRRect = RRect.fromRectAndRadius(
      Rect.fromLTWH(imgX, imgY, imgW, imgH),
      const Radius.circular(6),
    );

    canvas.save();
    canvas.clipRRect(imgRRect);

    // Draw Image
    if (event.flyerFront != null) {
      try {
        ui.Image? image = _imageCache[event.flyerFront!];
        if (image == null) {
          image = await _downloadImage(event.flyerFront!);
          if (image != null) _imageCache[event.flyerFront!] = image;
        }

        if (image != null) {
          _paintImage(canvas, Rect.fromLTWH(imgX, imgY, imgW, imgH), image);
        } else {
          // Fallback Gray
          canvas.drawColor(Colors.grey[900]!, BlendMode.src);
        }
      } catch (e) {
        canvas.drawColor(Colors.grey[900]!, BlendMode.src);
      }
    } else {
      canvas.drawColor(Colors.grey[900]!, BlendMode.src);
    }

    canvas.restore(); // Undo clip
    canvas.restore(); // Undo rotation

    // --- Date Badge ---
    // Positioned(top: 10, left: 5) relative to bounding box?
    // In widget it is relative to Stack.
    // Stack is 120x120. Badge is at top-left-ish.
    // Let's put it at (30, 20) approx

    canvas.save();
    canvas.translate(30, 25);
    canvas.rotate(-0.1); // Slight counter tilt

    _drawBadge(canvas, event.date);

    canvas.restore();

    // --- End ---
    final ui.Image renderedImage = await pictureRecorder
        .endRecording()
        .toImage(width.toInt(), height.toInt());
    final ByteData? byteData =
        await renderedImage.toByteData(format: ui.ImageByteFormat.png);
    return byteData!.buffer.asUint8List();
  }

  // Helper to generate Stack Marker
  Future<Uint8List> generateStackMarker(List<Event> events) async {
    // Similar to above but draws multiple cards rotated
    // For simplicity, just draw the top card with a "+N" red badge
    if (events.isEmpty) return Uint8List(0);

    final topEvent = events.first;
    final Uint8List baseMarker = await generateMarker(topEvent);

    // Now decode it back to modify? No, just draw fresh.
    // Reuse generateMarker logic but add the red badge at end.

    final ui.PictureRecorder pictureRecorder = ui.PictureRecorder();
    final Canvas canvas = Canvas(pictureRecorder);
    const double size = 140.0; // Larger for stack
    const double scale = 2.0;
    const double width = size * scale;
    const double height = size * scale;
    canvas.scale(scale);

    // Draw fake "under" cards
    // Simplified: Just draw top card centered in larger canvas
    // Or actually implement the rotation stack.
    // Let's just draw the standard marker for the top event, centered.

    // Shift logic to reuse drawing?
    // Let's just instantiate a standard generation but with extra draws

    // ... (Complex logic omitted for speed, standard marker + badge is enough for MVP fix)

    // Draw '+' Badge
    // Load standard marker image
    // Note: Calling generateMarker recursively is inefficient if we can't compose easily.
    // But we can.

    final ui.Codec codec = await ui.instantiateImageCodec(baseMarker);
    final ui.FrameInfo frame = await codec.getNextFrame();
    final ui.Image baseImg = frame.image;

    // Draw base marker centered
    const double offset = (size - 120) / 2;
    canvas.drawImage(baseImg, Offset(offset, offset), Paint());

    // Draw Red Badge at top right
    final int count = events.length;
    if (count > 1) {
      _drawCountBadge(canvas, count, size);
    }

    final ui.Image finalImage = await pictureRecorder
        .endRecording()
        .toImage(width.toInt(), height.toInt());
    final ByteData? byteData =
        await finalImage.toByteData(format: ui.ImageByteFormat.png);
    return byteData!.buffer.asUint8List();
  }

  void _drawBadge(Canvas canvas, DateTime? date) {
    // White Box
    final Paint bgPaint = Paint()..color = Colors.white;
    final RRect bg = RRect.fromRectAndRadius(
        const Rect.fromLTWH(-15, -15, 30, 34), const Radius.circular(8));
    canvas.drawShadow(Path()..addRRect(bg), Colors.black26, 2.0, true);
    canvas.drawRRect(bg, bgPaint);

    // Text: MONTH (Red)
    final TextSpan monthSpan = TextSpan(
      text: _getMonth(date).toUpperCase(),
      style: const TextStyle(
          color: Colors.red, fontSize: 10, fontWeight: FontWeight.bold),
    );
    final TextPainter monthTp =
        TextPainter(text: monthSpan, textDirection: TextDirection.ltr);
    monthTp.layout();
    monthTp.paint(canvas, Offset(-monthTp.width / 2, -12));

    // Text: DAY (Black)
    final TextSpan daySpan = TextSpan(
      text: _getDay(date),
      style: const TextStyle(
          color: Colors.black, fontSize: 16, fontWeight: FontWeight.w900),
    );
    final TextPainter dayTp =
        TextPainter(text: daySpan, textDirection: TextDirection.ltr);
    dayTp.layout();
    dayTp.paint(canvas, Offset(-dayTp.width / 2, 0));
  }

  void _drawCountBadge(Canvas canvas, int count, double containerSize) {
    // Red circle at top right
    final double cx = containerSize - 30;
    const double cy = 30;

    final Paint redPaint = Paint()..color = Colors.red;
    canvas.drawCircle(Offset(cx, cy), 14, redPaint);

    final TextSpan span = TextSpan(
      text: "+${count - 1}",
      style: const TextStyle(
          color: Colors.white, fontSize: 14, fontWeight: FontWeight.bold),
    );
    final TextPainter tp =
        TextPainter(text: span, textDirection: TextDirection.ltr);
    tp.layout();
    tp.paint(canvas, Offset(cx - tp.width / 2, cy - tp.height / 2));
  }

  Future<ui.Image?> _downloadImage(String url) async {
    try {
      final response = await _dio.get(
        url,
        options: Options(responseType: ResponseType.bytes),
      );
      if (response.statusCode == 200) {
        final Uint8List bytes = Uint8List.fromList(response.data);
        final ui.Codec codec = await ui.instantiateImageCodec(bytes);
        final ui.FrameInfo frame = await codec.getNextFrame();
        return frame.image;
      }
    } catch (e) {
      print("Error downloading image marker: $e");
    }
    return null;
  }

  void _paintImage(Canvas canvas, Rect rect, ui.Image image) {
    // Fit Logic: Cover
    final Size imageSize =
        Size(image.width.toDouble(), image.height.toDouble());
    final FittedSizes sizes = applyBoxFit(BoxFit.cover, imageSize, rect.size);
    final Rect inputSubrect =
        Alignment.center.inscribe(sizes.source, Offset.zero & imageSize);
    final Rect outputSubrect =
        Alignment.center.inscribe(sizes.destination, rect);
    canvas.drawImageRect(image, inputSubrect, outputSubrect, Paint());
  }

  String _getMonth(DateTime? date) {
    if (date == null) return "DEC";
    const months = [
      "JAN",
      "FEB",
      "MAR",
      "APR",
      "MAY",
      "JUN",
      "JUL",
      "AUG",
      "SEP",
      "OCT",
      "NOV",
      "DEC"
    ];
    return months[date.month - 1];
  }

  String _getDay(DateTime? date) => date?.day.toString() ?? "31";
}
