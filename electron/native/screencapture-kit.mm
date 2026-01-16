#import <Foundation/Foundation.h>
#import <ScreenCaptureKit/ScreenCaptureKit.h>
#import <AVFoundation/AVFoundation.h>
#import <VideoToolbox/VideoToolbox.h>
#import <napi.h>
#import <CoreGraphics/CoreGraphics.h>

// This actually WORKS to hide the cursor using native macOS APIs
// Available on macOS 12.3+ with ScreenCaptureKit

@interface ScreenRecorder : NSObject <SCStreamOutput, SCStreamDelegate>
@property (nonatomic, strong) SCStream *stream;
@property (nonatomic, strong) AVAssetWriter *assetWriter;
@property (nonatomic, strong) AVAssetWriterInput *videoInput;
@property (nonatomic, strong) AVAssetWriterInput *audioInput;
@property (nonatomic, strong) NSString *outputPath;
@property (nonatomic, assign) BOOL isRecording;
@property (nonatomic, assign) CMTime startTime;
@property (nonatomic, assign) BOOL hasStartedSession;
@property (nonatomic, assign) BOOL hasAudio;
@property (nonatomic, assign) BOOL receivedFirstAudio;
@property (nonatomic, assign) CGRect sourceRect;  // Region capture support
@property (nonatomic, assign) BOOL isPaused;  // Pause state
@property (nonatomic, assign) CMTime pauseStartTime;  // When pause began
@property (nonatomic, assign) CMTime totalPausedDuration;  // Accumulated pause time

- (void)startRecordingDisplay:(CGDirectDisplayID)displayID outputPath:(NSString *)path onlySelf:(BOOL)onlySelf lowMemory:(BOOL)lowMemory useMacOSDefaults:(BOOL)useMacOSDefaults framerate:(int)framerate completion:(void (^)(NSError *))completion;
- (void)startRecordingDisplay:(CGDirectDisplayID)displayID outputPath:(NSString *)path sourceRect:(CGRect)rect onlySelf:(BOOL)onlySelf lowMemory:(BOOL)lowMemory useMacOSDefaults:(BOOL)useMacOSDefaults framerate:(int)framerate completion:(void (^)(NSError *))completion;
- (void)startRecordingWindow:(CGWindowID)windowID outputPath:(NSString *)path lowMemory:(BOOL)lowMemory useMacOSDefaults:(BOOL)useMacOSDefaults framerate:(int)framerate completion:(void (^)(NSError *))completion;
- (void)stopRecording:(void (^)(NSString *, NSError *))completion;
- (void)pauseRecording;
- (void)resumeRecording;
@end

@implementation ScreenRecorder

- (void)startRecordingDisplay:(CGDirectDisplayID)displayID outputPath:(NSString *)path onlySelf:(BOOL)onlySelf lowMemory:(BOOL)lowMemory useMacOSDefaults:(BOOL)useMacOSDefaults framerate:(int)framerate completion:(void (^)(NSError *))completion {
    // Default to excluding app windows (includeAppWindows = NO)
    [self startRecordingDisplay:displayID outputPath:path sourceRect:CGRectNull onlySelf:onlySelf includeAppWindows:NO lowMemory:lowMemory useMacOSDefaults:useMacOSDefaults framerate:framerate completion:completion];
}

- (void)startRecordingDisplay:(CGDirectDisplayID)displayID outputPath:(NSString *)path sourceRect:(CGRect)rect onlySelf:(BOOL)onlySelf lowMemory:(BOOL)lowMemory useMacOSDefaults:(BOOL)useMacOSDefaults framerate:(int)framerate completion:(void (^)(NSError *))completion {
    // Default to excluding app windows (includeAppWindows = NO)
    [self startRecordingDisplay:displayID outputPath:path sourceRect:rect onlySelf:onlySelf includeAppWindows:NO lowMemory:lowMemory useMacOSDefaults:useMacOSDefaults framerate:framerate completion:completion];
}

- (void)startRecordingDisplay:(CGDirectDisplayID)displayID outputPath:(NSString *)path sourceRect:(CGRect)rect onlySelf:(BOOL)onlySelf includeAppWindows:(BOOL)includeAppWindows lowMemory:(BOOL)lowMemory useMacOSDefaults:(BOOL)useMacOSDefaults framerate:(int)framerate completion:(void (^)(NSError *))completion {
    if (@available(macOS 12.3, *)) {
        self.outputPath = path;
        self.hasStartedSession = NO;
        self.receivedFirstAudio = NO;
        self.sourceRect = rect;
        self.isPaused = NO;
        self.pauseStartTime = kCMTimeInvalid;
        self.totalPausedDuration = kCMTimeZero;

        const int targetFps = framerate > 0 ? framerate : 60;
        const BOOL encoderDefaults = useMacOSDefaults ? YES : NO;
        
        // Get shareable content
        [SCShareableContent getShareableContentWithCompletionHandler:^(SCShareableContent *content, NSError *error) {
            if (error) {
                completion(error);
                return;
            }
            
            // Find the display
            SCDisplay *targetDisplay = nil;
            for (SCDisplay *display in content.displays) {
                if (display.displayID == displayID) {
                    targetDisplay = display;
                    break;
                }
            }
            
            if (!targetDisplay) {
                // Use primary display as fallback
                targetDisplay = content.displays.firstObject;
            }
            
            if (!targetDisplay) {
                completion([NSError errorWithDomain:@"ScreenRecorder" code:1 userInfo:@{NSLocalizedDescriptionKey: @"No display found"}]);
                return;
            }
            
            SCContentFilter *filter = nil;
            
            if (onlySelf) {
                // Find our own application
                SCRunningApplication *myApp = nil;
                NSString *myBundleId = [[NSBundle mainBundle] bundleIdentifier];
                
                for (SCRunningApplication *app in content.applications) {
                    if ([app.bundleIdentifier isEqualToString:myBundleId]) {
                        myApp = app;
                        break;
                    }
                }
                
                if (myApp) {
                    // Include ONLY our application's windows
                    filter = [[SCContentFilter alloc] initWithDisplay:targetDisplay includingApplications:@[myApp] exceptingWindows:@[]];
                    NSLog(@"Configured to record ONLY self (Bundle ID: %@)", myBundleId);
                } else {
                    NSLog(@"Warning: Could not find own application in SCShareableContent. Falling back to default behavior.");
                }
            } else if (includeAppWindows) {
                // Include app windows in the recording - don't exclude anything
                // Record everything on the display without any exclusions
                filter = [[SCContentFilter alloc] initWithDisplay:targetDisplay excludingWindows:@[]];
                NSLog(@"Configured to INCLUDE app windows in recording");
            }
            
            // If filter wasn't created, use default exclusion logic (exclude our app windows)
            if (!filter) {
                // Exclude all windows from our own app to prevent overlays/UI from appearing in recordings.
                SCRunningApplication *myApp = nil;
                NSString *myBundleId = [[NSBundle mainBundle] bundleIdentifier];
                
                for (SCRunningApplication *app in content.applications) {
                    if ([app.bundleIdentifier isEqualToString:myBundleId]) {
                        myApp = app;
                        break;
                    }
                }
                
                if (myApp) {
                    filter = [[SCContentFilter alloc] initWithDisplay:targetDisplay excludingApplications:@[myApp] exceptingWindows:@[]];
                    NSLog(@"Configured to EXCLUDE app windows from recording");
                } else {
                    // Fallback: exclude windows from our own app.
                    NSMutableArray<SCWindow *> *windowsToExclude = [NSMutableArray array];
                    for (SCWindow *window in content.windows) {
                        if ([window.owningApplication.bundleIdentifier isEqualToString:myBundleId]) {
                            [windowsToExclude addObject:window];
                        }
                    }
                    filter = [[SCContentFilter alloc] initWithDisplay:targetDisplay excludingWindows:windowsToExclude];
                }
            }
            
            // Create stream configuration
            SCStreamConfiguration *config = [[SCStreamConfiguration alloc] init];
            
            // Set full pixel resolution for the target display
            size_t pixelWidth = 0;
            size_t pixelHeight = 0;
            size_t pointWidth = 0;
            size_t pointHeight = 0;
            CGDisplayModeRef mode = CGDisplayCopyDisplayMode(displayID);
            if (mode) {
                pointWidth = CGDisplayModeGetWidth(mode);
                pointHeight = CGDisplayModeGetHeight(mode);
                pixelWidth = CGDisplayModeGetPixelWidth(mode);
                pixelHeight = CGDisplayModeGetPixelHeight(mode);
                CFRelease(mode);
            }

            // Compute backing scale (pixel / point) for HiDPI displays.
            CGFloat backingScale = 1.0;
            if (pointWidth > 0 && pointHeight > 0 && pixelWidth > 0 && pixelHeight > 0) {
                const CGFloat sx = (CGFloat)pixelWidth / (CGFloat)pointWidth;
                const CGFloat sy = (CGFloat)pixelHeight / (CGFloat)pointHeight;
                // Prefer symmetric scaling; fall back to X if they differ.
                backingScale = (fabs(sx - sy) < 0.01) ? sx : sx;
            }
            
            const size_t basePointWidth = pointWidth > 0 ? pointWidth : (size_t)targetDisplay.width;
            const size_t basePointHeight = pointHeight > 0 ? pointHeight : (size_t)targetDisplay.height;

            if (pixelWidth == 0 || pixelHeight == 0) {
                // Fallback to derived width/height
                pixelWidth = (size_t)llround((CGFloat)basePointWidth * backingScale);
                pixelHeight = (size_t)llround((CGFloat)basePointHeight * backingScale);
            }

            // Reduce capture resolution on HiDPI displays when lowMemory is enabled.
            const CGFloat captureScale = (lowMemory && backingScale > 1.0) ? 1.0 : backingScale;
            const OSType pixelFormat = encoderDefaults
                ? kCVPixelFormatType_420YpCbCr8BiPlanarFullRange
                : (lowMemory ? kCVPixelFormatType_420YpCbCr8BiPlanarVideoRange : kCVPixelFormatType_32BGRA);
            size_t targetWidth = (size_t)llround((CGFloat)basePointWidth * captureScale);
            size_t targetHeight = (size_t)llround((CGFloat)basePointHeight * captureScale);
            
            // Apply source rect if specified (for region capture)
            if (!CGRectIsNull(self.sourceRect)) {
                CGRect sourceRectPx = CGRectMake(
                    self.sourceRect.origin.x * captureScale,
                    self.sourceRect.origin.y * captureScale,
                    self.sourceRect.size.width * captureScale,
                    self.sourceRect.size.height * captureScale
                );

                targetWidth = (size_t)llround((CGFloat)self.sourceRect.size.width * captureScale);
                targetHeight = (size_t)llround((CGFloat)self.sourceRect.size.height * captureScale);
                // ScreenCaptureKit expects sourceRect in points (display space).
                config.sourceRect = self.sourceRect;
                NSLog(@"Region capture (points): %@ -> (scaled pixels): %@", NSStringFromRect(NSRectFromCGRect(self.sourceRect)), NSStringFromRect(NSRectFromCGRect(sourceRectPx)));
            }

            config.width = targetWidth;
            config.height = targetHeight;
            config.minimumFrameInterval = CMTimeMake(1, targetFps);
            config.pixelFormat = pixelFormat;
            config.showsCursor = NO;  // THIS IS THE KEY - Hide cursor!
            config.backgroundColor = NSColor.clearColor.CGColor;
            config.scalesToFit = NO;
            // Keep the capture queue shallow to reduce memory pressure at high resolutions.
            config.queueDepth = lowMemory ? 2 : 5;
            
            // Configure audio capture
            // Note: On macOS, audio capture is subject to system permission and SDK behavior.
            // Audio capture APIs are only available on macOS 13.0+
            if (@available(macOS 13.0, *)) {
                config.capturesAudio = YES;
                config.sampleRate = 48000;
                config.channelCount = 2;
            }
            
            NSLog(@"Screen recording configured: %zux%zu (scale: %.2f, backing: %.2f) fps=%d, macosDefaults=%@, lowMemory=%@", targetWidth, targetHeight, captureScale, backingScale, targetFps, encoderDefaults ? @"YES" : @"NO", lowMemory ? @"YES" : @"NO");
            
            // Setup asset writer
            NSError *writerError = nil;
            self.assetWriter = [[AVAssetWriter alloc] initWithURL:[NSURL fileURLWithPath:path] fileType:AVFileTypeQuickTimeMovie error:&writerError];
            
            if (writerError) {
                completion(writerError);
                return;
            }
            
            NSMutableDictionary *videoCompressionProperties = [NSMutableDictionary dictionary];
            NSString *videoCodec = AVVideoCodecTypeH264;

            if (encoderDefaults) {
                if (@available(macOS 10.13, *)) {
                    videoCodec = AVVideoCodecTypeHEVC;
                }
                videoCompressionProperties[(NSString *)kVTCompressionPropertyKey_RealTime] = @YES;
                videoCompressionProperties[AVVideoExpectedSourceFrameRateKey] = @(targetFps);
                videoCompressionProperties[AVVideoMaxKeyFrameIntervalKey] = @(targetFps);
                if (lowMemory) {
                    videoCompressionProperties[AVVideoAllowFrameReorderingKey] = @NO;
                }
                if ([videoCodec isEqualToString:AVVideoCodecTypeHEVC]) {
                    videoCompressionProperties[AVVideoProfileLevelKey] = (__bridge NSString *)kVTProfileLevel_HEVC_Main_AutoLevel;
                } else {
                    videoCompressionProperties[AVVideoProfileLevelKey] = AVVideoProfileLevelH264HighAutoLevel;
                }
            } else {
                videoCompressionProperties[AVVideoAverageBitRateKey] = @(5000000);
                videoCompressionProperties[AVVideoProfileLevelKey] = AVVideoProfileLevelH264HighAutoLevel;
                if (lowMemory) {
                    // Reduce encoder buffering and latency (smaller VTEncoderService footprint).
                    videoCompressionProperties[AVVideoAllowFrameReorderingKey] = @NO;
                    videoCompressionProperties[AVVideoExpectedSourceFrameRateKey] = @(targetFps);
                    videoCompressionProperties[AVVideoMaxKeyFrameIntervalKey] = @(targetFps);
                }
            }

            NSDictionary *videoSettings = @{
                AVVideoCodecKey: videoCodec,
                AVVideoWidthKey: @(config.width),
                AVVideoHeightKey: @(config.height),
                AVVideoCompressionPropertiesKey: videoCompressionProperties
            };
            
            self.videoInput = [[AVAssetWriterInput alloc] initWithMediaType:AVMediaTypeVideo outputSettings:videoSettings];
            self.videoInput.expectsMediaDataInRealTime = YES;
            
            [self.assetWriter addInput:self.videoInput];
            
            // Setup audio input
            AudioChannelLayout stereoChannelLayout = {
                .mChannelLayoutTag = kAudioChannelLayoutTag_Stereo,
                .mChannelBitmap = kAudioChannelBit_Left | kAudioChannelBit_Right,
                .mNumberChannelDescriptions = 0
            };
            
            NSData *channelLayoutAsData = [NSData dataWithBytes:&stereoChannelLayout length:offsetof(AudioChannelLayout, mChannelDescriptions)];
            
            NSDictionary *audioSettings = @{
                AVFormatIDKey: @(kAudioFormatMPEG4AAC),
                AVNumberOfChannelsKey: @2,
                AVSampleRateKey: @48000,
                AVChannelLayoutKey: channelLayoutAsData,
                AVEncoderBitRateKey: @128000
            };
            
            self.audioInput = [[AVAssetWriterInput alloc] initWithMediaType:AVMediaTypeAudio outputSettings:audioSettings];
            self.audioInput.expectsMediaDataInRealTime = YES;
            
            if ([self.assetWriter canAddInput:self.audioInput]) {
                [self.assetWriter addInput:self.audioInput];
                self.hasAudio = YES;
                NSLog(@"Audio input added successfully to asset writer");
            } else {
                NSLog(@"Warning: Could not add audio input to asset writer");
                self.hasAudio = NO;
            }
            
            if (![self.assetWriter startWriting]) {
                completion([NSError errorWithDomain:@"ScreenRecorder" code:2 userInfo:@{NSLocalizedDescriptionKey: @"Failed to start writing"}]);
                return;
            }
            
            // Create and start stream
            self.stream = [[SCStream alloc] initWithFilter:filter configuration:config delegate:self];
            
            NSError *addOutputError = nil;
            [self.stream addStreamOutput:self type:SCStreamOutputTypeScreen sampleHandlerQueue:dispatch_get_global_queue(DISPATCH_QUEUE_PRIORITY_HIGH, 0) error:&addOutputError];
            
            if (!addOutputError && self.hasAudio) {
                // SCStreamOutputTypeAudio is only available on macOS 13.0+
                if (@available(macOS 13.0, *)) {
                    NSError *audioOutputError = nil;
                    [self.stream addStreamOutput:self type:SCStreamOutputTypeAudio sampleHandlerQueue:dispatch_get_global_queue(DISPATCH_QUEUE_PRIORITY_HIGH, 0) error:&audioOutputError];
                    
                    if (audioOutputError) {
                        NSLog(@"Warning: Failed to add audio output: %@", audioOutputError);
                        self.hasAudio = NO;
                    }
                } else {
                    NSLog(@"Warning: Audio capture requires macOS 13.0 or later");
                    self.hasAudio = NO;
                }
            }
            
            if (addOutputError) {
                completion(addOutputError);
                return;
            }
            
            // Start capture
            [self.stream startCaptureWithCompletionHandler:^(NSError *error) {
                if (error) {
                    completion(error);
                } else {
                    self.isRecording = YES;
                    completion(nil);
                }
            }];
        }];
    } else {
        completion([NSError errorWithDomain:@"ScreenRecorder" code:3 userInfo:@{NSLocalizedDescriptionKey: @"ScreenCaptureKit requires macOS 12.3 or later"}]);
    }
}

- (void)startRecordingWindow:(CGWindowID)windowID outputPath:(NSString *)path lowMemory:(BOOL)lowMemory useMacOSDefaults:(BOOL)useMacOSDefaults framerate:(int)framerate completion:(void (^)(NSError *))completion {
    if (@available(macOS 12.3, *)) {
        self.outputPath = path;
        self.hasStartedSession = NO;
        self.receivedFirstAudio = NO;
        self.sourceRect = CGRectNull;
        self.isPaused = NO;
        self.pauseStartTime = kCMTimeInvalid;
        self.totalPausedDuration = kCMTimeZero;

        const int targetFps = framerate > 0 ? framerate : 60;
        const BOOL encoderDefaults = useMacOSDefaults ? YES : NO;
        
        // Get shareable content to find the window
        [SCShareableContent getShareableContentWithCompletionHandler:^(SCShareableContent *content, NSError *error) {
            if (error) {
                completion(error);
                return;
            }
            
            // Find the target window by ID
            SCWindow *targetWindow = nil;
            for (SCWindow *window in content.windows) {
                if (window.windowID == windowID) {
                    targetWindow = window;
                    break;
                }
            }
            
            if (!targetWindow) {
                completion([NSError errorWithDomain:@"ScreenRecorder" code:1 userInfo:@{NSLocalizedDescriptionKey: @"Window not found"}]);
                return;
            }
            
            NSLog(@"Recording window: %@ (ID: %u, size: %.0fx%.0f)", targetWindow.title, windowID, targetWindow.frame.size.width, targetWindow.frame.size.height);
            
            // Create content filter for the specific window
            // This allows recording even when window moves or is partially covered
            SCContentFilter *filter = [[SCContentFilter alloc] initWithDesktopIndependentWindow:targetWindow];
            
            // Create stream configuration
            SCStreamConfiguration *config = [[SCStreamConfiguration alloc] init];
            
            // Use the window's frame size
            CGFloat windowWidth = targetWindow.frame.size.width;
            CGFloat windowHeight = targetWindow.frame.size.height;

            // Ensure minimum size
            if (windowWidth < 100) windowWidth = 100;
            if (windowHeight < 100) windowHeight = 100;

            // Derive backing scale for the window from the display it's on.
            // We use the display mode to get the physical/logical pixel ratio.
            // Note: The previous approach compared CGWindowListCopyWindowInfo bounds with
            // SCWindow.frame, but both are in points (DIP), so the ratio was always ~1.0.
            CGFloat backingScale = 1.0;
            CGPoint center = CGPointMake(CGRectGetMidX(targetWindow.frame), CGRectGetMidY(targetWindow.frame));
            CGDirectDisplayID displayID = CGMainDisplayID();
            uint32_t displayCount = 0;
            CGDirectDisplayID displays[8];
            if (CGGetDisplaysWithPoint(center, 8, displays, &displayCount) == kCGErrorSuccess && displayCount > 0) {
                displayID = displays[0];
            }

            CGDisplayModeRef mode = CGDisplayCopyDisplayMode(displayID);
            if (mode) {
                const size_t ptW = CGDisplayModeGetWidth(mode);
                const size_t pxW = CGDisplayModeGetPixelWidth(mode);
                if (ptW > 0 && pxW > 0) {
                    backingScale = (CGFloat)pxW / (CGFloat)ptW;
                }
                CFRelease(mode);
            }

            const CGFloat captureScale = (lowMemory && backingScale > 1.0) ? 1.0 : backingScale;
            const OSType pixelFormat = encoderDefaults
                ? kCVPixelFormatType_420YpCbCr8BiPlanarFullRange
                : (lowMemory ? kCVPixelFormatType_420YpCbCr8BiPlanarVideoRange : kCVPixelFormatType_32BGRA);
            const size_t windowTargetWidth = (size_t)llround(windowWidth * captureScale);
            const size_t windowTargetHeight = (size_t)llround(windowHeight * captureScale);
            
            config.width = windowTargetWidth;
            config.height = windowTargetHeight;
            config.minimumFrameInterval = CMTimeMake(1, targetFps);
            config.pixelFormat = pixelFormat;
            config.showsCursor = NO;  // Hide cursor
            config.backgroundColor = NSColor.clearColor.CGColor;
            config.scalesToFit = NO;
            // Keep the capture queue shallow to reduce memory pressure at high resolutions.
            config.queueDepth = lowMemory ? 2 : 5;
            
            // Configure audio capture (macOS 13.0+)
            if (@available(macOS 13.0, *)) {
                config.capturesAudio = YES;
                config.sampleRate = 48000;
                config.channelCount = 2;
            }
            
            NSLog(@"Window recording configured: %.0fx%.0f pts -> %zux%zu px (scale: %.2f, backing: %.2f) fps=%d, macosDefaults=%@, lowMemory=%@", windowWidth, windowHeight, windowTargetWidth, windowTargetHeight, captureScale, backingScale, targetFps, encoderDefaults ? @"YES" : @"NO", lowMemory ? @"YES" : @"NO");
            
            // Setup asset writer (reuse the same setup as display recording)
            NSError *writerError = nil;
            self.assetWriter = [[AVAssetWriter alloc] initWithURL:[NSURL fileURLWithPath:path] fileType:AVFileTypeQuickTimeMovie error:&writerError];
            
            if (writerError) {
                completion(writerError);
                return;
            }
            
            NSMutableDictionary *videoCompressionProperties = [NSMutableDictionary dictionary];
            NSString *videoCodec = AVVideoCodecTypeH264;

            if (encoderDefaults) {
                if (@available(macOS 10.13, *)) {
                    videoCodec = AVVideoCodecTypeHEVC;
                }
                videoCompressionProperties[(NSString *)kVTCompressionPropertyKey_RealTime] = @YES;
                videoCompressionProperties[AVVideoExpectedSourceFrameRateKey] = @(targetFps);
                videoCompressionProperties[AVVideoMaxKeyFrameIntervalKey] = @(targetFps);
                if (lowMemory) {
                    videoCompressionProperties[AVVideoAllowFrameReorderingKey] = @NO;
                }
                if ([videoCodec isEqualToString:AVVideoCodecTypeHEVC]) {
                    videoCompressionProperties[AVVideoProfileLevelKey] = (__bridge NSString *)kVTProfileLevel_HEVC_Main_AutoLevel;
                } else {
                    videoCompressionProperties[AVVideoProfileLevelKey] = AVVideoProfileLevelH264HighAutoLevel;
                }
            } else {
                videoCompressionProperties[AVVideoAverageBitRateKey] = @(5000000);
                videoCompressionProperties[AVVideoProfileLevelKey] = AVVideoProfileLevelH264HighAutoLevel;
                if (lowMemory) {
                    // Reduce encoder buffering and latency (smaller VTEncoderService footprint).
                    videoCompressionProperties[AVVideoAllowFrameReorderingKey] = @NO;
                    videoCompressionProperties[AVVideoExpectedSourceFrameRateKey] = @(targetFps);
                    videoCompressionProperties[AVVideoMaxKeyFrameIntervalKey] = @(targetFps);
                }
            }

            NSDictionary *videoSettings = @{
                AVVideoCodecKey: videoCodec,
                AVVideoWidthKey: @(config.width),
                AVVideoHeightKey: @(config.height),
                AVVideoCompressionPropertiesKey: videoCompressionProperties
            };
            
            self.videoInput = [[AVAssetWriterInput alloc] initWithMediaType:AVMediaTypeVideo outputSettings:videoSettings];
            self.videoInput.expectsMediaDataInRealTime = YES;
            
            [self.assetWriter addInput:self.videoInput];
            
            // Setup audio input
            AudioChannelLayout stereoChannelLayout = {
                .mChannelLayoutTag = kAudioChannelLayoutTag_Stereo,
                .mChannelBitmap = kAudioChannelBit_Left | kAudioChannelBit_Right,
                .mNumberChannelDescriptions = 0
            };
            
            NSData *channelLayoutAsData = [NSData dataWithBytes:&stereoChannelLayout length:offsetof(AudioChannelLayout, mChannelDescriptions)];
            
            NSDictionary *audioSettings = @{
                AVFormatIDKey: @(kAudioFormatMPEG4AAC),
                AVNumberOfChannelsKey: @2,
                AVSampleRateKey: @48000,
                AVChannelLayoutKey: channelLayoutAsData,
                AVEncoderBitRateKey: @128000
            };
            
            self.audioInput = [[AVAssetWriterInput alloc] initWithMediaType:AVMediaTypeAudio outputSettings:audioSettings];
            self.audioInput.expectsMediaDataInRealTime = YES;
            
            if ([self.assetWriter canAddInput:self.audioInput]) {
                [self.assetWriter addInput:self.audioInput];
                self.hasAudio = YES;
            } else {
                self.hasAudio = NO;
            }
            
            if (![self.assetWriter startWriting]) {
                completion([NSError errorWithDomain:@"ScreenRecorder" code:2 userInfo:@{NSLocalizedDescriptionKey: @"Failed to start writing"}]);
                return;
            }
            
            // Create and start stream
            self.stream = [[SCStream alloc] initWithFilter:filter configuration:config delegate:self];
            
            NSError *addOutputError = nil;
            [self.stream addStreamOutput:self type:SCStreamOutputTypeScreen sampleHandlerQueue:dispatch_get_global_queue(DISPATCH_QUEUE_PRIORITY_HIGH, 0) error:&addOutputError];
            
            if (!addOutputError && self.hasAudio) {
                if (@available(macOS 13.0, *)) {
                    NSError *audioOutputError = nil;
                    [self.stream addStreamOutput:self type:SCStreamOutputTypeAudio sampleHandlerQueue:dispatch_get_global_queue(DISPATCH_QUEUE_PRIORITY_HIGH, 0) error:&audioOutputError];
                    if (audioOutputError) {
                        self.hasAudio = NO;
                    }
                } else {
                    self.hasAudio = NO;
                }
            }
            
            if (addOutputError) {
                completion(addOutputError);
                return;
            }
            
            // Start capture
            [self.stream startCaptureWithCompletionHandler:^(NSError *error) {
                if (error) {
                    completion(error);
                } else {
                    self.isRecording = YES;
                    NSLog(@"Window recording started successfully");
                    completion(nil);
                }
            }];
        }];
    } else {
        completion([NSError errorWithDomain:@"ScreenRecorder" code:3 userInfo:@{NSLocalizedDescriptionKey: @"ScreenCaptureKit requires macOS 12.3 or later"}]);
    }
}

- (void)stream:(SCStream *)stream didOutputSampleBuffer:(CMSampleBufferRef)sampleBuffer ofType:(SCStreamOutputType)type {
    // Skip all frames while paused
    if (self.isPaused) {
        return;
    }
    
    if (type == SCStreamOutputTypeScreen) {
        if (!self.videoInput.isReadyForMoreMediaData) {
            // Drop frame if writer is not ready
            return;
        }

        CMTime presentationTime = CMSampleBufferGetPresentationTimeStamp(sampleBuffer);
        
        // Adjust time by subtracting total paused duration
        if (CMTIME_IS_VALID(self.totalPausedDuration) && CMTimeGetSeconds(self.totalPausedDuration) > 0) {
            presentationTime = CMTimeSubtract(presentationTime, self.totalPausedDuration);
        }
        
        if (!self.hasStartedSession) {
            [self.assetWriter startSessionAtSourceTime:presentationTime];
            self.hasStartedSession = YES;
            self.startTime = presentationTime;
        }

        CMSampleBufferRef adjustedSample = sampleBuffer;
        if (!CMSampleBufferGetImageBuffer(sampleBuffer)) {
            return;
        }

        CMSampleBufferRef copied = NULL;
        CMSampleTimingInfo timingInfo;
        timingInfo.duration = CMSampleBufferGetDuration(sampleBuffer);
        timingInfo.presentationTimeStamp = presentationTime;
        timingInfo.decodeTimeStamp = CMSampleBufferGetDecodeTimeStamp(sampleBuffer);
        CMSampleBufferCreateCopyWithNewTiming(NULL, sampleBuffer, 1, &timingInfo, &copied);
        if (copied) {
            adjustedSample = copied;
        }

        if (![self.videoInput appendSampleBuffer:adjustedSample]) {
            NSLog(@"Failed to append video sample buffer");
        }

        if (copied) {
            CFRelease(copied);
        }
        
    } else if (@available(macOS 13.0, *)) {
        // SCStreamOutputTypeAudio is only available on macOS 13.0+
        if (type == SCStreamOutputTypeAudio && self.hasAudio) {
            if (!self.audioInput.isReadyForMoreMediaData) {
                return;
            }
            
            // Handle audio samples
            if (!self.receivedFirstAudio) {
                self.receivedFirstAudio = YES;
                NSLog(@"Received first audio sample");
            }
            CMTime presentationTime = CMSampleBufferGetPresentationTimeStamp(sampleBuffer);
            
            // Adjust time by subtracting total paused duration
            if (CMTIME_IS_VALID(self.totalPausedDuration) && CMTimeGetSeconds(self.totalPausedDuration) > 0) {
                presentationTime = CMTimeSubtract(presentationTime, self.totalPausedDuration);
            }
            
            if (!self.hasStartedSession) {
                [self.assetWriter startSessionAtSourceTime:presentationTime];
                self.startTime = presentationTime;
                self.hasStartedSession = YES;
            }
            
            // Append audio sample buffer
            if (![self.audioInput appendSampleBuffer:sampleBuffer]) {
                NSLog(@"Failed to append audio sample buffer");
            }
        }
    }
}

- (void)stopRecording:(void (^)(NSString *, NSError *))completion {
    if (!self.isRecording) {
        completion(nil, [NSError errorWithDomain:@"ScreenRecorder" code:4 userInfo:@{NSLocalizedDescriptionKey: @"Not recording"}]);
        return;
    }
    
    if (@available(macOS 12.3, *)) {
        [self.stream stopCaptureWithCompletionHandler:^(NSError *error) {
            if (self.stream) {
                [self.stream removeStreamOutput:self type:SCStreamOutputTypeScreen error:nil];
                if (self.hasAudio) {
                    // SCStreamOutputTypeAudio is only available on macOS 13.0+
                    if (@available(macOS 13.0, *)) {
                        [self.stream removeStreamOutput:self type:SCStreamOutputTypeAudio error:nil];
                    }
                }
            }
            
            // Mark inputs finished
            if (self.audioInput) {
                [self.audioInput markAsFinished];
            }
            if (self.videoInput) {
                [self.videoInput markAsFinished];
            }
            
            [self.assetWriter finishWritingWithCompletionHandler:^{
                self.isRecording = NO;
                if (self.assetWriter.status == AVAssetWriterStatusCompleted) {
                    completion(self.outputPath, nil);
                } else {
                    completion(nil, self.assetWriter.error);
                }
            }];
        }];
    }
}

- (void)pauseRecording {
    if (!self.isRecording || self.isPaused) {
        return;
    }
    
    self.isPaused = YES;
    self.pauseStartTime = CMClockGetTime(CMClockGetHostTimeClock());
    NSLog(@"Recording paused at %f", CMTimeGetSeconds(self.pauseStartTime));
}

- (void)resumeRecording {
    if (!self.isRecording || !self.isPaused) {
        return;
    }
    
    // Calculate pause duration and add to total
    CMTime now = CMClockGetTime(CMClockGetHostTimeClock());
    if (CMTIME_IS_VALID(self.pauseStartTime)) {
        CMTime pauseDuration = CMTimeSubtract(now, self.pauseStartTime);
        if (CMTIME_IS_VALID(self.totalPausedDuration)) {
            self.totalPausedDuration = CMTimeAdd(self.totalPausedDuration, pauseDuration);
        } else {
            self.totalPausedDuration = pauseDuration;
        }
        NSLog(@"Resumed after %f seconds pause, total paused: %f", 
              CMTimeGetSeconds(pauseDuration), 
              CMTimeGetSeconds(self.totalPausedDuration));
    }
    
    self.isPaused = NO;
    self.pauseStartTime = kCMTimeInvalid;
}

@end

// NAPI wrapper
class NativeScreenRecorder : public Napi::ObjectWrap<NativeScreenRecorder> {
public:
    static Napi::Object Init(Napi::Env env, Napi::Object exports) {
        Napi::Function func = DefineClass(env, "NativeScreenRecorder", {
            InstanceMethod("startRecording", &NativeScreenRecorder::StartRecording),
            InstanceMethod("startRecordingWithRect", &NativeScreenRecorder::StartRecordingWithRect),
            InstanceMethod("startRecordingWindow", &NativeScreenRecorder::StartRecordingWindow),
            InstanceMethod("stopRecording", &NativeScreenRecorder::StopRecording),
            InstanceMethod("pauseRecording", &NativeScreenRecorder::PauseRecording),
            InstanceMethod("resumeRecording", &NativeScreenRecorder::ResumeRecording),
            InstanceMethod("isRecording", &NativeScreenRecorder::IsRecording),
            InstanceMethod("isAvailable", &NativeScreenRecorder::IsAvailable)
        });
        
        Napi::FunctionReference* constructor = new Napi::FunctionReference();
        *constructor = Napi::Persistent(func);
        env.SetInstanceData(constructor);
        
        exports.Set("NativeScreenRecorder", func);
        return exports;
    }
    
    NativeScreenRecorder(const Napi::CallbackInfo& info) : Napi::ObjectWrap<NativeScreenRecorder>(info) {
        // Always try to create the recorder on macOS
        recorder = [[ScreenRecorder alloc] init];
    }
    
private:
    ScreenRecorder* recorder;
    
    Napi::Value StartRecording(const Napi::CallbackInfo& info) {
        Napi::Env env = info.Env();
        
        if (!recorder) {
            Napi::Error::New(env, "ScreenCaptureKit requires macOS 12.3 or later").ThrowAsJavaScriptException();
            return env.Undefined();
        }
        
        if (info.Length() < 3 || !info[0].IsNumber() || !info[1].IsString() || !info[2].IsFunction()) {
            Napi::TypeError::New(env, "Expected (displayID: number, outputPath: string, callback: function, [onlySelf: boolean], [lowMemory: boolean], [includeAppWindows: boolean], [useMacOSDefaults: boolean], [framerate: number])")
                .ThrowAsJavaScriptException();
            return env.Undefined();
        }
        
        CGDirectDisplayID displayID = info[0].As<Napi::Number>().Uint32Value();
        std::string outputPath = info[1].As<Napi::String>().Utf8Value();
        Napi::Function callbackFunc = info[2].As<Napi::Function>();
        
        BOOL onlySelf = NO;
        BOOL lowMemory = NO;
        BOOL includeAppWindows = NO;
        BOOL useMacOSDefaults = YES;
        int framerate = 60;
        if (info.Length() > 3 && info[3].IsBoolean()) {
            onlySelf = info[3].As<Napi::Boolean>().Value();
        }
        if (info.Length() > 4 && info[4].IsBoolean()) {
            lowMemory = info[4].As<Napi::Boolean>().Value();
        }
        if (info.Length() > 5 && info[5].IsBoolean()) {
            includeAppWindows = info[5].As<Napi::Boolean>().Value();
        }
        if (info.Length() > 6 && info[6].IsBoolean()) {
            useMacOSDefaults = info[6].As<Napi::Boolean>().Value();
        }
        if (info.Length() > 7 && info[7].IsNumber()) {
            framerate = info[7].As<Napi::Number>().Int32Value();
        }
        
        Napi::ThreadSafeFunction tsfn = Napi::ThreadSafeFunction::New(
            env,
            callbackFunc,
            "StartRecordingCallback",
            0,
            1
        );
        
        NSString* path = [NSString stringWithUTF8String:outputPath.c_str()];
        
        dispatch_async(dispatch_get_main_queue(), ^{
            [recorder startRecordingDisplay:displayID outputPath:path sourceRect:CGRectNull onlySelf:onlySelf includeAppWindows:includeAppWindows lowMemory:lowMemory useMacOSDefaults:useMacOSDefaults framerate:framerate completion:^(NSError *error) {
                auto callback = [error](Napi::Env env, Napi::Function jsCallback) {
                    if (error) {
                        jsCallback.Call({Napi::Error::New(env, [[error localizedDescription] UTF8String]).Value()});
                    } else {
                        jsCallback.Call({env.Null()});
                    }
                };
                tsfn.BlockingCall(callback);
                tsfn.Release();
            }];
        });
        
        return env.Undefined();
    }
    
    Napi::Value StartRecordingWithRect(const Napi::CallbackInfo& info) {
        Napi::Env env = info.Env();
        
        if (!recorder) {
            Napi::Error::New(env, "ScreenCaptureKit requires macOS 12.3 or later").ThrowAsJavaScriptException();
            return env.Undefined();
        }
        
        // Args: displayID, outputPath, x, y, width, height, callback, [onlySelf], [lowMemory], [includeAppWindows], [useMacOSDefaults], [framerate]
        if (info.Length() < 7 || !info[0].IsNumber() || !info[1].IsString() || 
            !info[2].IsNumber() || !info[3].IsNumber() || !info[4].IsNumber() || 
            !info[5].IsNumber() || !info[6].IsFunction()) {
            Napi::TypeError::New(env, "Expected (displayID: number, outputPath: string, x: number, y: number, width: number, height: number, callback: function, [onlySelf: boolean], [lowMemory: boolean], [includeAppWindows: boolean], [useMacOSDefaults: boolean], [framerate: number])")
                .ThrowAsJavaScriptException();
            return env.Undefined();
        }
        
        CGDirectDisplayID displayID = info[0].As<Napi::Number>().Uint32Value();
        std::string outputPath = info[1].As<Napi::String>().Utf8Value();
        CGFloat x = info[2].As<Napi::Number>().DoubleValue();
        CGFloat y = info[3].As<Napi::Number>().DoubleValue();
        CGFloat width = info[4].As<Napi::Number>().DoubleValue();
        CGFloat height = info[5].As<Napi::Number>().DoubleValue();
        Napi::Function callbackFunc = info[6].As<Napi::Function>();
        
        BOOL onlySelf = NO;
        BOOL lowMemory = NO;
        BOOL includeAppWindows = NO;
        BOOL useMacOSDefaults = YES;
        int framerate = 60;
        if (info.Length() > 7 && info[7].IsBoolean()) {
            onlySelf = info[7].As<Napi::Boolean>().Value();
        }
        if (info.Length() > 8 && info[8].IsBoolean()) {
            lowMemory = info[8].As<Napi::Boolean>().Value();
        }
        if (info.Length() > 9 && info[9].IsBoolean()) {
            includeAppWindows = info[9].As<Napi::Boolean>().Value();
        }
        if (info.Length() > 10 && info[10].IsBoolean()) {
            useMacOSDefaults = info[10].As<Napi::Boolean>().Value();
        }
        if (info.Length() > 11 && info[11].IsNumber()) {
            framerate = info[11].As<Napi::Number>().Int32Value();
        }
        
        Napi::ThreadSafeFunction tsfn = Napi::ThreadSafeFunction::New(
            env,
            callbackFunc,
            "StartRecordingWithRectCallback",
            0,
            1
        );
        
        NSString* path = [NSString stringWithUTF8String:outputPath.c_str()];
        CGRect sourceRect = CGRectMake(x, y, width, height);
        
        dispatch_async(dispatch_get_main_queue(), ^{
            [recorder startRecordingDisplay:displayID outputPath:path sourceRect:sourceRect onlySelf:onlySelf includeAppWindows:includeAppWindows lowMemory:lowMemory useMacOSDefaults:useMacOSDefaults framerate:framerate completion:^(NSError *error) {
                auto callback = [error](Napi::Env env, Napi::Function jsCallback) {
                    if (error) {
                        jsCallback.Call({Napi::Error::New(env, [[error localizedDescription] UTF8String]).Value()});
                    } else {
                        jsCallback.Call({env.Null()});
                    }
                };
                tsfn.BlockingCall(callback);
                tsfn.Release();
            }];
        });
        
        return env.Undefined();
    }
    
    Napi::Value StartRecordingWindow(const Napi::CallbackInfo& info) {
        Napi::Env env = info.Env();
        
        if (!recorder) {
            Napi::Error::New(env, "ScreenCaptureKit requires macOS 12.3 or later").ThrowAsJavaScriptException();
            return env.Undefined();
        }
        
        // Args: windowID, outputPath, callback, [lowMemory], [useMacOSDefaults], [framerate]
        if (info.Length() < 3 || !info[0].IsNumber() || !info[1].IsString() || !info[2].IsFunction()) {
            Napi::TypeError::New(env, "Expected (windowID: number, outputPath: string, callback: function, [lowMemory: boolean], [useMacOSDefaults: boolean], [framerate: number])")
                .ThrowAsJavaScriptException();
            return env.Undefined();
        }
        
        CGWindowID windowID = info[0].As<Napi::Number>().Uint32Value();
        std::string outputPath = info[1].As<Napi::String>().Utf8Value();
        Napi::ThreadSafeFunction tsfn = Napi::ThreadSafeFunction::New(
            env,
            info[2].As<Napi::Function>(),
            "StartRecordingWindowCallback",
            0,
            1
        );
        
        NSString* path = [NSString stringWithUTF8String:outputPath.c_str()];
        
        BOOL lowMemory = NO;
        BOOL useMacOSDefaults = YES;
        int framerate = 60;
        if (info.Length() > 3 && info[3].IsBoolean()) {
            lowMemory = info[3].As<Napi::Boolean>().Value();
        }
        if (info.Length() > 4 && info[4].IsBoolean()) {
            useMacOSDefaults = info[4].As<Napi::Boolean>().Value();
        }
        if (info.Length() > 5 && info[5].IsNumber()) {
            framerate = info[5].As<Napi::Number>().Int32Value();
        }

        dispatch_async(dispatch_get_main_queue(), ^{
            [recorder startRecordingWindow:windowID outputPath:path lowMemory:lowMemory useMacOSDefaults:useMacOSDefaults framerate:framerate completion:^(NSError *error) {
                auto callback = [error](Napi::Env env, Napi::Function jsCallback) {
                    if (error) {
                        jsCallback.Call({Napi::Error::New(env, [[error localizedDescription] UTF8String]).Value()});
                    } else {
                        jsCallback.Call({env.Null()});
                    }
                };
                tsfn.BlockingCall(callback);
                tsfn.Release();
            }];
        });
        
        return env.Undefined();
    }
    
    Napi::Value StopRecording(const Napi::CallbackInfo& info) {
        Napi::Env env = info.Env();
        
        if (!recorder) {
            Napi::Error::New(env, "ScreenCaptureKit requires macOS 12.3 or later").ThrowAsJavaScriptException();
            return env.Undefined();
        }
        
        if (info.Length() < 1 || !info[0].IsFunction()) {
            Napi::TypeError::New(env, "Expected callback function").ThrowAsJavaScriptException();
            return env.Undefined();
        }
        
        Napi::ThreadSafeFunction tsfn = Napi::ThreadSafeFunction::New(
            env,
            info[0].As<Napi::Function>(),
            "StopRecordingCallback",
            0,
            1
        );
        
        dispatch_async(dispatch_get_main_queue(), ^{
            [recorder stopRecording:^(NSString *path, NSError *error) {
                auto callback = [path, error](Napi::Env env, Napi::Function jsCallback) {
                    if (error) {
                        jsCallback.Call({Napi::Error::New(env, [[error localizedDescription] UTF8String]).Value(), env.Null()});
                    } else if (path) {
                        jsCallback.Call({env.Null(), Napi::String::New(env, [path UTF8String])});
                    } else {
                        jsCallback.Call({env.Null(), env.Null()});
                    }
                };
                tsfn.BlockingCall(callback);
                tsfn.Release();
            }];
        });
        
        return env.Undefined();
    }
    
    Napi::Value PauseRecording(const Napi::CallbackInfo& info) {
        Napi::Env env = info.Env();
        
        if (!recorder) {
            Napi::Error::New(env, "Native recorder not available").ThrowAsJavaScriptException();
            return env.Undefined();
        }
        
        dispatch_async(dispatch_get_main_queue(), ^{
            [recorder pauseRecording];
        });
        
        return env.Undefined();
    }
    
    Napi::Value ResumeRecording(const Napi::CallbackInfo& info) {
        Napi::Env env = info.Env();
        
        if (!recorder) {
            Napi::Error::New(env, "Native recorder not available").ThrowAsJavaScriptException();
            return env.Undefined();
        }
        
        dispatch_async(dispatch_get_main_queue(), ^{
            [recorder resumeRecording];
        });
        
        return env.Undefined();
    }
    
    Napi::Value IsRecording(const Napi::CallbackInfo& info) {
        Napi::Env env = info.Env();
        
        if (!recorder) {
            return Napi::Boolean::New(env, false);
        }
        
        return Napi::Boolean::New(env, [recorder isRecording]);
    }
    
    Napi::Value IsAvailable(const Napi::CallbackInfo& info) {
        Napi::Env env = info.Env();
        
        // Report availability only on macOS 13.0+ where SC audio output is supported
        BOOL available = NO;
        if (@available(macOS 13.0, *)) {
            available = YES;
        } else {
            available = NO;
        }
        return Napi::Boolean::New(env, available);
    }
};

Napi::Object Init(Napi::Env env, Napi::Object exports) {
    return NativeScreenRecorder::Init(env, exports);
}

NODE_API_MODULE(screencapture_kit, Init)
