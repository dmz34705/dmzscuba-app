// DMZ Scuba additions to libdivecomputer's Suunto EON Steel driver.
// Implemented in modules/dive-computer-bridge/overlays/suunto_eonsteel.c, which
// the staging script appends to the staged suunto_eonsteel.c. Read-only.
#ifndef DMZ_SUUNTO_EONSTEEL_H
#define DMZ_SUUNTO_EONSTEEL_H

#include <libdivecomputer/common.h>
#include <libdivecomputer/device.h>
#include <libdivecomputer/buffer.h>

#ifdef __cplusplus
extern "C" {
#endif

typedef void (*dmz_dirent_callback_t) (int is_directory, const char *name, void *userdata);

/// Lists one directory on an EON Steel / EON Core / D5 (e.g. "0:/").
dc_status_t dmz_suunto_eonsteel_list_dir (dc_device_t *device, const char *path, dmz_dirent_callback_t callback, void *userdata);

/// Reads a whole file from an EON Steel / EON Core / D5 into `buffer`.
dc_status_t dmz_suunto_eonsteel_read_file (dc_device_t *device, const char *path, dc_buffer_t *buffer);

/// Reads the whole settings document (cmd 0x0011): u32 length, u16 0x0001, "SBEM0102" + records.
dc_status_t dmz_suunto_eonsteel_settings_read (dc_device_t *device, dc_buffer_t *buffer);

/// Writes a whole settings document (cmd 0x0111). `sbem` starts at "SBEM0102".
dc_status_t dmz_suunto_eonsteel_settings_write (dc_device_t *device, const unsigned char sbem[], unsigned int size);

/// Applies written settings (cmd 0x0002); the computer restarts afterwards.
dc_status_t dmz_suunto_eonsteel_apply (dc_device_t *device);

#ifdef __cplusplus
}
#endif

#endif
