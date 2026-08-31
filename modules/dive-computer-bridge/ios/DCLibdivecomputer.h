#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

/// Thin Objective-C shim over the vendored libdivecomputer C API. Keeps the C
/// includes out of Swift; the Swift module only ever touches this class.
@interface DCLibdivecomputer : NSObject

/// The linked libdivecomputer version, e.g. @"0.9.0".
+ (NSString *)versionString;

@end

NS_ASSUME_NONNULL_END
