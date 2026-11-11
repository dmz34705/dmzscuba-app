// DMZ Scuba additions to libdivecomputer's Shearwater Petrel-family driver.
// Implemented in modules/dive-computer-bridge/overlays/shearwater_petrel.c,
// appended to the staged shearwater_petrel.c. Read-only: the Peregrine refuses
// gas writes (NAK 0x31 on 0xA14A), so the app never writes Shearwater settings
// other than the clock.
#ifndef DMZ_SHEARWATER_H
#define DMZ_SHEARWATER_H

#include <libdivecomputer/common.h>
#include <libdivecomputer/device.h>

#ifdef __cplusplus
extern "C" {
#endif

#define DMZ_SHEARWATER_MAX_VALUE 256

/// Reads one data identifier. Returns DC_STATUS_UNSUPPORTED when the computer
/// refuses the ID (NAK). `actual` receives the value length.
dc_status_t dmz_shearwater_rdbi (dc_device_t *device, unsigned int id, unsigned char data[], unsigned int size, unsigned int *actual);

#ifdef __cplusplus
}
#endif

#endif
