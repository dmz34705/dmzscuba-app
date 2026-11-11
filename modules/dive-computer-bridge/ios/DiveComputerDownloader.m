#import "DiveComputerDownloader.h"

#import <strings.h>  // strcasecmp
#import <ctype.h>    // toupper

#import <libdivecomputer/context.h>
#import <libdivecomputer/descriptor.h>
#import <libdivecomputer/iterator.h>
#import <libdivecomputer/custom.h>
#import <libdivecomputer/device.h>
#import <libdivecomputer/parser.h>
#import <libdivecomputer/datetime.h>
#import <libdivecomputer/ble.h>
#import <libdivecomputer/hw_ostc3.h>
#import "dmz_suunto_eonsteel.h"
#import "dmz_suunto_settings.h"
#import "dmz_shearwater.h"

// ---------------------------------------------------------------------------
// Session state
// ---------------------------------------------------------------------------

@interface DiveComputerDownloader () {
  NSCondition *_rxCond;      // guards _rx / _closed / _cancelled
  NSMutableData *_rx;        // bytes received from BLE, not yet consumed
  NSMutableArray<NSNumber *> *_rxPacketLengths; // pending Shearwater notification lengths
  BOOL _preserveRxPackets;   // guarded by _rxCond
  NSCondition *_txCond;      // guards _txPending
  BOOL _txPending;           // a @"write" is awaiting -notifyWriteComplete
  BOOL _closed;
  BOOL _cancelled;
  int _timeoutMs;
}
@property (atomic, assign, getter=isRunning) BOOL running;
@property (nonatomic, copy, nullable) void (^onEvent)(NSString *, NSDictionary<NSString *, id> *);
@property (nonatomic, copy, nullable) NSString *firstFingerprint; // newest dive's fingerprint, for incremental
// Resolved from the DC_EVENT_DEVINFO model during download — libdivecomputer's
// BLE-name filter only narrows to a family, so the descriptor we open with can be
// the wrong model (e.g. "Petrel 2" for a Peregrine). DEVINFO gives the real one.
@property (nonatomic, copy, nullable) NSString *resolvedVendor;
@property (nonatomic, copy, nullable) NSString *resolvedProduct;
@property (nonatomic, copy, nullable) NSString *deviceSerial;
// The advertised BLE name, exposed to libdivecomputer's oceanic_atom2 backend
// via cb_ioctl's DC_IOCTL_BLE_GET_NAME — its BLE handshake derives a passphrase
// from the serial digits encoded in this name (see oceanic_atom2_ble_handshake).
@property (nonatomic, copy, nullable) NSString *bleName;
@property (nonatomic, assign) dc_context_t *dcContext;
@property (nonatomic, assign) dc_family_t openFamily;
@end

@implementation DiveComputerDownloader

+ (instancetype)shared {
  static DiveComputerDownloader *instance;
  static dispatch_once_t once;
  dispatch_once(&once, ^{ instance = [[self alloc] init]; });
  return instance;
}

- (instancetype)init {
  if ((self = [super init])) {
    _rxCond = [NSCondition new];
    _txCond = [NSCondition new];
    _rx = [NSMutableData new];
    _rxPacketLengths = [NSMutableArray new];
    _timeoutMs = 3000;
  }
  return self;
}

- (void)emit:(NSString *)name body:(NSDictionary<NSString *, id> *)body {
  void (^handler)(NSString *, NSDictionary<NSString *, id> *) = self.onEvent;
  if (handler) handler(name, body ?: @{});
}

- (void)log:(NSString *)message {
  [self emit:@"log" body:@{ @"message": message ?: @"" }];
}

static void download_log_cb(dc_context_t *context, dc_loglevel_t level,
                            const char *file, unsigned int line, const char *function,
                            const char *message, void *userdata) {
  (void)context;
  (void)level;
  DiveComputerDownloader *downloader = (__bridge DiveComputerDownloader *)userdata;
  const char *basename = strrchr(file, '/');
  [downloader log:[NSString stringWithFormat:@"libdivecomputer %s:%u (%s): %s",
                   basename ? basename + 1 : file, line, function, message]];
}

// ---------------------------------------------------------------------------
// JS -> download-thread plumbing
// ---------------------------------------------------------------------------

- (void)provideBytes:(NSData *)data {
  if (data.length == 0) return;
  [_rxCond lock];
  [_rx appendData:data];
  if (_preserveRxPackets) [_rxPacketLengths addObject:@(data.length)];
  [_rxCond broadcast];
  [_rxCond unlock];
}

- (void)notifyWriteComplete {
  [_txCond lock];
  _txPending = NO;
  [_txCond broadcast];
  [_txCond unlock];
}

- (void)cancel {
  [_rxCond lock];
  _cancelled = YES;
  [_rxCond broadcast];
  [_rxCond unlock];
  [_txCond lock];
  [_txCond broadcast];
  [_txCond unlock];
}

- (void)teardown {
  [_rxCond lock];
  _closed = YES;
  [_rx setLength:0];
  [_rxPacketLengths removeAllObjects];
  _preserveRxPackets = NO;
  [_rxCond broadcast];
  [_rxCond unlock];
  [_txCond lock];
  _txPending = NO;
  [_txCond broadcast];
  [_txCond unlock];
}

// ---------------------------------------------------------------------------
// dc_custom_cbs_t implementations (userdata == the downloader instance)
// ---------------------------------------------------------------------------

static dc_status_t cb_set_timeout(void *ud, int timeout) {
  DiveComputerDownloader *self = (__bridge DiveComputerDownloader *)ud;
  self->_timeoutMs = timeout < 0 ? INT_MAX : timeout;
  return DC_STATUS_SUCCESS;
}

static dc_status_t cb_poll(void *ud, int timeout) {
  DiveComputerDownloader *self = (__bridge DiveComputerDownloader *)ud;
  NSDate *deadline = timeout < 0 ? [NSDate distantFuture]
                                 : [NSDate dateWithTimeIntervalSinceNow:timeout / 1000.0];
  [self->_rxCond lock];
  while (self->_rx.length == 0 && !self->_cancelled && !self->_closed) {
    if (![self->_rxCond waitUntilDate:deadline]) break;
  }
  BOOL hasData = self->_rx.length > 0;
  BOOL stop = self->_cancelled || self->_closed;
  [self->_rxCond unlock];
  if (stop) return DC_STATUS_CANCELLED;
  return hasData ? DC_STATUS_SUCCESS : DC_STATUS_TIMEOUT;
}

static dc_status_t cb_read(void *ud, void *data, size_t size, size_t *actual) {
  DiveComputerDownloader *self = (__bridge DiveComputerDownloader *)ud;
  NSDate *deadline = [NSDate dateWithTimeIntervalSinceNow:self->_timeoutMs / 1000.0];
  [self->_rxCond lock];
  while (self->_rx.length == 0 && !self->_cancelled && !self->_closed) {
    if (![self->_rxCond waitUntilDate:deadline]) break;
  }
  if (self->_cancelled || self->_closed) {
    [self->_rxCond unlock];
    if (actual) *actual = 0;
    return DC_STATUS_CANCELLED;
  }
  size_t n = MIN(size, (size_t)self->_rx.length);
  if (n > 0 && self->_preserveRxPackets) {
    // Shearwater's driver strips a two-byte header from every BLE read.
    // Joining notifications would leave the subsequent headers in the payload.
    size_t packetLength = self->_rxPacketLengths.firstObject.unsignedIntegerValue;
    if (packetLength > size) {
      [self->_rxCond unlock];
      if (actual) *actual = 0;
      [self log:@"Shearwater notification exceeds the driver's receive buffer."];
      return DC_STATUS_PROTOCOL;
    }
    n = packetLength;
    [self->_rxPacketLengths removeObjectAtIndex:0];
  }
  if (n > 0) {
    memcpy(data, self->_rx.bytes, n);
    [self->_rx replaceBytesInRange:NSMakeRange(0, n) withBytes:NULL length:0];
  }
  [self->_rxCond unlock];
  if (actual) *actual = n;
  return n > 0 ? DC_STATUS_SUCCESS : DC_STATUS_TIMEOUT;
}

static dc_status_t cb_write(void *ud, const void *data, size_t size, size_t *actual) {
  DiveComputerDownloader *self = (__bridge DiveComputerDownloader *)ud;
  if (self->_cancelled || self->_closed) return DC_STATUS_CANCELLED;

  NSData *payload = [NSData dataWithBytes:data length:size];
  [self->_txCond lock];
  self->_txPending = YES;
  [self->_txCond unlock];

  [self emit:@"write" body:@{ @"data": [payload base64EncodedStringWithOptions:0] }];

  NSDate *deadline = [NSDate dateWithTimeIntervalSinceNow:10.0];
  [self->_txCond lock];
  while (self->_txPending && !self->_cancelled && !self->_closed) {
    if (![self->_txCond waitUntilDate:deadline]) break;
  }
  BOOL stillPending = self->_txPending;
  [self->_txCond unlock];

  if (self->_cancelled || self->_closed) return DC_STATUS_CANCELLED;
  if (stillPending) return DC_STATUS_TIMEOUT;
  if (actual) *actual = size;
  return DC_STATUS_SUCCESS;
}

static dc_status_t cb_get_available(void *ud, size_t *value) {
  DiveComputerDownloader *self = (__bridge DiveComputerDownloader *)ud;
  [self->_rxCond lock];
  if (value) *value = (size_t)self->_rx.length;
  [self->_rxCond unlock];
  return DC_STATUS_SUCCESS;
}

static dc_status_t cb_sleep(void *ud, unsigned int ms) {
  (void)ud;
  usleep(ms * 1000);
  return DC_STATUS_SUCCESS;
}

static dc_status_t cb_purge(void *ud, dc_direction_t direction) {
  DiveComputerDownloader *self = (__bridge DiveComputerDownloader *)ud;
  (void)direction;
  [self->_rxCond lock];
  [self->_rx setLength:0];
  [self->_rxPacketLengths removeAllObjects];
  [self->_rxCond unlock];
  return DC_STATUS_SUCCESS;
}

static dc_status_t cb_ok(void *ud) { (void)ud; return DC_STATUS_SUCCESS; }
static dc_status_t cb_close(void *ud) { return cb_ok(ud); }
static dc_status_t cb_flush(void *ud) { return cb_ok(ud); }
static dc_status_t cb_configure(void *ud, unsigned int a, unsigned int b, dc_parity_t c, dc_stopbits_t d, dc_flowcontrol_t e) {
  (void)ud; (void)a; (void)b; (void)c; (void)d; (void)e; return DC_STATUS_SUCCESS;
}
static dc_status_t cb_set_uint(void *ud, unsigned int v) { (void)ud; (void)v; return DC_STATUS_SUCCESS; }
static dc_status_t cb_get_lines(void *ud, unsigned int *v) { (void)ud; if (v) *v = 0; return DC_STATUS_SUCCESS; }
static dc_status_t cb_ioctl(void *ud, unsigned int request, void *data, size_t size) {
  // The Oceanic/Pelagic BLE backend (oceanic_atom2_ble_handshake) needs the
  // advertised BLE name back from the transport to derive its handshake
  // passphrase from the serial digits encoded in it (e.g. "FH002112"). Without
  // this, it silently skips the handshake — some models tolerate that, but
  // ones that require it (the i300C among them) then reject later commands,
  // surfacing as an opaque "Download failed (-1)" partway through the read.
  if (request == DC_IOCTL_BLE_GET_NAME) {
    DiveComputerDownloader *self = (__bridge DiveComputerDownloader *)ud;
    const char *utf8 = self.bleName.UTF8String;
    if (!utf8 || !data || size == 0) return DC_STATUS_UNSUPPORTED;
    size_t len = strlen(utf8);
    size_t copyLen = len < size - 1 ? len : size - 1; // always leave room for the null terminator
    memcpy(data, utf8, copyLen);
    ((char *)data)[copyLen] = 0;
    return DC_STATUS_SUCCESS;
  }
  (void)data; (void)size;
  return DC_STATUS_UNSUPPORTED;
}

// ---------------------------------------------------------------------------
// libdivecomputer event / cancel / dive callbacks
// ---------------------------------------------------------------------------

static int cancel_cb(void *ud) {
  DiveComputerDownloader *self = (__bridge DiveComputerDownloader *)ud;
  return self->_cancelled ? 1 : 0;
}

// Find the descriptor in `family` whose model id matches `model`, and copy its
// vendor/product onto the downloader. libdivecomputer auto-detects the model
// during dc_device_open; this turns that number back into the right name.
static void resolve_model(DiveComputerDownloader *self, unsigned int model) {
  if (!self.dcContext) return;
  dc_iterator_t *it = NULL;
  if (dc_descriptor_iterator_new(&it, self.dcContext) != DC_STATUS_SUCCESS) return;
  dc_descriptor_t *item = NULL;
  NSMutableArray<NSString *> *matches = [NSMutableArray array];
  NSString *foundVendor = nil, *foundProduct = nil;
  while (dc_iterator_next(it, &item) == DC_STATUS_SUCCESS) {
    if (dc_descriptor_get_type(item) == self.openFamily
        && dc_descriptor_get_model(item) == model) {
      const char *v = dc_descriptor_get_vendor(item);
      const char *p = dc_descriptor_get_product(item);
      // Prefer a descriptor that advertises BLE (the transport we're on) — for
      // Shearwater, "Petrel" and "Petrel 2" share model id 3 but only the "2"
      // speaks BLE, so an all-matches overwrite would otherwise land on "Petrel".
      BOOL speaksBle = (dc_descriptor_get_transports(item) & DC_TRANSPORT_BLE) != 0;
      if (v && p && (!foundProduct || speaksBle)) {
        foundVendor = @(v);
        foundProduct = @(p);
      }
      if (p) [matches addObject:@(p)];
    }
    dc_descriptor_free(item);
  }
  dc_iterator_free(it);

  [self log:[NSString stringWithFormat:@"resolve_model: family=%d model=%u -> [%@]",
             (int)self.openFamily, model, [matches componentsJoinedByString:@", "]]];

  if (foundProduct) {
    self.resolvedVendor = foundVendor;
    self.resolvedProduct = foundProduct;
  }
}

static void event_cb(dc_device_t *device, dc_event_type_t event, const void *data, void *ud) {
  DiveComputerDownloader *self = (__bridge DiveComputerDownloader *)ud;
  (void)device;
  if (event == DC_EVENT_PROGRESS) {
    const dc_event_progress_t *p = data;
    [self emit:@"progress" body:@{ @"current": @(p->current), @"maximum": @(p->maximum) }];
  } else if (event == DC_EVENT_DEVINFO) {
    const dc_event_devinfo_t *d = data;
    [self log:[NSString stringWithFormat:@"devinfo: model=%u firmware=%u serial=%u",
               d->model, d->firmware, d->serial]];
    if (d->serial) self.deviceSerial = [@(d->serial) stringValue];
    resolve_model(self, d->model);
    [self emit:@"devinfo" body:@{ @"model": @(d->model), @"firmware": @(d->firmware), @"serial": @(d->serial) }];
  }
}

// The sample callback's accumulator state lives in a strong NSMutableDictionary
// "box" (keys: "rows", "events", "cur") passed as (__bridge void *). The box is a
// strong local in parse_dive that outlives dc_parser_samples_foreach, so every
// object it holds stays retained for the whole parse — unlike a C struct of
// __unsafe_unretained pointers to autoreleased objects, which can dangle mid-loop
// on a long dive and crash in objc_msgSend.
static void flush_sample(NSMutableDictionary *box) {
  NSMutableDictionary *cur = box[@"cur"];
  if (cur) {
    [(NSMutableArray *)box[@"rows"] addObject:[cur copy]];
    [box removeObjectForKey:@"cur"];
  }
}

static void sample_cb(dc_sample_type_t type, const dc_sample_value_t *value, void *ud) {
  NSMutableDictionary *box = (__bridge NSMutableDictionary *)ud;
  NSMutableDictionary *cur = box[@"cur"];
  NSMutableArray *events = box[@"events"];
  switch (type) {
    case DC_SAMPLE_TIME: {
      flush_sample(box);
      cur = [NSMutableDictionary dictionary];
      cur[@"t"] = @(value->time / 1000.0);
      box[@"cur"] = cur;
      break;
    }
    case DC_SAMPLE_DEPTH:
      if (cur) cur[@"depth"] = @(value->depth);
      break;
    case DC_SAMPLE_TEMPERATURE:
      if (cur) cur[@"tempC"] = @(value->temperature);
      break;
    case DC_SAMPLE_PRESSURE: {
      // A transmitter can sit on any tank slot (not always 0), and a dive can
      // carry several. Keep every tank's pressure keyed by index, and surface the
      // lowest-index one as `pressureBar` for the single-tank common case.
      if (!cur) break;
      unsigned int tank = value->pressure.tank;
      NSMutableDictionary *byTank = cur[@"pressuresByTank"];
      if (!byTank) { byTank = [NSMutableDictionary dictionary]; cur[@"pressuresByTank"] = byTank; }
      byTank[[@(tank) stringValue]] = @(value->pressure.value);
      NSNumber *primaryTank = cur[@"pressureTank"];
      if (!primaryTank || tank < primaryTank.unsignedIntValue) {
        cur[@"pressureBar"] = @(value->pressure.value);
        cur[@"pressureTank"] = @(tank);
      }
      break;
    }
    case DC_SAMPLE_PPO2:
      if (cur) cur[@"ppo2"] = @(value->ppo2.value);
      break;
    case DC_SAMPLE_CNS:
      if (cur) cur[@"cns"] = @(value->cns * 100.0);
      break;
    case DC_SAMPLE_DECO: {
      if (!cur) break;
      static const char *kinds[] = { "ndl", "safetystop", "decostop", "deepstop" };
      unsigned int k = value->deco.type;
      NSString *kind = k < 4 ? @(kinds[k]) : @"ndl";
      if (value->deco.type == DC_DECO_NDL) {
        cur[@"ndl"] = @(value->deco.time);
      } else {
        cur[@"deco"] = @{ @"type": kind,
                          @"depth": @(value->deco.depth),
                          @"seconds": @(value->deco.time) };
      }
      break;
    }
    case DC_SAMPLE_SETPOINT:
      if (cur) cur[@"setpoint"] = @(value->setpoint);
      break;
    case DC_SAMPLE_RBT:
      if (cur) cur[@"rbt"] = @(value->rbt);
      break;
    case DC_SAMPLE_GASMIX: {
      double t = cur ? [cur[@"t"] doubleValue] : 0;
      [events addObject:@{ @"t": @(t), @"type": @"gaschange", @"gasmix": @(value->gasmix) }];
      break;
    }
    case DC_SAMPLE_EVENT: {
      double t = cur ? [cur[@"t"] doubleValue] : 0;
      [events addObject:@{ @"t": @(t), @"eventType": @(value->event.type),
                           @"flags": @(value->event.flags), @"value": @(value->event.value) }];
      break;
    }
    default:
      break;
  }
}

static NSString *fingerprintString(const unsigned char *bytes, unsigned int len) {
  if (!bytes || len == 0) return nil;
  return [[NSData dataWithBytes:bytes length:len] base64EncodedStringWithOptions:0];
}

static id numOrNull(dc_status_t status, double v) {
  return status == DC_STATUS_SUCCESS ? @(v) : (id)[NSNull null];
}

typedef struct {
  __unsafe_unretained DiveComputerDownloader *owner;
  dc_context_t *context;
  dc_descriptor_t *descriptor;
  unsigned int number;
  __unsafe_unretained NSString *vendor;
  __unsafe_unretained NSString *product;
} dive_ctx_t;

static NSDictionary *parse_dive(dc_parser_t *parser) {
  NSMutableDictionary *d = [NSMutableDictionary dictionary];

  dc_datetime_t dt = {0};
  if (dc_parser_get_datetime(parser, &dt) == DC_STATUS_SUCCESS) {
    d[@"datetime"] = @{ @"year": @(dt.year), @"month": @(dt.month), @"day": @(dt.day),
                        @"hour": @(dt.hour), @"minute": @(dt.minute), @"second": @(dt.second),
                        @"timezone": dt.timezone == DC_TIMEZONE_NONE ? (id)[NSNull null] : @(dt.timezone) };
  } else {
    d[@"datetime"] = [NSNull null];
  }

  unsigned int divetime = 0;
  d[@"divetimeSeconds"] = numOrNull(dc_parser_get_field(parser, DC_FIELD_DIVETIME, 0, &divetime), divetime);

  double maxdepth = 0, avgdepth = 0;
  d[@"maxDepthMeters"] = numOrNull(dc_parser_get_field(parser, DC_FIELD_MAXDEPTH, 0, &maxdepth), maxdepth);
  d[@"avgDepthMeters"] = numOrNull(dc_parser_get_field(parser, DC_FIELD_AVGDEPTH, 0, &avgdepth), avgdepth);

  double ts = 0, tmin = 0, tmax = 0;
  d[@"tempSurfaceC"] = numOrNull(dc_parser_get_field(parser, DC_FIELD_TEMPERATURE_SURFACE, 0, &ts), ts);
  d[@"tempMinC"] = numOrNull(dc_parser_get_field(parser, DC_FIELD_TEMPERATURE_MINIMUM, 0, &tmin), tmin);
  d[@"tempMaxC"] = numOrNull(dc_parser_get_field(parser, DC_FIELD_TEMPERATURE_MAXIMUM, 0, &tmax), tmax);

  dc_salinity_t salinity = {0};
  if (dc_parser_get_field(parser, DC_FIELD_SALINITY, 0, &salinity) == DC_STATUS_SUCCESS) {
    d[@"salinity"] = salinity.type == DC_WATER_SALT ? @"salt" : @"fresh";
  } else {
    d[@"salinity"] = [NSNull null];
  }

  double atm = 0;
  d[@"atmosphericBar"] = numOrNull(dc_parser_get_field(parser, DC_FIELD_ATMOSPHERIC, 0, &atm), atm);

  NSMutableArray *mixes = [NSMutableArray array];
  unsigned int ngas = 0;
  if (dc_parser_get_field(parser, DC_FIELD_GASMIX_COUNT, 0, &ngas) == DC_STATUS_SUCCESS) {
    for (unsigned int i = 0; i < ngas; i++) {
      dc_gasmix_t g = {0};
      if (dc_parser_get_field(parser, DC_FIELD_GASMIX, i, &g) == DC_STATUS_SUCCESS) {
        [mixes addObject:@{ @"oxygen": @(g.oxygen), @"helium": @(g.helium),
                            @"nitrogen": @(g.nitrogen), @"usage": @(g.usage) }];
      }
    }
  }
  d[@"gasmixes"] = mixes;

  NSMutableArray *tanks = [NSMutableArray array];
  unsigned int ntank = 0;
  if (dc_parser_get_field(parser, DC_FIELD_TANK_COUNT, 0, &ntank) == DC_STATUS_SUCCESS) {
    for (unsigned int i = 0; i < ntank; i++) {
      dc_tank_t t = {0};
      if (dc_parser_get_field(parser, DC_FIELD_TANK, i, &t) == DC_STATUS_SUCCESS) {
        // t.volume is always the tank's water capacity in litres; t.type says
        // whether the diver specified it in imperial (cuft @ workpressure) or
        // metric (litres) terms — the JS side needs this to display a scuba tank
        // by the number the diver knows (an "AL80" is 80 cuft of gas, ~11.1 L of
        // water). 0 = none/unknown, 1 = imperial, 2 = metric.
        [tanks addObject:@{ @"gasmix": t.gasmix == DC_GASMIX_UNKNOWN ? (id)[NSNull null] : @(t.gasmix),
                            @"type": @(t.type),
                            @"volumeLiters": @(t.volume),
                            @"workPressureBar": @(t.workpressure),
                            @"beginPressureBar": @(t.beginpressure),
                            @"endPressureBar": @(t.endpressure),
                            @"usage": @(t.usage) }];
      }
    }
  }
  d[@"tanks"] = tanks;

  dc_divemode_t mode;
  if (dc_parser_get_field(parser, DC_FIELD_DIVEMODE, 0, &mode) == DC_STATUS_SUCCESS) {
    switch (mode) {
      case DC_DIVEMODE_FREEDIVE: d[@"diveMode"] = @"freedive"; break;
      case DC_DIVEMODE_GAUGE:    d[@"diveMode"] = @"gauge"; break;
      case DC_DIVEMODE_OC:       d[@"diveMode"] = @"oc"; break;
      case DC_DIVEMODE_CCR:      d[@"diveMode"] = @"ccr"; break;
      case DC_DIVEMODE_SCR:      d[@"diveMode"] = @"scr"; break;
      default:                   d[@"diveMode"] = [NSNull null]; break;
    }
  } else {
    d[@"diveMode"] = [NSNull null];
  }

  dc_decomodel_t deco = {0};
  if (dc_parser_get_field(parser, DC_FIELD_DECOMODEL, 0, &deco) == DC_STATUS_SUCCESS
      && deco.type != DC_DECOMODEL_NONE) {
    NSString *type = @"buhlmann";
    if (deco.type == DC_DECOMODEL_VPM) type = @"vpm";
    else if (deco.type == DC_DECOMODEL_RGBM) type = @"rgbm";
    else if (deco.type == DC_DECOMODEL_DCIEM) type = @"dciem";
    d[@"decoModel"] = @{ @"type": type,
                         @"gfLow": deco.params.gf.low ? @(deco.params.gf.low) : (id)[NSNull null],
                         @"gfHigh": deco.params.gf.high ? @(deco.params.gf.high) : (id)[NSNull null],
                         @"conservatism": @(deco.conservatism) };
  } else {
    d[@"decoModel"] = [NSNull null];
  }

  dc_location_t loc = {0};
  if (dc_parser_get_field(parser, DC_FIELD_LOCATION, 0, &loc) == DC_STATUS_SUCCESS) {
    d[@"location"] = @{ @"latitude": @(loc.latitude), @"longitude": @(loc.longitude), @"altitude": @(loc.altitude) };
  } else {
    d[@"location"] = [NSNull null];
  }

  NSMutableArray *rows = [NSMutableArray array];
  NSMutableArray *events = [NSMutableArray array];
  NSMutableDictionary *box = [NSMutableDictionary dictionary];
  box[@"rows"] = rows;
  box[@"events"] = events;
  if (dc_parser_samples_foreach(parser, sample_cb, (__bridge void *)box) == DC_STATUS_SUCCESS) {
    flush_sample(box);
  }
  d[@"samples"] = rows;
  d[@"events"] = events;

  return d;
}

static int dive_cb(const unsigned char *data, unsigned int size,
                   const unsigned char *fingerprint, unsigned int fsize, void *ud) {
  dive_ctx_t *ctx = (dive_ctx_t *)ud;
  DiveComputerDownloader *self = ctx->owner;
  ctx->number++;

  if (ctx->number == 1 && fingerprint && fsize > 0) {
    self.firstFingerprint = fingerprintString(fingerprint, fsize);
  }

  dc_parser_t *parser = NULL;
  dc_status_t rc = dc_parser_new2(&parser, ctx->context, ctx->descriptor, data, size);
  if (rc != DC_STATUS_SUCCESS || parser == NULL) {
    [self log:[NSString stringWithFormat:@"parser error for dive %u (%d)", ctx->number, rc]];
    return self->_cancelled ? 0 : 1;
  }

  NSMutableDictionary *withFp = nil;
  @autoreleasepool {
    // Bound per-dive parsing garbage; a full Shearwater log parses thousands of
    // samples per dive and this block runs on one long-lived dispatch queue task.
    NSDictionary *raw = parse_dive(parser);
    withFp = [raw mutableCopy];
  }
  dc_parser_destroy(parser);

  withFp[@"fingerprint"] = (fingerprint && fsize > 0) ? fingerprintString(fingerprint, fsize) : [NSNull null];
  withFp[@"vendor"] = self.resolvedVendor ?: ctx->vendor ?: @"";
  withFp[@"product"] = self.resolvedProduct ?: ctx->product ?: @"";
  withFp[@"serial"] = self.deviceSerial ?: [NSNull null];
  [self emit:@"dive" body:@{ @"number": @(ctx->number), @"dive": withFp }];

  return self->_cancelled ? 0 : 1;
}

// ---------------------------------------------------------------------------
// Descriptor lookup
// ---------------------------------------------------------------------------

// Oceanic/Pelagic (Aqualung, Apeks, Sherwood/Oceanic-branded) BLE names carry
// no product-name text at all — unlike Shearwater ("Peregrine TX1234") or
// Suunto ("EON Core 12345"), the whole name is just a 2-letter model code
// (the descriptor's model id, split into high/low bytes as ASCII) followed by
// digits, e.g. "FH2112" for an Aqualung i300C (model 0x4648 = 'F' 'H'). Every
// descriptor in this family shares one dc_filter_oceanic function that only
// asks "is this ANY known Oceanic-family code", not "is this THIS model" — so
// without decoding the code ourselves, the generic loop below can't tell one
// Oceanic-family model from another and would silently settle for whichever
// one happens to iterate first (see the isBest comment below for the same
// problem solved differently for Shearwater/Suunto, whose names do embed the
// product name and so can be told apart that way).
static dc_descriptor_t *find_oceanic_descriptor(dc_context_t *context, const char *bleName) {
  if (!bleName || strlen(bleName) < 3) return NULL;
  for (const char *c = bleName + 2; *c; c++) {
    if (*c < '0' || *c > '9') return NULL; // not the "<2 letters><digits>" scheme
  }
  unsigned int model = ((unsigned int)toupper((unsigned char)bleName[0]) << 8)
      | (unsigned int)toupper((unsigned char)bleName[1]);

  dc_iterator_t *iterator = NULL;
  if (dc_descriptor_iterator_new(&iterator, context) != DC_STATUS_SUCCESS) return NULL;
  dc_descriptor_t *item = NULL;
  dc_descriptor_t *found = NULL;
  while (dc_iterator_next(iterator, &item) == DC_STATUS_SUCCESS) {
    dc_family_t family = dc_descriptor_get_type(item);
    BOOL isOceanicFamily = family == DC_FAMILY_OCEANIC_ATOM2 || family == DC_FAMILY_PELAGIC_I330R;
    if (!found && isOceanicFamily && dc_descriptor_get_model(item) == model
        && (dc_descriptor_get_transports(item) & DC_TRANSPORT_BLE) != 0) {
      found = item;
    } else {
      dc_descriptor_free(item);
    }
  }
  dc_iterator_free(iterator);
  return found;
}

static dc_descriptor_t *find_descriptor(dc_context_t *context, NSString *name,
                                        NSString *vendor, NSString *product) {
  BOOL haveExactMatch = vendor.length > 0 && product.length > 0;
  if (!haveExactMatch) {
    // A remembered exact vendor+product (from a previously successful
    // download of this same device) is more authoritative than re-decoding
    // the BLE name every time, so only try the Oceanic name heuristic when
    // there isn't one yet.
    dc_descriptor_t *oceanic = find_oceanic_descriptor(context, name.length ? name.UTF8String : NULL);
    if (oceanic) return oceanic;
  }

  dc_iterator_t *iterator = NULL;
  if (dc_descriptor_iterator_new(&iterator, context) != DC_STATUS_SUCCESS) return NULL;

  dc_descriptor_t *match = NULL;   // first vendor/BLE-filter match (fallback)
  dc_descriptor_t *best = NULL;    // most specific product-name match
  size_t bestLen = 0;             // length of best's product name (longest wins)
  dc_descriptor_t *item = NULL;
  const char *wantVendor = vendor.length ? vendor.UTF8String : NULL;
  const char *wantProduct = product.length ? product.UTF8String : NULL;
  const char *bleName = name.length ? name.UTF8String : NULL;

  while (dc_iterator_next(iterator, &item) == DC_STATUS_SUCCESS) {
    BOOL isMatch = NO;
    BOOL isBest = NO;
    if (wantVendor && wantProduct) {
      const char *v = dc_descriptor_get_vendor(item);
      const char *p = dc_descriptor_get_product(item);
      isMatch = v && p && strcmp(v, wantVendor) == 0 && strcmp(p, wantProduct) == 0;
    } else if (bleName) {
      // The per-vendor BLE filters (dc_filter_shearwater, dc_filter_suunto, …)
      // match on vendor, not model: every Shearwater descriptor matches
      // "Peregrine TX" and every EON descriptor matches "EON Core", so the first
      // hit is the wrong model ("Petrel 2" / "EON Steel"). Both vendors advertise
      // the model as the BLE-name prefix, so the descriptor whose product name is
      // the longest prefix of the advertised name is the real one.
      isMatch = dc_descriptor_filter(item, DC_TRANSPORT_BLE, bleName) != 0;
      const char *p = dc_descriptor_get_product(item);
      if (isMatch && p) {
        size_t plen = strlen(p);
        if (plen > bestLen && strncasecmp(bleName, p, plen) == 0) {
          isBest = YES;
        }
      }
    }
    if (isBest) {
      if (best) dc_descriptor_free(best);
      best = item; // keep
      bestLen = strlen(dc_descriptor_get_product(item));
    } else if (isMatch && !match) {
      match = item; // keep
    } else {
      dc_descriptor_free(item);
    }
  }
  dc_iterator_free(iterator);
  if (best) {
    if (match) dc_descriptor_free(match);
    return best;
  }
  return match;
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

- (void)startDownloadWithName:(NSString *)name
                       vendor:(NSString *)vendor
                      product:(NSString *)product
                  fingerprint:(NSData *)fingerprint
                      onEvent:(void (^)(NSString *, NSDictionary<NSString *, id> *))onEvent
                   completion:(void (^)(NSDictionary *_Nullable, NSString *_Nullable))completion {
  if (self.running) {
    completion(nil, @"A download is already in progress.");
    return;
  }

  self.running = YES;
  self.onEvent = onEvent;
  self.firstFingerprint = nil;
  self.resolvedVendor = nil;
  self.resolvedProduct = nil;
  self.deviceSerial = nil;
  self.bleName = name;
  self.dcContext = NULL;
  [_rxCond lock]; _rx.length = 0; _closed = NO; _cancelled = NO; [_rxCond unlock];
  [_txCond lock]; _txPending = NO; [_txCond unlock];

  dispatch_async(dispatch_get_global_queue(QOS_CLASS_UTILITY, 0), ^{
    NSString *error = nil;
    NSDictionary *result = nil;
    NSString *matchedVendor = vendor ?: @"";
    NSString *matchedProduct = product ?: @"";

    dc_context_t *context = NULL;
    dc_descriptor_t *descriptor = NULL;
    dc_iostream_t *iostream = NULL;
    dc_device_t *device = NULL;

    if (dc_context_new(&context) != DC_STATUS_SUCCESS || context == NULL) {
      error = @"Could not create the libdivecomputer context.";
      goto done;
    }
    dc_context_set_loglevel(context, DC_LOGLEVEL_WARNING);
    dc_context_set_logfunc(context, download_log_cb, (__bridge void *)self);

    descriptor = find_descriptor(context, name, vendor, product);
    if (descriptor == NULL) {
      error = @"This dive computer is not recognised by libdivecomputer.";
      goto done;
    }

    {
      const char *mv = dc_descriptor_get_vendor(descriptor);
      const char *mp = dc_descriptor_get_product(descriptor);
      if (mv) matchedVendor = @(mv);
      if (mp) matchedProduct = @(mp);
    }
    [self log:[NSString stringWithFormat:@"opening as %@ %@ (BLE name \"%@\")",
               matchedVendor, matchedProduct, name ?: @""]];
    // event_cb (DEVINFO) uses these to turn the auto-detected model id into the
    // right vendor/product within the opened descriptor's family.
    self.dcContext = context;
    self.openFamily = dc_descriptor_get_type(descriptor);
    [self->_rxCond lock];
    self->_rx.length = 0;
    self->_preserveRxPackets = self.openFamily == DC_FAMILY_SHEARWATER_PETREL
      || self.openFamily == DC_FAMILY_SHEARWATER_PREDATOR;
    [self->_rxCond unlock];

    dc_custom_cbs_t cbs = {0};
    cbs.set_timeout = cb_set_timeout;
    cbs.set_break = cb_set_uint;
    cbs.set_dtr = cb_set_uint;
    cbs.set_rts = cb_set_uint;
    cbs.get_lines = cb_get_lines;
    cbs.get_available = cb_get_available;
    cbs.configure = cb_configure;
    cbs.poll = cb_poll;
    cbs.read = cb_read;
    cbs.write = cb_write;
    cbs.ioctl = cb_ioctl;
    cbs.flush = cb_flush;
    cbs.purge = cb_purge;
    cbs.sleep = cb_sleep;
    cbs.close = cb_close;

    if (dc_custom_open(&iostream, context, DC_TRANSPORT_BLE, &cbs, (__bridge void *)self) != DC_STATUS_SUCCESS) {
      error = @"Could not open the Bluetooth I/O stream.";
      goto done;
    }

    if (dc_device_open(&device, context, descriptor, iostream) != DC_STATUS_SUCCESS || device == NULL) {
      error = @"Could not open a session with the dive computer.";
      goto done;
    }

    dc_device_set_events(device, DC_EVENT_PROGRESS | DC_EVENT_DEVINFO, event_cb, (__bridge void *)self);
    dc_device_set_cancel(device, cancel_cb, (__bridge void *)self);

    if (fingerprint.length > 0) {
      dc_device_set_fingerprint(device, fingerprint.bytes, (unsigned int)fingerprint.length);
    }

    dive_ctx_t dctx = {0};
    dctx.owner = self;
    dctx.context = context;
    dctx.descriptor = descriptor;
    dctx.vendor = matchedVendor;
    dctx.product = matchedProduct;

    dc_status_t rc = dc_device_foreach(device, dive_cb, &dctx);
    BOOL wasCancelled = (rc == DC_STATUS_CANCELLED || self->_cancelled);
    if (rc == DC_STATUS_SUCCESS) {
      result = @{ @"fingerprint": self.firstFingerprint ?: [NSNull null],
                  @"count": @(dctx.number),
                  @"vendor": self.resolvedVendor ?: matchedVendor,
                  @"product": self.resolvedProduct ?: matchedProduct,
                  @"serial": self.deviceSerial ?: [NSNull null] };
    } else if (self.firstFingerprint) {
      // Interrupted (cancelled, or a dropped link) after at least the newest
      // dive was read. firstFingerprint is captured off that very first dive,
      // so it's a valid checkpoint no matter how far the read got — losing it
      // here forced every retry to re-read the WHOLE log from the device
      // again just to rediscover dives it already has, which on a large log
      // (400+ dives) can take over an hour of BLE transfer for nothing.
      result = @{ @"fingerprint": self.firstFingerprint,
                  @"count": @(dctx.number),
                  @"vendor": self.resolvedVendor ?: matchedVendor,
                  @"product": self.resolvedProduct ?: matchedProduct,
                  @"serial": self.deviceSerial ?: [NSNull null],
                  @"partial": @YES,
                  @"cancelled": @(wasCancelled) };
    } else if (wasCancelled) {
      error = @"Download cancelled.";
    } else {
      error = [NSString stringWithFormat:@"Download failed (%d).", rc];
    }

  done:
    self.dcContext = NULL;
    if (device) dc_device_close(device);
    if (iostream) dc_iostream_close(iostream);
    if (descriptor) dc_descriptor_free(descriptor);
    if (context) dc_context_free(context);

    [self teardown];
    self.onEvent = nil;
    self.running = NO;
    completion(result, error);
  });
}

// Deliberately NOT sharing -startDownloadWithName:…'s open sequence via a
// helper: that method is hard-won and already verified against real hardware
// (Suunto bonding, the Oceanic BLE handshake fix) — duplicating this ~30-line
// open/close sequence here is a small cost next to the risk of a refactor
// silently changing behavior in the download path with no way to test-build
// against a real device from here.
- (void)syncTimeWithName:(NSString *)name
                   vendor:(NSString *)vendor
                  product:(NSString *)product
                     year:(NSInteger)year
                    month:(NSInteger)month
                      day:(NSInteger)day
                     hour:(NSInteger)hour
                   minute:(NSInteger)minute
                   second:(NSInteger)second
                  onEvent:(void (^)(NSString *, NSDictionary<NSString *, id> *))onEvent
               completion:(void (^)(NSDictionary *_Nullable, NSString *_Nullable))completion {
  if (self.running) {
    completion(nil, @"A download is already in progress.");
    return;
  }

  self.running = YES;
  self.onEvent = onEvent;
  self.firstFingerprint = nil;
  self.resolvedVendor = nil;
  self.resolvedProduct = nil;
  self.deviceSerial = nil;
  self.bleName = name;
  self.dcContext = NULL;
  [_rxCond lock]; _rx.length = 0; _closed = NO; _cancelled = NO; [_rxCond unlock];
  [_txCond lock]; _txPending = NO; [_txCond unlock];

  dispatch_async(dispatch_get_global_queue(QOS_CLASS_UTILITY, 0), ^{
    NSString *error = nil;
    NSDictionary *result = nil;
    NSString *matchedVendor = vendor ?: @"";
    NSString *matchedProduct = product ?: @"";

    dc_context_t *context = NULL;
    dc_descriptor_t *descriptor = NULL;
    dc_iostream_t *iostream = NULL;
    dc_device_t *device = NULL;

    if (dc_context_new(&context) != DC_STATUS_SUCCESS || context == NULL) {
      error = @"Could not create the libdivecomputer context.";
      goto done;
    }
    dc_context_set_loglevel(context, DC_LOGLEVEL_WARNING);

    descriptor = find_descriptor(context, name, vendor, product);
    if (descriptor == NULL) {
      error = @"This dive computer is not recognised by libdivecomputer.";
      goto done;
    }

    {
      const char *mv = dc_descriptor_get_vendor(descriptor);
      const char *mp = dc_descriptor_get_product(descriptor);
      if (mv) matchedVendor = @(mv);
      if (mp) matchedProduct = @(mp);
    }
    [self log:[NSString stringWithFormat:@"opening as %@ %@ (BLE name \"%@\") to sync its clock",
               matchedVendor, matchedProduct, name ?: @""]];
    self.dcContext = context;
    self.openFamily = dc_descriptor_get_type(descriptor);

    dc_custom_cbs_t cbs = {0};
    cbs.set_timeout = cb_set_timeout;
    cbs.set_break = cb_set_uint;
    cbs.set_dtr = cb_set_uint;
    cbs.set_rts = cb_set_uint;
    cbs.get_lines = cb_get_lines;
    cbs.get_available = cb_get_available;
    cbs.configure = cb_configure;
    cbs.poll = cb_poll;
    cbs.read = cb_read;
    cbs.write = cb_write;
    cbs.ioctl = cb_ioctl;
    cbs.flush = cb_flush;
    cbs.purge = cb_purge;
    cbs.sleep = cb_sleep;
    cbs.close = cb_close;

    if (dc_custom_open(&iostream, context, DC_TRANSPORT_BLE, &cbs, (__bridge void *)self) != DC_STATUS_SUCCESS) {
      error = @"Could not open the Bluetooth I/O stream.";
      goto done;
    }

    if (dc_device_open(&device, context, descriptor, iostream) != DC_STATUS_SUCCESS || device == NULL) {
      error = @"Could not open a session with the dive computer.";
      goto done;
    }

    dc_device_set_events(device, DC_EVENT_PROGRESS | DC_EVENT_DEVINFO, event_cb, (__bridge void *)self);
    dc_device_set_cancel(device, cancel_cb, (__bridge void *)self);

    {
      dc_datetime_t datetime = {0};
      datetime.year = (int)year;
      datetime.month = (int)month;
      datetime.day = (int)day;
      datetime.hour = (int)hour;
      datetime.minute = (int)minute;
      datetime.second = (int)second;
      datetime.timezone = DC_TIMEZONE_NONE;

      dc_status_t rc = dc_device_timesync(device, &datetime);
      if (rc == DC_STATUS_SUCCESS) {
        result = @{ @"vendor": self.resolvedVendor ?: matchedVendor,
                    @"product": self.resolvedProduct ?: matchedProduct };
        [self log:@"clock synced"];
      } else if (rc == DC_STATUS_UNSUPPORTED) {
        error = @"This dive computer does not support setting its clock from an app.";
      } else if (rc == DC_STATUS_CANCELLED || self->_cancelled) {
        error = @"Clock sync cancelled.";
      } else {
        error = [NSString stringWithFormat:@"Clock sync failed (%d).", rc];
      }
    }

  done:
    self.dcContext = NULL;
    if (device) dc_device_close(device);
    if (iostream) dc_iostream_close(iostream);
    if (descriptor) dc_descriptor_free(descriptor);
    if (context) dc_context_free(context);

    [self teardown];
    self.onEvent = nil;
    self.running = NO;
    completion(result, error);
  });
}

// ---------------------------------------------------------------------------
// Pre-dive setup: set the breathing gas (where supported) and the clock in one
// session.
//
// Gas writing is only implemented where libdivecomputer exposes a documented
// configuration API: the Heinrichs-Weikamp OSTC family (OSTC 2/3/4/5, Plus,
// Sport), via hw_ostc3_device_config_read/write. OSTC open-circuit gases are
// config IDs 0x10–0x14, 4 bytes each: [O2 %, He %, type, change depth m],
// type 0 = disabled, 1 = first, 2 = travel, 3 = deco (layout as used by
// Subsurface's OSTC configuration code). Every other family is reported as
// "unsupported" and nothing is written — blind memory writes could leave a
// diver on the wrong gas.
//
// Safety rules for the OSTC write:
//   - read all five gases first; refuse if any slot doesn't look like a gas
//   - change only the "first" gas (or gas 1 if none is marked first)
//   - refuse if that gas has helium (a trimix the O2 analyzer can't verify)
//   - keep its type and change depth, set He to 0
//   - read it back and only report success if every byte matches
// ---------------------------------------------------------------------------

#define OSTC_GAS1_CONFIG 0x10
#define OSTC_GAS_COUNT 5
#define OSTC_GAS_FIRST 1

static NSDictionary *ostc_set_first_gas(dc_device_t *device, unsigned int oxygen) {
  unsigned char slots[OSTC_GAS_COUNT][4];
  memset(slots, 0, sizeof(slots));
  for (int i = 0; i < OSTC_GAS_COUNT; i++) {
    dc_status_t rc = hw_ostc3_device_config_read(device, OSTC_GAS1_CONFIG + i, slots[i], 4);
    if (rc != DC_STATUS_SUCCESS) {
      return @{ @"status": @"error", @"message": [NSString stringWithFormat:@"Could not read gas %d from the computer (%d). Nothing was changed.", i + 1, rc] };
    }
    if (slots[i][0] > 100 || slots[i][1] > 100 || slots[i][0] + slots[i][1] > 100 || slots[i][2] > 3) {
      return @{ @"status": @"error", @"message": @"This computer's gas settings don't match the expected format. Nothing was changed — set the gas on the computer." };
    }
  }

  int target = 0;
  for (int i = 0; i < OSTC_GAS_COUNT; i++) {
    if (slots[i][2] == OSTC_GAS_FIRST) { target = i; break; }
  }
  unsigned char *current = slots[target];
  NSDictionary *previous = @{ @"o2": @(current[0]), @"he": @(current[1]) };
  if (current[1] > 0) {
    return @{ @"status": @"error", @"slot": @(target + 1), @"previous": previous,
              @"message": [NSString stringWithFormat:@"Gas %d is a trimix (%d/%d). An O2 analyzer can't verify helium, so nothing was changed — set it on the computer.", target + 1, current[0], current[1]] };
  }

  unsigned char next[4] = { (unsigned char)oxygen, 0, current[2] == 0 ? OSTC_GAS_FIRST : current[2], current[3] };
  dc_status_t rc = hw_ostc3_device_config_write(device, OSTC_GAS1_CONFIG + target, next, 4);
  if (rc != DC_STATUS_SUCCESS) {
    return @{ @"status": @"error", @"slot": @(target + 1), @"previous": previous,
              @"message": [NSString stringWithFormat:@"Writing gas %d failed (%d). Check the gas on the computer.", target + 1, rc] };
  }

  unsigned char check[4] = { 0 };
  rc = hw_ostc3_device_config_read(device, OSTC_GAS1_CONFIG + target, check, 4);
  if (rc != DC_STATUS_SUCCESS || memcmp(check, next, 4) != 0) {
    return @{ @"status": @"error", @"slot": @(target + 1), @"previous": previous,
              @"message": [NSString stringWithFormat:@"Gas %d could not be verified after writing. Check the gas on the computer before diving.", target + 1] };
  }
  return @{ @"status": @"set", @"slot": @(target + 1), @"previous": previous, @"o2": @(oxygen) };
}


// Suunto EON Steel / EON Core / D5: set the active dive mode's gas O2 % using the
// settings exchange the Suunto app uses (0x0011 read, 0x0111 write; decoded from
// a Bluetooth capture). The computer's own settings are sent back unchanged
// except for that one byte, then read back and compared. The caller sends the
// apply/restart command (0x0002) afterwards — see -setupDeviceWithName:….
static NSDictionary *suunto_set_gas(dc_device_t *device, unsigned int oxygen, DiveComputerDownloader *self) {
  if (oxygen < 21 || oxygen > 100) {
    return @{ @"status": @"error", @"message": @"Suunto Air/Nitrox gases must be 21–100% O2. Nothing was changed." };
  }
  dc_buffer_t *buffer = dc_buffer_new(0);
  dc_status_t rc = dmz_suunto_eonsteel_settings_read(device, buffer);
  if (rc != DC_STATUS_SUCCESS) {
    dc_buffer_free(buffer);
    return @{ @"status": @"error", @"message": [NSString stringWithFormat:@"Could not read the computer's settings (%d). Nothing was changed.", rc] };
  }
  NSMutableData *settings = [NSMutableData dataWithBytes:dc_buffer_get_data(buffer) length:dc_buffer_get_size(buffer)];
  dc_buffer_free(buffer);

  dmz_suunto_gas_t gas = dmz_suunto_find_active_gas(settings.bytes, settings.length);
  if (!gas.ok) {
    return @{ @"status": @"error", @"message": [NSString stringWithFormat:@"%s Nothing was changed.", gas.error] };
  }
  NSDictionary *previous = @{ @"o2": @(gas.o2), @"he": @(gas.he) };
  NSString *mode = @(gas.mode);
  [self log:[NSString stringWithFormat:@"suunto: mode \"%@\" gas %d/%d → %u", mode, gas.o2, gas.he, oxygen]];
  if ((unsigned int)gas.o2 == oxygen) {
    return @{ @"status": @"set", @"slot": @1, @"mode": mode, @"previous": previous, @"o2": @(oxygen), @"unchanged": @YES };
  }

  ((unsigned char *)settings.mutableBytes)[gas.o2_offset] = (unsigned char)oxygen;
  const unsigned char *sbem = (const unsigned char *)settings.bytes + DMZ_SUUNTO_PREFIX_SIZE;
  unsigned int sbemSize = (unsigned int)(settings.length - DMZ_SUUNTO_PREFIX_SIZE);
  rc = dmz_suunto_eonsteel_settings_write(device, sbem, sbemSize);
  if (rc != DC_STATUS_SUCCESS) {
    return @{ @"status": @"error", @"mode": mode, @"previous": previous,
              @"message": [NSString stringWithFormat:@"Writing the gas failed (%d). Check the gas on the computer.", rc] };
  }

  // Read back before applying. If the computer only reports the new value after
  // its restart, say so instead of claiming it's verified.
  dc_buffer_t *check = dc_buffer_new(0);
  rc = dmz_suunto_eonsteel_settings_read(device, check);
  dmz_suunto_gas_t after = rc == DC_STATUS_SUCCESS
    ? dmz_suunto_find_active_gas(dc_buffer_get_data(check), dc_buffer_get_size(check))
    : (dmz_suunto_gas_t){ 0 };
  BOOL identical = rc == DC_STATUS_SUCCESS && dc_buffer_get_size(check) == settings.length
    && memcmp(dc_buffer_get_data(check), settings.bytes, settings.length) == 0;
  dc_buffer_free(check);
  [self log:[NSString stringWithFormat:@"suunto: read-back rc %d o2 %d identical %d", rc, after.ok ? after.o2 : -1, identical]];

  if (after.ok && (unsigned int)after.o2 == oxygen) {
    return @{ @"status": @"set", @"slot": @1, @"mode": mode, @"previous": previous, @"o2": @(oxygen), @"identical": @(identical) };
  }
  if (after.ok && after.o2 == gas.o2) {
    return @{ @"status": @"pending", @"mode": mode, @"previous": previous, @"o2": @(oxygen),
              @"message": [NSString stringWithFormat:@"Sent %u%%. The computer applies it when it restarts — check it shows %u%% before diving.", oxygen, oxygen] };
  }
  return @{ @"status": @"error", @"mode": mode, @"previous": previous,
            @"message": @"The gas could not be verified after writing. Check the gas on the computer before diving." };
}


- (void)setupDeviceWithName:(NSString *)name
                     vendor:(NSString *)vendor
                    product:(NSString *)product
                     oxygen:(NSInteger)oxygen
                   setClock:(BOOL)setClock
                       year:(NSInteger)year
                      month:(NSInteger)month
                        day:(NSInteger)day
                       hour:(NSInteger)hour
                     minute:(NSInteger)minute
                     second:(NSInteger)second
                    onEvent:(void (^)(NSString *, NSDictionary<NSString *, id> *))onEvent
                 completion:(void (^)(NSDictionary *_Nullable, NSString *_Nullable))completion {
  if (self.running) {
    completion(nil, @"A download is already in progress.");
    return;
  }

  self.running = YES;
  self.onEvent = onEvent;
  self.firstFingerprint = nil;
  self.resolvedVendor = nil;
  self.resolvedProduct = nil;
  self.deviceSerial = nil;
  self.bleName = name;
  self.dcContext = NULL;
  [_rxCond lock]; _rx.length = 0; _closed = NO; _cancelled = NO; [_rxCond unlock];
  [_txCond lock]; _txPending = NO; [_txCond unlock];

  dispatch_async(dispatch_get_global_queue(QOS_CLASS_UTILITY, 0), ^{
    NSString *error = nil;
    NSDictionary *result = nil;
    NSString *matchedVendor = vendor ?: @"";
    NSString *matchedProduct = product ?: @"";

    dc_context_t *context = NULL;
    dc_descriptor_t *descriptor = NULL;
    dc_iostream_t *iostream = NULL;
    dc_device_t *device = NULL;

    if (dc_context_new(&context) != DC_STATUS_SUCCESS || context == NULL) {
      error = @"Could not create the libdivecomputer context.";
      goto done;
    }
    dc_context_set_loglevel(context, DC_LOGLEVEL_WARNING);

    descriptor = find_descriptor(context, name, vendor, product);
    if (descriptor == NULL) {
      error = @"This dive computer is not recognised by libdivecomputer.";
      goto done;
    }
    {
      const char *mv = dc_descriptor_get_vendor(descriptor);
      const char *mp = dc_descriptor_get_product(descriptor);
      if (mv) matchedVendor = @(mv);
      if (mp) matchedProduct = @(mp);
    }
    // Forward libdivecomputer's own errors (e.g. a Shearwater NAK's reason code)
    // to the transfer log — that's how a refused gas write explains itself.
    dc_context_set_logfunc(context, download_log_cb, (__bridge void *)self);
    [self log:[NSString stringWithFormat:@"opening as %@ %@ (BLE name \"%@\") for pre-dive setup",
               matchedVendor, matchedProduct, name ?: @""]];
    self.dcContext = context;
    self.openFamily = dc_descriptor_get_type(descriptor);
    [self->_rxCond lock];
    self->_preserveRxPackets = self.openFamily == DC_FAMILY_SHEARWATER_PETREL
      || self.openFamily == DC_FAMILY_SHEARWATER_PREDATOR;
    [self->_rxCond unlock];

    dc_custom_cbs_t cbs = {0};
    cbs.set_timeout = cb_set_timeout;
    cbs.set_break = cb_set_uint;
    cbs.set_dtr = cb_set_uint;
    cbs.set_rts = cb_set_uint;
    cbs.get_lines = cb_get_lines;
    cbs.get_available = cb_get_available;
    cbs.configure = cb_configure;
    cbs.poll = cb_poll;
    cbs.read = cb_read;
    cbs.write = cb_write;
    cbs.ioctl = cb_ioctl;
    cbs.flush = cb_flush;
    cbs.purge = cb_purge;
    cbs.sleep = cb_sleep;
    cbs.close = cb_close;

    if (dc_custom_open(&iostream, context, DC_TRANSPORT_BLE, &cbs, (__bridge void *)self) != DC_STATUS_SUCCESS) {
      error = @"Could not open the Bluetooth I/O stream.";
      goto done;
    }
    if (dc_device_open(&device, context, descriptor, iostream) != DC_STATUS_SUCCESS || device == NULL) {
      error = @"Could not open a session with the dive computer.";
      goto done;
    }
    dc_device_set_events(device, DC_EVENT_PROGRESS | DC_EVENT_DEVINFO, event_cb, (__bridge void *)self);
    dc_device_set_cancel(device, cancel_cb, (__bridge void *)self);

    {
      // Gas first — it matters most, and a clock failure must not skip it.
      NSDictionary *gas;
      if (oxygen < 5 || oxygen > 100) {
        gas = @{ @"status": @"skipped" };
      } else if (self.openFamily == DC_FAMILY_HW_OSTC3) {
        gas = ostc_set_first_gas(device, (unsigned int)oxygen);
        [self log:[NSString stringWithFormat:@"gas: %@ %@", gas[@"status"], gas[@"message"] ?: @""]];
      } else if (self.openFamily == DC_FAMILY_SUUNTO_EONSTEEL) {
        gas = suunto_set_gas(device, (unsigned int)oxygen, self);
        [self log:[NSString stringWithFormat:@"gas: %@ %@", gas[@"status"], gas[@"message"] ?: @""]];
      } else {
        gas = @{ @"status": @"unsupported" };
      }

      NSDictionary *clock;
      if (!setClock) {
        clock = @{ @"status": @"skipped" };
      } else {
        dc_datetime_t datetime = {0};
        datetime.year = (int)year;
        datetime.month = (int)month;
        datetime.day = (int)day;
        datetime.hour = (int)hour;
        datetime.minute = (int)minute;
        datetime.second = (int)second;
        datetime.timezone = DC_TIMEZONE_NONE;
        dc_status_t rc = dc_device_timesync(device, &datetime);
        if (rc == DC_STATUS_SUCCESS) clock = @{ @"status": @"set" };
        else if (rc == DC_STATUS_UNSUPPORTED) clock = @{ @"status": @"unsupported" };
        else clock = @{ @"status": @"error", @"message": [NSString stringWithFormat:@"Clock sync failed (%d).", rc] };
        [self log:[NSString stringWithFormat:@"clock: %@", clock[@"status"]]];
      }

      // A Suunto only takes new settings after an apply/restart command. Send it
      // last (after the clock): the computer drops the connection as it restarts,
      // so a missing reply here is expected and not an error.
      BOOL restarted = NO;
      if (self.openFamily == DC_FAMILY_SUUNTO_EONSTEEL && gas[@"unchanged"] == nil
          && ([gas[@"status"] isEqual:@"set"] || [gas[@"status"] isEqual:@"pending"])) {
        dc_status_t arc = dmz_suunto_eonsteel_apply(device);
        restarted = YES;
        [self log:[NSString stringWithFormat:@"suunto: apply sent (%d) — computer restarts", arc]];
      }

      result = @{ @"vendor": self.resolvedVendor ?: matchedVendor,
                  @"product": self.resolvedProduct ?: matchedProduct,
                  @"gas": gas,
                  @"clock": clock,
                  @"restarting": @(restarted) };
    }

  done:
    self.dcContext = NULL;
    if (device) dc_device_close(device);
    if (iostream) dc_iostream_close(iostream);
    if (descriptor) dc_descriptor_free(descriptor);
    if (context) dc_context_free(context);

    [self teardown];
    self.onEvent = nil;
    self.running = NO;
    completion(result, error);
  });
}

// ---------------------------------------------------------------------------
// Suunto EON Steel / EON Core / D5: READ-ONLY filesystem explorer.
//
// Walks the computer's small filesystem and reads every non-dive file, so we
// can find where the Suunto app stores dive modes and gases (the first step to
// sending an analyzed mix). Dive logs (0:/dives) are only counted, not read.
// Nothing is written to the device.
// ---------------------------------------------------------------------------

#define EXPLORE_MAX_DEPTH 5
#define EXPLORE_MAX_ENTRIES 400
#define EXPLORE_MAX_FILES 80
#define EXPLORE_MAX_TOTAL_BYTES (3 * 1024 * 1024)

typedef struct {
  __unsafe_unretained NSMutableArray *names;
  __unsafe_unretained NSMutableArray *isDir;
} explore_dir_ctx;

static void explore_dirent_cb(int is_directory, const char *name, void *userdata) {
  explore_dir_ctx *ctx = (explore_dir_ctx *)userdata;
  if (!name || !name[0] || strcmp(name, ".") == 0 || strcmp(name, "..") == 0) return;
  [ctx->names addObject:@(name)];
  [ctx->isDir addObject:@(is_directory ? YES : NO)];
}

static NSString *explore_join(NSString *dir, NSString *name) {
  return [dir hasSuffix:@"/"] ? [dir stringByAppendingString:name] : [NSString stringWithFormat:@"%@/%@", dir, name];
}

- (void)exploreSuuntoWithName:(NSString *)name
                       vendor:(NSString *)vendor
                      product:(NSString *)product
                      onEvent:(void (^)(NSString *, NSDictionary<NSString *, id> *))onEvent
                   completion:(void (^)(NSDictionary *_Nullable, NSString *_Nullable))completion {
  if (self.running) {
    completion(nil, @"A download is already in progress.");
    return;
  }

  self.running = YES;
  self.onEvent = onEvent;
  self.firstFingerprint = nil;
  self.resolvedVendor = nil;
  self.resolvedProduct = nil;
  self.deviceSerial = nil;
  self.bleName = name;
  self.dcContext = NULL;
  [_rxCond lock]; _rx.length = 0; _closed = NO; _cancelled = NO; [_rxCond unlock];
  [_txCond lock]; _txPending = NO; [_txCond unlock];

  dispatch_async(dispatch_get_global_queue(QOS_CLASS_UTILITY, 0), ^{
    NSString *error = nil;
    NSDictionary *result = nil;
    NSString *matchedVendor = vendor ?: @"";
    NSString *matchedProduct = product ?: @"";

    dc_context_t *context = NULL;
    dc_descriptor_t *descriptor = NULL;
    dc_iostream_t *iostream = NULL;
    dc_device_t *device = NULL;

    if (dc_context_new(&context) != DC_STATUS_SUCCESS || context == NULL) {
      error = @"Could not create the libdivecomputer context.";
      goto done;
    }
    dc_context_set_loglevel(context, DC_LOGLEVEL_WARNING);

    descriptor = find_descriptor(context, name, vendor, product);
    if (descriptor == NULL) {
      error = @"This dive computer is not recognised by libdivecomputer.";
      goto done;
    }
    if (dc_descriptor_get_type(descriptor) != DC_FAMILY_SUUNTO_EONSTEEL) {
      error = @"File exploring is only for the Suunto EON Steel, EON Core and D5.";
      goto done;
    }
    {
      const char *mv = dc_descriptor_get_vendor(descriptor);
      const char *mp = dc_descriptor_get_product(descriptor);
      if (mv) matchedVendor = @(mv);
      if (mp) matchedProduct = @(mp);
    }
    [self log:[NSString stringWithFormat:@"opening as %@ %@ (BLE name \"%@\") to explore files (read-only)",
               matchedVendor, matchedProduct, name ?: @""]];
    self.dcContext = context;
    self.openFamily = dc_descriptor_get_type(descriptor);

    dc_custom_cbs_t cbs = {0};
    cbs.set_timeout = cb_set_timeout;
    cbs.set_break = cb_set_uint;
    cbs.set_dtr = cb_set_uint;
    cbs.set_rts = cb_set_uint;
    cbs.get_lines = cb_get_lines;
    cbs.get_available = cb_get_available;
    cbs.configure = cb_configure;
    cbs.poll = cb_poll;
    cbs.read = cb_read;
    cbs.write = cb_write;
    cbs.ioctl = cb_ioctl;
    cbs.flush = cb_flush;
    cbs.purge = cb_purge;
    cbs.sleep = cb_sleep;
    cbs.close = cb_close;

    if (dc_custom_open(&iostream, context, DC_TRANSPORT_BLE, &cbs, (__bridge void *)self) != DC_STATUS_SUCCESS) {
      error = @"Could not open the Bluetooth I/O stream.";
      goto done;
    }
    if (dc_device_open(&device, context, descriptor, iostream) != DC_STATUS_SUCCESS || device == NULL) {
      error = @"Could not open a session with the dive computer.";
      goto done;
    }
    dc_device_set_cancel(device, cancel_cb, (__bridge void *)self);

    {
      NSMutableArray *entries = [NSMutableArray new];   // { path, dir }
      NSMutableArray *files = [NSMutableArray new];     // { path, size, base64 } or { path, error }
      NSMutableArray *problems = [NSMutableArray new];
      NSMutableArray *queue = [NSMutableArray new];     // { path, depth }
      NSMutableArray *toRead = [NSMutableArray new];
      NSUInteger totalBytes = 0;

      // The dive directory is "0:/dives"; try the drive root with and without a slash.
      NSString *root = nil;
      for (NSString *candidate in @[@"0:/", @"0:"]) {
        NSMutableArray *names = [NSMutableArray new], *isDir = [NSMutableArray new];
        explore_dir_ctx ctx = { names, isDir };
        dc_status_t rc = dmz_suunto_eonsteel_list_dir(device, candidate.UTF8String, explore_dirent_cb, &ctx);
        if (rc == DC_STATUS_SUCCESS) { root = candidate; break; }
        [problems addObject:[NSString stringWithFormat:@"list %@ failed (%d)", candidate, rc]];
      }
      if (root == nil) {
        error = @"Could not list the computer's files.";
        goto done;
      }
      [queue addObject:@{ @"path": root, @"depth": @0 }];

      while (queue.count > 0 && entries.count < EXPLORE_MAX_ENTRIES && !self->_cancelled) {
        NSDictionary *item = queue.firstObject;
        [queue removeObjectAtIndex:0];
        NSString *dir = item[@"path"];
        NSInteger depth = [item[@"depth"] integerValue];

        NSMutableArray *names = [NSMutableArray new], *isDir = [NSMutableArray new];
        explore_dir_ctx ctx = { names, isDir };
        dc_status_t rc = dmz_suunto_eonsteel_list_dir(device, dir.UTF8String, explore_dirent_cb, &ctx);
        if (rc != DC_STATUS_SUCCESS) {
          [problems addObject:[NSString stringWithFormat:@"list %@ failed (%d)", dir, rc]];
          continue;
        }
        BOOL isDiveDir = [dir.lowercaseString hasSuffix:@"/dives"];
        if (isDiveDir) {
          [entries addObject:@{ @"path": dir, @"dir": @YES, @"children": @(names.count), @"note": @"dive logs — counted, not read" }];
          continue;
        }
        for (NSUInteger i = 0; i < names.count; i++) {
          NSString *child = explore_join(dir, names[i]);
          BOOL childIsDir = [isDir[i] boolValue];
          [entries addObject:@{ @"path": child, @"dir": @(childIsDir) }];
          if (childIsDir && depth + 1 < EXPLORE_MAX_DEPTH) [queue addObject:@{ @"path": child, @"depth": @(depth + 1) }];
          else if (!childIsDir) [toRead addObject:child];
        }
        [self log:[NSString stringWithFormat:@"listed %@ (%lu entries)", dir, (unsigned long)names.count]];
      }

      // Settings first (dive modes live in 0:/SETTINGS/MODEn.SET); skip UI
      // assets — bitmaps, fonts (large, they time out), languages, layouts.
      NSSet *skipExt = [NSSet setWithArray:@[@"PXB", @"NGF", @"LNG", @"SUX"]];
      NSMutableArray *ordered = [NSMutableArray new];
      for (NSString *path in toRead) {
        if ([skipExt containsObject:path.pathExtension.uppercaseString]) continue;
        if ([path.uppercaseString containsString:@"/SETTINGS/"] || [path.uppercaseString containsString:@"/BTSETT/"]) [ordered insertObject:path atIndex:0];
        else [ordered addObject:path];
      }
      [self log:[NSString stringWithFormat:@"reading %lu files (UI assets skipped)", (unsigned long)ordered.count]];

      for (NSString *path in ordered) {
        if (files.count >= EXPLORE_MAX_FILES || totalBytes >= EXPLORE_MAX_TOTAL_BYTES || self->_cancelled) break;
        dc_buffer_t *buffer = dc_buffer_new(0);
        dc_status_t rc = dmz_suunto_eonsteel_read_file(device, path.UTF8String, buffer);
        if (rc == DC_STATUS_SUCCESS) {
          NSData *data = [NSData dataWithBytes:dc_buffer_get_data(buffer) length:dc_buffer_get_size(buffer)];
          totalBytes += data.length;
          [files addObject:@{ @"path": path, @"size": @(data.length), @"base64": [data base64EncodedStringWithOptions:0] }];
          [self log:[NSString stringWithFormat:@"read %@ (%lu bytes)", path, (unsigned long)data.length]];
        } else {
          [files addObject:@{ @"path": path, @"error": @(rc) }];
        }
        dc_buffer_free(buffer);
      }

      result = @{ @"vendor": self.resolvedVendor ?: matchedVendor,
                  @"product": self.resolvedProduct ?: matchedProduct,
                  @"root": root,
                  @"entries": entries,
                  @"files": files,
                  @"problems": problems,
                  @"truncated": @(entries.count >= EXPLORE_MAX_ENTRIES || files.count >= EXPLORE_MAX_FILES || totalBytes >= EXPLORE_MAX_TOTAL_BYTES) };
    }

  done:
    self.dcContext = NULL;
    if (device) dc_device_close(device);
    if (iostream) dc_iostream_close(iostream);
    if (descriptor) dc_descriptor_free(descriptor);
    if (context) dc_context_free(context);

    [self teardown];
    self.onEvent = nil;
    self.running = NO;
    completion(result, error);
  });
}

// ---------------------------------------------------------------------------
// Shearwater Petrel family (Perdix, Petrel, Teric, Peregrine, Nerd, Tern):
// READ-ONLY settings scan. Reads every data identifier in `ranges` with RDBI
// (0x22) and returns the ones the computer answers. Scanning before and after
// changing a gas on the computer itself shows which ID holds the gas list.
// Nothing is written to the device.
// ---------------------------------------------------------------------------

#define SCAN_MAX_IDS 8192
#define SCAN_MAX_SECONDS 600
#define SCAN_MAX_SILENT 6

- (void)scanShearwaterWithName:(NSString *)name
                        vendor:(NSString *)vendor
                       product:(NSString *)product
                        ranges:(NSArray<NSArray<NSNumber *> *> *)ranges
                       onEvent:(void (^)(NSString *, NSDictionary<NSString *, id> *))onEvent
                    completion:(void (^)(NSDictionary *_Nullable, NSString *_Nullable))completion {
  if (self.running) {
    completion(nil, @"A download is already in progress.");
    return;
  }

  self.running = YES;
  self.onEvent = onEvent;
  self.firstFingerprint = nil;
  self.resolvedVendor = nil;
  self.resolvedProduct = nil;
  self.deviceSerial = nil;
  self.bleName = name;
  self.dcContext = NULL;
  [_rxCond lock]; _rx.length = 0; _closed = NO; _cancelled = NO; [_rxCond unlock];
  [_txCond lock]; _txPending = NO; [_txCond unlock];

  dispatch_async(dispatch_get_global_queue(QOS_CLASS_UTILITY, 0), ^{
    NSString *error = nil;
    NSDictionary *result = nil;
    NSString *matchedVendor = vendor ?: @"";
    NSString *matchedProduct = product ?: @"";

    dc_context_t *context = NULL;
    dc_descriptor_t *descriptor = NULL;
    dc_iostream_t *iostream = NULL;
    dc_device_t *device = NULL;

    if (dc_context_new(&context) != DC_STATUS_SUCCESS || context == NULL) {
      error = @"Could not create the libdivecomputer context.";
      goto done;
    }
    dc_context_set_loglevel(context, DC_LOGLEVEL_NONE); // every refused ID would log an error otherwise

    descriptor = find_descriptor(context, name, vendor, product);
    if (descriptor == NULL) {
      error = @"This dive computer is not recognised by libdivecomputer.";
      goto done;
    }
    if (dc_descriptor_get_type(descriptor) != DC_FAMILY_SHEARWATER_PETREL) {
      error = @"Settings scanning is for Shearwater Perdix, Petrel, Teric, Peregrine, Nerd and Tern.";
      goto done;
    }
    {
      const char *mv = dc_descriptor_get_vendor(descriptor);
      const char *mp = dc_descriptor_get_product(descriptor);
      if (mv) matchedVendor = @(mv);
      if (mp) matchedProduct = @(mp);
    }
    [self log:[NSString stringWithFormat:@"opening as %@ %@ (BLE name \"%@\") to scan settings (read-only)",
               matchedVendor, matchedProduct, name ?: @""]];
    self.dcContext = context;
    self.openFamily = dc_descriptor_get_type(descriptor);
    [self->_rxCond lock];
    self->_preserveRxPackets = YES; // Shearwater: one BLE notification per packet
    [self->_rxCond unlock];

    dc_custom_cbs_t cbs = {0};
    cbs.set_timeout = cb_set_timeout;
    cbs.set_break = cb_set_uint;
    cbs.set_dtr = cb_set_uint;
    cbs.set_rts = cb_set_uint;
    cbs.get_lines = cb_get_lines;
    cbs.get_available = cb_get_available;
    cbs.configure = cb_configure;
    cbs.poll = cb_poll;
    cbs.read = cb_read;
    cbs.write = cb_write;
    cbs.ioctl = cb_ioctl;
    cbs.flush = cb_flush;
    cbs.purge = cb_purge;
    cbs.sleep = cb_sleep;
    cbs.close = cb_close;

    if (dc_custom_open(&iostream, context, DC_TRANSPORT_BLE, &cbs, (__bridge void *)self) != DC_STATUS_SUCCESS) {
      error = @"Could not open the Bluetooth I/O stream.";
      goto done;
    }
    if (dc_device_open(&device, context, descriptor, iostream) != DC_STATUS_SUCCESS || device == NULL) {
      error = @"Could not open a session with the dive computer.";
      goto done;
    }
    dc_device_set_cancel(device, cancel_cb, (__bridge void *)self);

    {
      NSMutableDictionary *values = [NSMutableDictionary new]; // "0x8010" -> hex
      NSMutableArray *failures = [NSMutableArray new];          // { id, rc } for non-NAK errors
      NSUInteger refused = 0, scanned = 0, total = 0, silentRun = 0;
      BOOL stopped = NO;
      NSDate *start = [NSDate date];

      for (NSArray<NSNumber *> *range in ranges) {
        if (range.count == 2 && range[1].unsignedIntValue >= range[0].unsignedIntValue)
          total += range[1].unsignedIntValue - range[0].unsignedIntValue + 1;
      }
      if (total == 0 || total > SCAN_MAX_IDS) {
        error = @"Invalid scan ranges.";
        goto done;
      }

      for (NSArray<NSNumber *> *range in ranges) {
        if (range.count != 2) continue;
        for (unsigned int ident = range[0].unsignedIntValue; ident <= range[1].unsignedIntValue && !stopped; ident++) {
          if (self->_cancelled || -[start timeIntervalSinceNow] > SCAN_MAX_SECONDS) { stopped = YES; break; }
          unsigned char data[DMZ_SHEARWATER_MAX_VALUE];
          unsigned int actual = 0;
          dc_status_t rc = dmz_shearwater_rdbi(device, ident, data, sizeof(data), &actual);
          scanned++;
          NSString *key = [NSString stringWithFormat:@"0x%04X", ident];
          if (rc == DC_STATUS_SUCCESS) {
            NSMutableString *hex = [NSMutableString stringWithCapacity:actual * 2];
            for (unsigned int k = 0; k < actual; k++) [hex appendFormat:@"%02x", data[k]];
            values[key] = hex;
            silentRun = 0;
          } else if (rc == DC_STATUS_UNSUPPORTED) {
            refused++;
            silentRun = 0;
          } else {
            [failures addObject:@{ @"id": key, @"rc": @(rc) }];
            // Several timeouts in a row: the link is gone — stop rather than wait out every ID.
            if (++silentRun >= SCAN_MAX_SILENT) { stopped = YES; [self log:@"scan: computer stopped answering"]; }
          }
          if (scanned % 64 == 0 || scanned == total) {
            [self log:[NSString stringWithFormat:@"scan: %lu/%lu IDs · %lu answered", (unsigned long)scanned, (unsigned long)total, (unsigned long)values.count]];
            [self emit:@"progress" body:@{ @"current": @(scanned), @"maximum": @(total) }];
          }
        }
        if (stopped) break;
      }

      result = @{ @"vendor": self.resolvedVendor ?: matchedVendor,
                  @"product": self.resolvedProduct ?: matchedProduct,
                  @"values": values,
                  @"scanned": @(scanned),
                  @"total": @(total),
                  @"refused": @(refused),
                  @"failures": failures,
                  @"complete": @(!stopped && scanned == total),
                  @"seconds": @(-[start timeIntervalSinceNow]) };
    }

  done:
    self.dcContext = NULL;
    if (device) dc_device_close(device);
    if (iostream) dc_iostream_close(iostream);
    if (descriptor) dc_descriptor_free(descriptor);
    if (context) dc_context_free(context);

    [self teardown];
    self.onEvent = nil;
    self.running = NO;
    completion(result, error);
  });
}

@end
