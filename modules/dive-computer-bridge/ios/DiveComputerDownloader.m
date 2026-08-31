#import "DiveComputerDownloader.h"

#import <libdivecomputer/context.h>
#import <libdivecomputer/descriptor.h>
#import <libdivecomputer/iterator.h>
#import <libdivecomputer/custom.h>
#import <libdivecomputer/device.h>
#import <libdivecomputer/parser.h>
#import <libdivecomputer/datetime.h>

// ---------------------------------------------------------------------------
// Session state
// ---------------------------------------------------------------------------

@interface DiveComputerDownloader () {
  NSCondition *_rxCond;      // guards _rx / _closed / _cancelled
  NSMutableData *_rx;        // bytes received from BLE, not yet consumed
  NSCondition *_txCond;      // guards _txPending
  BOOL _txPending;           // a @"write" is awaiting -notifyWriteComplete
  BOOL _closed;
  BOOL _cancelled;
  int _timeoutMs;
}
@property (atomic, assign, getter=isRunning) BOOL running;
@property (nonatomic, copy, nullable) void (^onEvent)(NSString *, NSDictionary<NSString *, id> *);
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

// ---------------------------------------------------------------------------
// JS -> download-thread plumbing
// ---------------------------------------------------------------------------

- (void)provideBytes:(NSData *)data {
  if (data.length == 0) return;
  [_rxCond lock];
  [_rx appendData:data];
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
  (void)ud; (void)request; (void)data; (void)size; return DC_STATUS_UNSUPPORTED;
}

// ---------------------------------------------------------------------------
// libdivecomputer event / cancel / dive callbacks
// ---------------------------------------------------------------------------

static int cancel_cb(void *ud) {
  DiveComputerDownloader *self = (__bridge DiveComputerDownloader *)ud;
  return self->_cancelled ? 1 : 0;
}

static void event_cb(dc_device_t *device, dc_event_type_t event, const void *data, void *ud) {
  DiveComputerDownloader *self = (__bridge DiveComputerDownloader *)ud;
  (void)device;
  if (event == DC_EVENT_PROGRESS) {
    const dc_event_progress_t *p = data;
    [self emit:@"progress" body:@{ @"current": @(p->current), @"maximum": @(p->maximum) }];
  } else if (event == DC_EVENT_DEVINFO) {
    const dc_event_devinfo_t *d = data;
    [self emit:@"devinfo" body:@{ @"model": @(d->model), @"firmware": @(d->firmware), @"serial": @(d->serial) }];
  }
}

typedef struct {
  __unsafe_unretained DiveComputerDownloader *owner;
  __unsafe_unretained NSMutableArray *rows;   // completed sample rows
  __unsafe_unretained NSMutableDictionary *cur; // sample row being built
  __unsafe_unretained NSMutableArray *events;
  BOOL started;
} sample_ctx_t;

static void flush_sample(sample_ctx_t *ctx) {
  if (ctx->cur) [ctx->rows addObject:[ctx->cur copy]];
  ctx->cur = nil;
}

static void sample_cb(dc_sample_type_t type, const dc_sample_value_t *value, void *ud) {
  sample_ctx_t *ctx = (sample_ctx_t *)ud;
  switch (type) {
    case DC_SAMPLE_TIME: {
      flush_sample(ctx);
      ctx->cur = [NSMutableDictionary dictionary];
      ctx->cur[@"t"] = @(value->time / 1000.0);
      ctx->started = YES;
      break;
    }
    case DC_SAMPLE_DEPTH:
      if (ctx->cur) ctx->cur[@"depth"] = @(value->depth);
      break;
    case DC_SAMPLE_TEMPERATURE:
      if (ctx->cur) ctx->cur[@"tempC"] = @(value->temperature);
      break;
    case DC_SAMPLE_PRESSURE:
      if (ctx->cur && value->pressure.tank == 0) ctx->cur[@"pressureBar"] = @(value->pressure.value);
      break;
    case DC_SAMPLE_PPO2:
      if (ctx->cur) ctx->cur[@"ppo2"] = @(value->ppo2.value);
      break;
    case DC_SAMPLE_CNS:
      if (ctx->cur) ctx->cur[@"cns"] = @(value->cns * 100.0);
      break;
    case DC_SAMPLE_DECO: {
      if (!ctx->cur) break;
      static const char *kinds[] = { "ndl", "safetystop", "decostop", "deepstop" };
      unsigned int k = value->deco.type;
      NSString *kind = k < 4 ? @(kinds[k]) : @"ndl";
      if (value->deco.type == DC_DECO_NDL) {
        ctx->cur[@"ndl"] = @(value->deco.time);
      } else {
        ctx->cur[@"deco"] = @{ @"type": kind,
                               @"depth": @(value->deco.depth),
                               @"seconds": @(value->deco.time) };
      }
      break;
    }
    case DC_SAMPLE_GASMIX: {
      double t = ctx->cur ? [ctx->cur[@"t"] doubleValue] : 0;
      [ctx->events addObject:@{ @"t": @(t), @"type": @"gaschange", @"gasmix": @(value->gasmix) }];
      break;
    }
    case DC_SAMPLE_EVENT: {
      double t = ctx->cur ? [ctx->cur[@"t"] doubleValue] : 0;
      [ctx->events addObject:@{ @"t": @(t), @"eventType": @(value->event.type),
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
  __unsafe_unretained NSString *firstFingerprint;
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
        [tanks addObject:@{ @"gasmix": t.gasmix == DC_GASMIX_UNKNOWN ? (id)[NSNull null] : @(t.gasmix),
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
  sample_ctx_t sctx = {0};
  sctx.rows = rows;
  sctx.events = events;
  if (dc_parser_samples_foreach(parser, sample_cb, &sctx) == DC_STATUS_SUCCESS) {
    flush_sample(&sctx);
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
    ctx->firstFingerprint = fingerprintString(fingerprint, fsize);
  }

  dc_parser_t *parser = NULL;
  dc_status_t rc = dc_parser_new2(&parser, ctx->context, ctx->descriptor, data, size);
  if (rc != DC_STATUS_SUCCESS || parser == NULL) {
    [self log:[NSString stringWithFormat:@"parser error for dive %u (%d)", ctx->number, rc]];
    return self->_cancelled ? 0 : 1;
  }

  NSDictionary *raw = parse_dive(parser);
  dc_parser_destroy(parser);

  NSMutableDictionary *withFp = [raw mutableCopy];
  withFp[@"fingerprint"] = (fingerprint && fsize > 0) ? fingerprintString(fingerprint, fsize) : [NSNull null];
  withFp[@"vendor"] = ctx->vendor ?: @"";
  withFp[@"product"] = ctx->product ?: @"";
  [self emit:@"dive" body:@{ @"number": @(ctx->number), @"dive": withFp }];

  return self->_cancelled ? 0 : 1;
}

// ---------------------------------------------------------------------------
// Descriptor lookup
// ---------------------------------------------------------------------------

static dc_descriptor_t *find_descriptor(dc_context_t *context, NSString *name,
                                        NSString *vendor, NSString *product) {
  dc_iterator_t *iterator = NULL;
  if (dc_descriptor_iterator_new(&iterator, context) != DC_STATUS_SUCCESS) return NULL;

  dc_descriptor_t *match = NULL;
  dc_descriptor_t *item = NULL;
  const char *wantVendor = vendor.length ? vendor.UTF8String : NULL;
  const char *wantProduct = product.length ? product.UTF8String : NULL;
  const char *bleName = name.length ? name.UTF8String : NULL;

  while (dc_iterator_next(iterator, &item) == DC_STATUS_SUCCESS) {
    BOOL isMatch = NO;
    if (wantVendor && wantProduct) {
      const char *v = dc_descriptor_get_vendor(item);
      const char *p = dc_descriptor_get_product(item);
      isMatch = v && p && strcmp(v, wantVendor) == 0 && strcmp(p, wantProduct) == 0;
    } else if (bleName) {
      isMatch = dc_descriptor_filter(item, DC_TRANSPORT_BLE, bleName) != 0;
    }
    if (isMatch && !match) {
      match = item; // keep, don't free
    } else {
      dc_descriptor_free(item);
    }
  }
  dc_iterator_free(iterator);
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
    if (rc == DC_STATUS_CANCELLED || self->_cancelled) {
      error = @"Download cancelled.";
    } else if (rc != DC_STATUS_SUCCESS) {
      error = [NSString stringWithFormat:@"Download failed (%d).", rc];
    } else {
      result = @{ @"fingerprint": dctx.firstFingerprint ?: [NSNull null],
                  @"count": @(dctx.number),
                  @"vendor": matchedVendor,
                  @"product": matchedProduct };
    }

  done:
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
