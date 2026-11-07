import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';

abstract class DocumentPickGateway {
  Future<String?> pickFromGallery();

  Future<String?> pickFromCamera();
}

class ImagePickerDocumentPickGateway implements DocumentPickGateway {
  ImagePickerDocumentPickGateway({ImagePicker? picker})
      : _picker = picker ?? ImagePicker();

  final ImagePicker _picker;

  @override
  Future<String?> pickFromGallery() async {
    final file = await _picker.pickImage(
      source: ImageSource.gallery,
      imageQuality: 85,
    );
    return file?.path;
  }

  @override
  Future<String?> pickFromCamera() async {
    final file = await _picker.pickImage(
      source: ImageSource.camera,
      imageQuality: 85,
    );
    return file?.path;
  }
}

/// Deterministic stand-in for widget tests.
class FakeDocumentPickGateway implements DocumentPickGateway {
  FakeDocumentPickGateway({
    this.galleryPath = 'demo/id-front.jpg',
    this.cameraPath = 'demo/selfie.jpg',
  });

  String? galleryPath;
  String? cameraPath;

  @override
  Future<String?> pickFromGallery() async => galleryPath;

  @override
  Future<String?> pickFromCamera() async => cameraPath;
}

final documentPickGatewayProvider = Provider<DocumentPickGateway>((ref) {
  return ImagePickerDocumentPickGateway();
});
