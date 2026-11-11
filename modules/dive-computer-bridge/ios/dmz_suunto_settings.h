// Parser for the Suunto EON Steel / EON Core / D5 settings document returned by
// command 0x0011 (see overlays/suunto_eonsteel.c). Plain C, header-only, no
// dependencies — so it is unit-tested on the Mac against real captured
// settings (scripts/verify-suunto-settings.sh) before it runs on a device.
//
// Layout: u32 LE length (bytes after "SBEM0102"), u16 LE 0x0001, "SBEM0102",
// then records ff <u16 LE id> <u8 len> <value>.
//   0x0428 active dive mode name   0x0429 start of a mode (its name)
//   0x044c gas O2 %                0x044d gas He %
//
// dmz_suunto_find_active_gas() refuses (ok = 0, error set) unless the document
// is exactly the expected shape and the active mode has exactly one gas with
// no helium — the only case where "set the analyzed nitrox mix" is unambiguous.
#ifndef DMZ_SUUNTO_SETTINGS_H
#define DMZ_SUUNTO_SETTINGS_H

#include <stddef.h>
#include <string.h>

#define DMZ_SUUNTO_PREFIX_SIZE 6
#define DMZ_SUUNTO_ID_ACTIVE_MODE 0x0428
#define DMZ_SUUNTO_ID_MODE_NAME 0x0429
#define DMZ_SUUNTO_ID_GAS_O2 0x044c
#define DMZ_SUUNTO_ID_GAS_HE 0x044d

typedef struct {
  int ok;
  const char *error;
  size_t o2_offset;   // offset of the O2 value byte within the whole buffer
  int o2;
  int he;
  int gas_count;      // gases in the active mode
  char mode[32];      // active mode name
} dmz_suunto_gas_t;

static inline size_t dmz_suunto_strnlen(const unsigned char *s, size_t max) {
  size_t n = 0;
  while (n < max && s[n]) n++;
  return n;
}

static inline dmz_suunto_gas_t dmz_suunto_find_active_gas(const unsigned char *buf, size_t size) {
  dmz_suunto_gas_t r;
  memset(&r, 0, sizeof(r));
  r.o2 = -1;
  r.he = -1;

  if (buf == NULL || size < DMZ_SUUNTO_PREFIX_SIZE + 8) { r.error = "Settings reply is too short."; return r; }
  unsigned long declared = (unsigned long)buf[0] | ((unsigned long)buf[1] << 8) | ((unsigned long)buf[2] << 16) | ((unsigned long)buf[3] << 24);
  if (buf[4] != 0x01 || buf[5] != 0x00 || memcmp(buf + DMZ_SUUNTO_PREFIX_SIZE, "SBEM0102", 8) != 0) {
    r.error = "Settings are not in the expected format."; return r;
  }
  if (declared != size - DMZ_SUUNTO_PREFIX_SIZE - 8) { r.error = "Settings length doesn't match."; return r; }

  const unsigned char *active = NULL; size_t activeLen = 0;
  // First pass: validate every record and find the active mode's name.
  size_t i = DMZ_SUUNTO_PREFIX_SIZE + 8;
  while (i < size) {
    if (buf[i] != 0xff || i + 4 > size) { r.error = "Settings records are malformed."; return r; }
    unsigned id = buf[i + 1] | (buf[i + 2] << 8);
    size_t n = buf[i + 3];
    if (i + 4 + n > size) { r.error = "Settings records are truncated."; return r; }
    if (id == DMZ_SUUNTO_ID_ACTIVE_MODE) { active = buf + i + 4; activeLen = dmz_suunto_strnlen(active, n); }
    i += 4 + n;
  }
  if (i != size) { r.error = "Settings records are malformed."; return r; }
  if (active == NULL || activeLen == 0 || activeLen >= sizeof(r.mode)) { r.error = "Couldn't find the active dive mode."; return r; }
  memcpy(r.mode, active, activeLen);

  // Second pass: gases inside the active mode's block.
  int inActive = 0, modeFound = 0;
  i = DMZ_SUUNTO_PREFIX_SIZE + 8;
  while (i < size) {
    unsigned id = buf[i + 1] | (buf[i + 2] << 8);
    size_t n = buf[i + 3];
    const unsigned char *v = buf + i + 4;
    if (id == DMZ_SUUNTO_ID_MODE_NAME) {
      size_t len = dmz_suunto_strnlen(v, n);
      inActive = (len == activeLen && memcmp(v, active, len) == 0);
      if (inActive) modeFound++;
    } else if (inActive && id == DMZ_SUUNTO_ID_GAS_O2 && n == 1) {
      r.gas_count++;
      if (r.gas_count == 1) { r.o2 = v[0]; r.o2_offset = i + 4; }
    } else if (inActive && id == DMZ_SUUNTO_ID_GAS_HE && n == 1 && r.gas_count == 1 && r.he < 0) {
      r.he = v[0];
    }
    i += 4 + n;
  }

  if (modeFound != 1) { r.error = "Couldn't find the active dive mode's settings."; return r; }
  if (strcmp(r.mode, "Gauge") == 0) { r.error = "The computer is in Gauge mode — switch it to Air/Nitrox first."; return r; }
  if (r.gas_count == 0) { r.error = "The active dive mode has no gas."; return r; }
  if (r.gas_count > 1) { r.error = "The active dive mode has more than one gas — set the nitrox mix on the computer."; return r; }
  if (r.o2 < 1 || r.o2 > 100) { r.error = "The current gas looks invalid."; return r; }
  if (r.he != 0) { r.error = "The active gas has helium — an O2 analyzer can't verify a trimix. Set it on the computer."; return r; }
  r.ok = 1;
  return r;
}

#endif
