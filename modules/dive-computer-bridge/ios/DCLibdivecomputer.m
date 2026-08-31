#import "DCLibdivecomputer.h"

#import <libdivecomputer/version.h>

@implementation DCLibdivecomputer

+ (NSString *)versionString
{
	const char *version = dc_version(NULL);
	return version ? [NSString stringWithUTF8String:version] : @"";
}

@end
