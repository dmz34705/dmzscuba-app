
/* ==========================================================================
 * DMZ Scuba overlay — appended to shearwater_petrel.c at staging time by
 * modules/dive-computer-bridge/scripts/stage-libdivecomputer.js.
 *
 * READ-ONLY: exposes "read data by identifier" (RDBI, 0x22) for any ID, so the
 * app can scan which settings a Petrel-family computer (Perdix, Petrel, Teric,
 * Peregrine, Nerd, Tern…) reports — the first step toward finding where the
 * gas list lives. Unknown IDs are refused by the computer with a NAK
 * (DC_STATUS_UNSUPPORTED). Nothing here writes to the device.
 * ========================================================================== */

#include "../../dmz_shearwater.h"

dc_status_t
dmz_shearwater_rdbi (dc_device_t *abstract, unsigned int id, unsigned char data[], unsigned int size, unsigned int *actual)
{
	if (!dc_device_isinstance (abstract, &shearwater_petrel_device_vtable) || data == NULL || actual == NULL)
		return DC_STATUS_INVALIDARGS;
	return shearwater_common_rdbi ((shearwater_common_device_t *) abstract, id & 0xFFFF, data, size, actual);
}
