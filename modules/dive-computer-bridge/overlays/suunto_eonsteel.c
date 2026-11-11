
/* ==========================================================================
 * DMZ Scuba overlay — appended to suunto_eonsteel.c at staging time by
 * modules/dive-computer-bridge/scripts/stage-libdivecomputer.js, so it can use
 * the driver's static transfer/read helpers without forking the submodule.
 *
 * READ-ONLY filesystem access for the Suunto EON Steel / EON Core / D5. Used
 * to find where the Suunto app stores dive modes and gases, as the first step
 * toward sending an analyzed nitrox mix to the computer. Nothing here writes
 * to the device.
 * ========================================================================== */

#include "../../dmz_suunto_eonsteel.h"

dc_status_t
dmz_suunto_eonsteel_list_dir (dc_device_t *abstract, const char *path, dmz_dirent_callback_t callback, void *userdata)
{
	suunto_eonsteel_device_t *eon = (suunto_eonsteel_device_t *) abstract;
	unsigned char cmd[64];
	unsigned char result[2048];
	unsigned int n = 0;
	size_t pathlen;
	dc_status_t rc;

	if (!dc_device_isinstance (abstract, &suunto_eonsteel_device_vtable) || path == NULL)
		return DC_STATUS_INVALIDARGS;

	pathlen = strlen (path) + 1;
	if (pathlen + 4 > sizeof (cmd))
		return DC_STATUS_INVALIDARGS;

	memset (cmd, 0, sizeof (cmd));
	memcpy (cmd + 4, path, pathlen);
	rc = suunto_eonsteel_transfer (eon, CMD_DIR_OPEN, cmd, 4 + pathlen, result, sizeof (result), &n);
	if (rc != DC_STATUS_SUCCESS)
		return rc;

	for (;;) {
		unsigned int last, len;
		const unsigned char *p;

		rc = suunto_eonsteel_transfer (eon, CMD_DIR_READDIR, NULL, 0, result, sizeof (result), &n);
		if (rc != DC_STATUS_SUCCESS)
			break;
		if (n < 8) {
			rc = DC_STATUS_PROTOCOL;
			break;
		}
		last = array_uint32_le (result + 4);
		p = result + 8;
		len = n - 8;
		while (len > 8) {
			unsigned int type = array_uint32_le (p);
			unsigned int namelen = array_uint32_le (p + 4);
			const char *name = (const char *) p + 8;
			if (namelen + 8 + 1 > len || name[namelen] != 0)
				break;
			if (callback)
				callback (type == DIRTYPE_DIR, name, userdata);
			p += 8 + namelen + 1;
			len -= 8 + namelen + 1;
		}
		if (last)
			break;
	}

	{
		dc_status_t crc = suunto_eonsteel_transfer (eon, CMD_DIR_CLOSE, NULL, 0, result, sizeof (result), NULL);
		if (rc == DC_STATUS_SUCCESS)
			rc = crc;
	}
	return rc;
}

dc_status_t
dmz_suunto_eonsteel_read_file (dc_device_t *abstract, const char *path, dc_buffer_t *buffer)
{
	if (!dc_device_isinstance (abstract, &suunto_eonsteel_device_vtable) || path == NULL || buffer == NULL)
		return DC_STATUS_INVALIDARGS;
	return read_file ((suunto_eonsteel_device_t *) abstract, path, buffer);
}

/* --------------------------------------------------------------------------
 * Settings exchange (learned from a capture of the Suunto app syncing a gas
 * change to an EON Core, 2026-11-10):
 *   0x0011 data 00000000           -> reply: u32 len, u16 0x0001, "SBEM0102" + records
 *   0x0111 data 00000000 01 01 +SBEM -> reply: empty (write the whole settings document)
 *   0x0002 no data                 -> reply: empty, then the computer restarts to apply
 * Records: ff <u16 id> <u8 len> <value>. 0x0428 = active mode name, 0x0429 =
 * start of a mode (its name), 0x044c = gas O2 %, 0x044d = gas He %.
 * -------------------------------------------------------------------------- */

#define DMZ_CMD_SETTINGS_READ  0x0011
#define DMZ_CMD_SETTINGS_WRITE 0x0111
#define DMZ_CMD_APPLY          0x0002

/* Like suunto_eonsteel_transfer, but sends payloads larger than one 64-byte
 * USB packet (BLE only — the HDLC stream splits it into 20-byte writes). */
static dc_status_t
dmz_eonsteel_transfer_ble (suunto_eonsteel_device_t *device, unsigned short cmd,
	const unsigned char data[], unsigned int size,
	unsigned char answer[], unsigned int asize, unsigned int *actual)
{
	dc_status_t rc;
	unsigned char header[HEADER_SIZE + MAXDATA_SIZE];
	unsigned int len = 0;

	if (dc_iostream_get_transport (device->iostream) != DC_TRANSPORT_BLE)
		return DC_STATUS_UNSUPPORTED;
	if (size > MAXDATA_SIZE)
		return DC_STATUS_INVALIDARGS;

	unsigned char *buf = (unsigned char *) malloc (HEADER_SIZE + size + CRC_SIZE);
	if (buf == NULL)
		return DC_STATUS_NOMEMORY;
	array_uint16_le_set (buf + 0, cmd);
	array_uint32_le_set (buf + 2, device->magic);
	array_uint16_le_set (buf + 6, device->seq);
	array_uint32_le_set (buf + 8, size);
	if (size)
		memcpy (buf + HEADER_SIZE, data, size);
	array_uint32_le_set (buf + HEADER_SIZE + size, checksum_crc32r (buf, HEADER_SIZE + size));
	rc = dc_iostream_write (device->iostream, buf, HEADER_SIZE + size + CRC_SIZE, NULL);
	free (buf);
	if (rc != DC_STATUS_SUCCESS)
		return rc;

	rc = suunto_eonsteel_receive_ble (device, header, sizeof (header), &len);
	if (rc != DC_STATUS_SUCCESS)
		return rc;
	if (len < HEADER_SIZE)
		return DC_STATUS_PROTOCOL;

	unsigned int reply = array_uint16_le (header);
	unsigned int magic = array_uint32_le (header + 2);
	unsigned int seq = array_uint16_le (header + 6);
	unsigned int length = array_uint32_le (header + 8);
	if (reply != cmd || magic != device->magic + 5 || seq != device->seq) {
		ERROR (device->base.context, "Unexpected reply %04x/%08x/%04x to %04x.", reply, magic, seq, cmd);
		return DC_STATUS_PROTOCOL;
	}
	if (length > asize || len - HEADER_SIZE != length)
		return DC_STATUS_PROTOCOL;
	if (length)
		memcpy (answer, header + HEADER_SIZE, length);
	device->seq++;
	if (actual)
		*actual = length;
	return DC_STATUS_SUCCESS;
}

dc_status_t
dmz_suunto_eonsteel_settings_read (dc_device_t *abstract, dc_buffer_t *buffer)
{
	suunto_eonsteel_device_t *eon = (suunto_eonsteel_device_t *) abstract;
	unsigned char request[4] = { 0, 0, 0, 0 };
	unsigned char result[MAXDATA_SIZE];
	unsigned int n = 0;

	if (!dc_device_isinstance (abstract, &suunto_eonsteel_device_vtable) || buffer == NULL)
		return DC_STATUS_INVALIDARGS;
	dc_status_t rc = dmz_eonsteel_transfer_ble (eon, DMZ_CMD_SETTINGS_READ, request, sizeof (request), result, sizeof (result), &n);
	if (rc != DC_STATUS_SUCCESS)
		return rc;
	dc_buffer_clear (buffer);
	return dc_buffer_append (buffer, result, n) ? DC_STATUS_SUCCESS : DC_STATUS_NOMEMORY;
}

dc_status_t
dmz_suunto_eonsteel_settings_write (dc_device_t *abstract, const unsigned char sbem[], unsigned int size)
{
	suunto_eonsteel_device_t *eon = (suunto_eonsteel_device_t *) abstract;
	unsigned char result[64];

	if (!dc_device_isinstance (abstract, &suunto_eonsteel_device_vtable) || sbem == NULL || size < 8 || size + 6 > MAXDATA_SIZE)
		return DC_STATUS_INVALIDARGS;
	unsigned char *payload = (unsigned char *) malloc (size + 6);
	if (payload == NULL)
		return DC_STATUS_NOMEMORY;
	memset (payload, 0, 4);
	payload[4] = 0x01;
	payload[5] = 0x01;
	memcpy (payload + 6, sbem, size);
	dc_status_t rc = dmz_eonsteel_transfer_ble (eon, DMZ_CMD_SETTINGS_WRITE, payload, size + 6, result, sizeof (result), NULL);
	free (payload);
	return rc;
}

dc_status_t
dmz_suunto_eonsteel_apply (dc_device_t *abstract)
{
	unsigned char result[64];
	if (!dc_device_isinstance (abstract, &suunto_eonsteel_device_vtable))
		return DC_STATUS_INVALIDARGS;
	return dmz_eonsteel_transfer_ble ((suunto_eonsteel_device_t *) abstract, DMZ_CMD_APPLY, NULL, 0, result, sizeof (result), NULL);
}
