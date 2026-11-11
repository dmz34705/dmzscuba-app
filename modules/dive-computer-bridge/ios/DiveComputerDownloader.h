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

/// Pre-dive setup in one session: sets the "first" open-circuit gas to `oxygen` %
/// (Heinrichs-Weikamp OSTC family only — verified by read-back; pass a value
/// outside 5…100 to skip) and, when `setClock` is YES, the clock.
///
/// `completion` fires with { @"vendor", @"product", @"gas": { @"status":
/// set|unsupported|skipped|error, @"message"?, @"slot"?, @"previous"? },
/// @"clock": { @"status": set|unsupported|skipped|error, @"message"? } }, or a
/// non-nil error string when no session with the computer could be opened.
- (void)setupDeviceWithName:(NSString *)name
                     vendor:(nullable NSString *)vendor
                    product:(nullable NSString *)product
                     oxygen:(NSInteger)oxygen
                   setClock:(BOOL)setClock
                       year:(NSInteger)year
                      month:(NSInteger)month
                        day:(NSInteger)day
                       hour:(NSInteger)hour
                     minute:(NSInteger)minute
                     second:(NSInteger)second
                    onEvent:(void (^)(NSString *name, NSDictionary<NSString *, id> *body))onEvent
                 completion:(void (^)(NSDictionary *_Nullable result, NSString *_Nullable error))completion;

/// READ-ONLY: lists and reads the non-dive files on a Suunto EON Steel / EON
/// Core / D5 (to find where dive modes and gases live). `completion` gets
/// { vendor, product, root, entries: [{path, dir}], files: [{path, size,
/// base64} | {path, error}], problems: [string], truncated } or an error.
- (void)exploreSuuntoWithName:(NSString *)name
                       vendor:(nullable NSString *)vendor
                      product:(nullable NSString *)product
                      onEvent:(void (^)(NSString *name, NSDictionary<NSString *, id> *body))onEvent
                   completion:(void (^)(NSDictionary *_Nullable result, NSString *_Nullable error))completion;

/// READ-ONLY: reads every data identifier in `ranges` ([[start, end], …],
/// inclusive) from a Shearwater Petrel-family computer. `completion` gets
/// { vendor, product, values: { "0x8010": hex }, scanned, total, refused,
/// failures: [{id, rc}], complete, seconds } or an error.
- (void)scanShearwaterWithName:(NSString *)name
                        vendor:(nullable NSString *)vendor
                       product:(nullable NSString *)product
                        ranges:(NSArray<NSArray<NSNumber *> *> *)ranges
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
