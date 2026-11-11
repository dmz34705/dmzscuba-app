// Unit test for modules/dive-computer-bridge/ios/dmz_suunto_settings.h against
// real settings captured from an EON Core (Suunto app sync, 2026-11-10).
// Run: npm run test:suunto-settings
#include <assert.h>
#include <stdio.h>
#include <stdlib.h>
#include "../modules/dive-computer-bridge/ios/dmz_suunto_settings.h"

static unsigned char *load(const char *path, size_t *size) {
  FILE *f = fopen(path, "rb"); assert(f);
  fseek(f, 0, SEEK_END); *size = (size_t)ftell(f); fseek(f, 0, SEEK_SET);
  unsigned char *b = malloc(*size); assert(fread(b, 1, *size, f) == *size); fclose(f);
  return b;
}

int main(void) {
  size_t n36, n32;
  unsigned char *s36 = load("scripts/fixtures/suunto-eoncore-settings-36.bin", &n36);
  unsigned char *s32 = load("scripts/fixtures/suunto-eoncore-settings-32.bin", &n32);

  dmz_suunto_gas_t g = dmz_suunto_find_active_gas(s36, n36);
  assert(g.ok && "real EON Core settings parse");
  assert(strcmp(g.mode, "Air/Nitrox") == 0);
  assert(g.o2 == 36 && g.he == 0 && g.gas_count == 1);
  assert(s36[g.o2_offset] == 36);

  // The Suunto app's 36 -> 32 write is exactly that one byte, as read back by the computer.
  dmz_suunto_gas_t g32 = dmz_suunto_find_active_gas(s32, n32);
  assert(g32.ok && g32.o2 == 32 && g32.o2_offset == g.o2_offset);

  // Editing the O2 byte in place still parses, with the new value.
  unsigned char *edit = malloc(n36); memcpy(edit, s36, n36);
  edit[g.o2_offset] = 32;
  dmz_suunto_gas_t ge = dmz_suunto_find_active_gas(edit, n36);
  assert(ge.ok && ge.o2 == 32);

  // Refusals: corrupted header, truncation, wrong length, helium, Gauge mode.
  unsigned char *bad = malloc(n36);
  memcpy(bad, s36, n36); bad[6] = 'X';
  assert(!dmz_suunto_find_active_gas(bad, n36).ok);
  assert(!dmz_suunto_find_active_gas(s36, n36 - 1).ok);
  memcpy(bad, s36, n36); bad[0] ^= 1;
  assert(!dmz_suunto_find_active_gas(bad, n36).ok);
  memcpy(bad, s36, n36); bad[g.o2_offset + 5] = 30; // He record follows O2: ff 4d 04 01 <he>
  assert(bad[g.o2_offset + 1] == 0xff && bad[g.o2_offset + 2] == 0x4d);
  dmz_suunto_gas_t gh = dmz_suunto_find_active_gas(bad, n36);
  assert(!gh.ok && strstr(gh.error, "helium"));

  // Switch the active mode to "Gauge": find the 0x0428 record and rewrite its name.
  memcpy(bad, s36, n36);
  for (size_t i = 14; i + 4 < n36; i += 4 + bad[i + 3]) {
    if ((bad[i + 1] | (bad[i + 2] << 8)) == 0x0428) {
      memset(bad + i + 4, 0, bad[i + 3]);
      memcpy(bad + i + 4, "Gauge", 5);
      break;
    }
  }
  dmz_suunto_gas_t gg = dmz_suunto_find_active_gas(bad, n36);
  assert(!gg.ok && strstr(gg.error, "Gauge"));

  printf("Suunto settings parser verified against captured EON Core settings.\n");
  return 0;
}
