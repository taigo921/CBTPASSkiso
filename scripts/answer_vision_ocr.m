#import <Foundation/Foundation.h>
#import <Vision/Vision.h>

static int recognize(NSString *path) {
  VNRecognizeTextRequest *request = [VNRecognizeTextRequest new];
  request.revision = VNRecognizeTextRequestRevision3;
  request.recognitionLevel = VNRequestTextRecognitionLevelAccurate;
  request.recognitionLanguages = @[ @"ja-JP", @"en-US" ];
  request.usesLanguageCorrection = YES;
  request.minimumTextHeight = 0.004;

  NSURL *url = [NSURL fileURLWithPath:path];
  VNImageRequestHandler *handler =
      [[VNImageRequestHandler alloc] initWithURL:url options:@{}];
  NSError *error = nil;
  if (![handler performRequests:@[ request ] error:&error]) {
    fprintf(stderr, "Vision OCR failed for %s: %s\n", path.UTF8String,
            error.localizedDescription.UTF8String);
    return 1;
  }

  for (VNRecognizedTextObservation *observation in request.results) {
    VNRecognizedText *candidate = [observation topCandidates:1].firstObject;
    if (candidate != nil) {
      printf("%s\n", candidate.string.UTF8String);
    }
  }
  return 0;
}

int main(int argc, const char *argv[]) {
  @autoreleasepool {
    if (argc < 2) {
      fprintf(stderr, "Usage: %s IMAGE [IMAGE ...]\n", argv[0]);
      return 2;
    }
    for (int i = 1; i < argc; i++) {
      if (recognize([NSString stringWithUTF8String:argv[i]]) != 0) {
        return 1;
      }
    }
  }
  return 0;
}
