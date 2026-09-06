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

/// Sets the dive computer's clock. `year`/`month`/`day`/`hour`/`minute`/`second`
/// are plain wall-clock values (this class does no timezone math — the caller
/// hands over whatever local time it wants the computer to show).
///
/// Runs on a background thread, same as -startDownloadWithName:…. `completion`
/// fires once with either a non-nil result ({ @"vendor": …, @"product": … }) or
/// a non-nil error string — including "This dive computer does not support
/// setting its clock from an app." for a device whose libdivecomputer backend
/// has no time-sync support at all (Aqualung/Oceanic/Sherwood among them).
- (void)syncTimeWithName:(NSString *)name
                   vendor:(nullable NSString *)vendor
                  product:(nullable NSString *)product
                     year:(NSInteger)year
                    month:(NSInteger)month
                      day:(NSInteger)day
                     hour:(NSInteger)hour
                   minute:(NSInteger)minute
                   second:(NSInteger)second
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
