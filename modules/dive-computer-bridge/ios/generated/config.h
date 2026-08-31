/*
 * Hand-written libdivecomputer build configuration for Apple platforms
 * (iOS device, iOS Simulator, macOS).
 *
 * libdivecomputer's autotools build generates config.h by probing the host.
 * This file covers exactly the feature macros the vendored v0.9.0 sources
 * reference on Apple: everything here has been checked against the SDK.
 *
 * Deliberately NOT defined:
 *   HAVE_LIBUSB / HAVE_HIDAPI / HAVE_BLUEZ  -> USB/BLE/IrDA backends compile to
 *       "unsupported" stubs. Transport is provided at runtime through a custom
 *       dc_iostream (dc_custom_cbs_t) backed by React Native BLE.
 *   HAVE_VERSION_SUFFIX -> src/version.c would #include "revision.h" (a
 *       git-generated file we don't ship); without it dc_version() returns the
 *       plain "0.9.0" string.
 *   HAVE_IOKIT_SERIAL_IOSS_H -> macOS-only IOKit serial header, absent on iOS.
 */

#ifndef DMZ_LIBDIVECOMPUTER_CONFIG_H
#define DMZ_LIBDIVECOMPUTER_CONFIG_H

/* Diagnostic logging through dc_context_set_logfunc. */
#define ENABLE_LOGGING 1

/* Standard POSIX headers present in the iOS SDK. */
#define HAVE_UNISTD_H 1
#define HAVE_SYS_PARAM_H 1
#define HAVE_PTHREAD_H 1

/* libc facilities. Apple's strerror_r is the XSI (int-returning) variant, which
 * is the branch src/context.c takes for plain HAVE_STRERROR_R. */
#define HAVE_STRERROR_R 1
#define HAVE_CLOCK_GETTIME 1
#define HAVE_LOCALTIME_R 1
#define HAVE_GMTIME_R 1
#define HAVE_TIMEGM 1

/* BSD struct tm has tm_gmtoff, so datetime.c can read the UTC offset directly. */
#define HAVE_STRUCT_TM_TM_GMTOFF 1

#endif /* DMZ_LIBDIVECOMPUTER_CONFIG_H */
