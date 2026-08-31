#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

/// Drives a libdivecomputer download over a BLE-backed custom iostream.
///
/// Transport is asynchronous and lives in JavaScript (react-native-ble-plx):
/// this class turns libdivecomputer's blocking read/write calls into events the
/// JS layer services, and blocks the download thread until JS feeds bytes back.
///
/// One download at a time. All public methods are safe to call from any thread.
@interface DiveComputerDownloader : NSObject

+ (instancetype)shared;

/// Starts a download on a background thread.
///
/// `onEvent` is called with (name, body):
///   - @"write"    { @"data": base64 }          -> JS writes to the characteristic, then calls -notifyWriteComplete
///   - @"progress" { @"current": n, @"maximum": n }
///   - @"devinfo"  { @"model": n, @"firmware": n, @"serial": n }
///   - @"dive"     { @"number": n, @"dive": {raw dive dict} }
///   - @"log"      { @"message": string }
///
/// `completion` fires once with either a result ({ @"fingerprint": hex,
/// @"count": n }) or a non-nil error string.
- (void)startDownloadWithName:(NSString *)name
                       vendor:(nullable NSString *)vendor
                      product:(nullable NSString *)product
                  fingerprint:(nullable NSData *)fingerprint
                      onEvent:(void (^)(NSString *name, NSDictionary<NSString *, id> *body))onEvent
                   completion:(void (^)(NSDictionary *_Nullable result, NSString *_Nullable error))completion;

/// Feeds bytes received from a BLE notification to the download thread.
- (void)provideBytes:(NSData *)data;

/// Unblocks the download thread after JS has written the pending @"write" payload.
- (void)notifyWriteComplete;

/// Requests cancellation of the active download.
- (void)cancel;

@property (atomic, readonly, getter=isRunning) BOOL running;

@end

NS_ASSUME_NONNULL_END
