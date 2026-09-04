import { StyleSheet, Text, View } from 'react-native';

import { INSTRUMENT_DISPLAY_LAYOUTS, selectInstrumentDisplayLayout } from './displayLayout';

const LCD = Object.freeze({
  background: '#071716',
  danger: '#FF8C7E',
  dim: '#6B8A82',
  line: 'rgba(174, 235, 218, 0.18)',
  text: '#C9F5E8',
  warning: '#FFD278',
});

function formatDepth(field) {
  if (!field || field.value == null) return '--';
  return `${field.value.toFixed(field.precision)} ${field.unit}`;
}

function formatTemperature(field) {
  if (!field || field.value == null) return '--';
  return `${Math.round(field.value)}°${field.unit}`;
}

function Label({ children, scale, style }) {
  return <Text allowFontScaling={false} style={[styles.label, { fontSize: 7.5 * scale, lineHeight: 9 * scale }, style]}>{children}</Text>;
}

function Numeric({ children, scale, size = 30, style }) {
  return <Text adjustsFontSizeToFit allowFontScaling={false} minimumFontScale={0.72} numberOfLines={1} style={[styles.numeric, { fontSize: size * scale, lineHeight: size * 1.02 * scale }, style]}>{children}</Text>;
}

function Metric({ highlighted = false, label, scale, value, valueStyle }) {
  return (
    <View style={[styles.metric, highlighted && styles.focusedField]}>
      <Label scale={scale}>{label}</Label>
      <Numeric scale={scale} size={17} style={valueStyle}>{value}</Numeric>
    </View>
  );
}

function DisplayHeader({ display, focused = false, scale }) {
  return (
    <View style={[styles.header, focused && styles.focusedField, { height: 24 * scale, paddingHorizontal: 8 * scale }]}>
      <Text allowFontScaling={false} numberOfLines={1} style={[styles.headerText, { fontSize: 7.5 * scale }]}>{display.labels.status.toUpperCase()}</Text>
      <View style={styles.headerRight}>
        {display.warningIndicator.latched ? <Text allowFontScaling={false} style={[styles.warningIcon, { fontSize: 10 * scale }]}>!</Text> : null}
        {display.timer.visible ? (
          <Text allowFontScaling={false} style={[styles.headerText, display.timer.running && styles.timerRunning, { fontSize: 7.5 * scale }]}>T {display.timer.formatted}</Text>
        ) : null}
        <Text allowFontScaling={false} style={[styles.headerText, { fontSize: 7.5 * scale }]}>{display.configuredGas.label.toUpperCase()}</Text>
      </View>
    </View>
  );
}

function AscentRate({ ascentRate, focused = false, scale }) {
  const activeSegments = Math.ceil(ascentRate.fraction * 6);
  return (
    <View style={[styles.ascent, focused && styles.focusedField, { gap: 2 * scale }]}>
      <Label scale={scale}>ASCENT</Label>
      <View accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: Math.round(ascentRate.fraction * 100) }} style={[styles.ascentSegments, { gap: 2 * scale }]}>
        {[0, 1, 2, 3, 4, 5].map((segment) => (
          <View
            key={segment}
            style={[
              styles.ascentSegment,
              {
                backgroundColor: segment < activeSegments ? (ascentRate.warning ? LCD.danger : LCD.text) : 'rgba(174,235,218,.12)',
                height: (5 + segment * 1.4) * scale,
                width: 8 * scale,
              },
            ]}
          />
        ))}
      </View>
    </View>
  );
}

// ---- Surface-mode screens (real i300C surface OS, manual pages 16-30). ----

function HomeScreen({ display, scale }) {
  const home = display.home;
  return (
    <View style={[styles.surfaceScreen, { padding: 8 * scale }]}>
      <View style={styles.metricRow}>
        <Metric label="TIME" scale={scale} value={home.time.formatted} />
        <Metric label="WATER" scale={scale} value={formatTemperature(home.temperature)} />
        <Metric label="GAS" scale={scale} value={home.fo2Label} />
      </View>
      <View style={[styles.rule, { marginVertical: 7 * scale }]} />
      {home.hasEverDived ? (
        <>
          <View style={styles.metricRow}>
            <Metric label="SURF INTERVAL" scale={scale} value={home.surfaceInterval} />
            <Metric label="N2 LOAD" scale={scale} value={`${Math.round(home.tissueLoadingPercent)}%`} />
          </View>
          <View style={[styles.metricRow, { marginTop: 10 * scale }]}>
            <Metric label="TIME TO FLY" scale={scale} value={home.desaturated ? '0:00' : home.timeToFly} />
            <Metric label="STATUS" scale={scale} value={home.desaturated ? 'DESAT' : 'NO FLY'} />
          </View>
        </>
      ) : (
        <View style={[styles.centerScreen, { paddingVertical: 6 * scale }]}>
          <Text allowFontScaling={false} style={[styles.leadInTitle, { fontSize: 17 * scale }]}>READY TO DIVE</Text>
          <Label scale={scale}>SURFACE</Label>
        </View>
      )}
    </View>
  );
}

function AltScreen({ display, scale, screenId }) {
  if (screenId === 'surface.alt1') {
    const entry = display.alt1;
    if (!entry) {
      return (
        <View style={[styles.centerScreen, { padding: 8 * scale }]}>
          <Label scale={scale}>ALT 1 · LAST DIVE</Label>
          <Text allowFontScaling={false} style={[styles.emptyText, { fontSize: 11 * scale }]}>NO PREVIOUS DIVES</Text>
        </View>
      );
    }
    return (
      <View style={[styles.surfaceScreen, { padding: 8 * scale }]}>
        <Label scale={scale}>ALT 1 · LAST DIVE</Label>
        <Numeric scale={scale} size={34}>{formatDepth(entry.maximumDepth)}</Numeric>
        <View style={[styles.metricRow, { marginTop: 8 * scale }]}>
          <Metric label="DIVE TIME" scale={scale} value={entry.diveTime} />
          <Metric label="GAS" scale={scale} value={entry.fo2Label} />
        </View>
      </View>
    );
  }
  if (screenId === 'surface.alt2') {
    return (
      <View style={[styles.surfaceScreen, { padding: 8 * scale }]}>
        <Label scale={scale}>ALT 2</Label>
        <View style={styles.metricRow}>
          <Metric label="ELEVATION" scale={scale} value={display.alt2.elevationMeters > 0 ? `${display.alt2.elevationMeters} m` : 'SEA LEVEL'} />
          <Metric label="TIME" scale={scale} value={display.alt2.time.formatted} />
        </View>
        <View style={[styles.metricRow, { marginTop: 10 * scale }]}>
          <Metric label="TEMP" scale={scale} value={formatTemperature(display.alt2.temperature)} />
        </View>
      </View>
    );
  }
  const alt3 = display.alt3;
  if (!alt3) {
    return (
      <View style={[styles.centerScreen, { padding: 8 * scale }]}>
        <Label scale={scale}>ALT 3</Label>
        <Text allowFontScaling={false} style={[styles.emptyText, { fontSize: 11 * scale }]}>NO NITROX DIVES YET</Text>
      </View>
    );
  }
  return (
    <View style={[styles.surfaceScreen, { padding: 8 * scale }]}>
      <Label scale={scale}>ALT 3 · OXYGEN STATUS</Label>
      <View style={styles.metricRow}>
        <Metric label="GAS" scale={scale} value={alt3.fo2Label} />
        <Metric label="O2 SATURATION" scale={scale} value={`${alt3.cnsPercent.toFixed(0)}%`} />
      </View>
      <View style={[styles.metricRow, { marginTop: 10 * scale }]}>
        <Metric label="PO2 ALARM" scale={scale} value={alt3.po2Alarm.toFixed(1)} />
        <Metric label="MOD" scale={scale} value={alt3.mod ? formatDepth(alt3.mod) : '--'} />
      </View>
    </View>
  );
}

function FlySatScreen({ display, scale }) {
  const noDives = display.flySat.fly == null;
  return (
    <View style={[styles.surfaceScreen, { padding: 8 * scale }]}>
      <Label scale={scale}>FLY / SAT</Label>
      {noDives ? (
        <Text allowFontScaling={false} style={[styles.emptyText, { fontSize: 11 * scale }]}>NO PREVIOUS DIVES</Text>
      ) : (
        <View style={styles.metricRow}>
          <Metric label="TIME TO FLY" scale={scale} value={display.flySat.fly} />
          <Metric label="SAT (DESAT)" scale={scale} value={display.flySat.sat} />
        </View>
      )}
    </View>
  );
}

function LeadInScreen({ display }) {
  return (
    <View style={styles.centerScreen}>
      <Text allowFontScaling={false} style={styles.leadInTitle}>{display.leadIn.title}</Text>
      {display.leadIn.totalDives != null ? <Text allowFontScaling={false} style={styles.leadInCount}>{display.leadIn.totalDives} DIVES</Text> : null}
    </View>
  );
}

function FieldStepperScreen({ display }) {
  return (
    <View style={[styles.centerScreen, display.fieldStepper.isEditing && styles.focusedScreen]}>
      <Text allowFontScaling={false} style={styles.leadInTitle}>{display.fieldStepper.label}</Text>
      <Text allowFontScaling={false} style={styles.fieldValue}>{display.fieldStepper.value}</Text>
    </View>
  );
}

function PlannerScreen({ display }) {
  if (!display.plan) return null;
  return (
    <View style={styles.centerScreen}>
      <Text allowFontScaling={false} style={styles.leadInTitle}>PLANNED DEPTH</Text>
      <Text allowFontScaling={false} style={styles.fieldValue}>{formatDepth(display.plan.depth)}</Text>
      <View style={styles.metricRow}>
        <Text allowFontScaling={false} style={styles.leadInCount}>{display.plan.limitLabel}: {display.plan.minutes}{display.plan.available ? ' MIN' : ''}</Text>
      </View>
      <Text allowFontScaling={false} style={styles.planMeta}>{display.plan.fo2Percent}% O2 · PO2 {display.plan.po2Alarm.toFixed(1)} · MOD {formatDepth(display.plan.mod)}</Text>
    </View>
  );
}

function LogPreviewScreen({ display }) {
  const entry = display.logbook.currentDisplay;
  return (
    <View style={styles.centerScreen}>
      <Text allowFontScaling={false} style={styles.leadInTitle}>LOG PREVIEW</Text>
      {!entry ? (
        <Text allowFontScaling={false} style={styles.leadInCount}>NONE YET · 0 DIVE</Text>
      ) : (
        <>
          <Text allowFontScaling={false} style={styles.fieldValue}>DIVE {display.logbook.selectedIndex + 1}/{display.logbook.count}</Text>
          <Text allowFontScaling={false} style={styles.leadInCount}>{formatDepth(entry.maximumDepth)} · {entry.diveTime} · {entry.fo2Label}</Text>
        </>
      )}
    </View>
  );
}

function LogDataScreen({ display, scale, screenId }) {
  const entry = display.logbook.currentDisplay;
  if (!entry) return null;
  if (screenId === 'log.data1') {
    return (
      <View style={[styles.surfaceScreen, { padding: 8 * scale }]}>
        <Label scale={scale}>LOG DATA 1</Label>
        <View style={styles.metricRow}>
          <Metric label="MAX DEPTH" scale={scale} value={formatDepth(entry.maximumDepth)} />
          <Metric label="DIVE TIME" scale={scale} value={entry.diveTime} />
        </View>
        <View style={[styles.metricRow, { marginTop: 10 * scale }]}>
          <Metric label="MAX ASCENT" scale={scale} value={`${entry.maxAscentRateMpm.toFixed(1)} M/MIN`} />
          <Metric label="DEEP STOP" scale={scale} value={entry.deepStopTriggered ? 'YES' : '--'} />
        </View>
      </View>
    );
  }
  if (screenId === 'log.data2') {
    return (
      <View style={[styles.surfaceScreen, { padding: 8 * scale }]}>
        <Label scale={scale}>LOG DATA 2</Label>
        <View style={styles.metricRow}>
          <Metric label="SURFACE INTERVAL" scale={scale} value={entry.preDiveSurfaceInterval} />
          <Metric label="MAX N2 LOAD" scale={scale} value={`${entry.tissueLoadingPercent.toFixed(0)}%`} />
        </View>
      </View>
    );
  }
  if (screenId === 'log.data3') {
    return (
      <View style={[styles.surfaceScreen, { padding: 8 * scale }]}>
        <Label scale={scale}>LOG DATA 3</Label>
        <View style={styles.metricRow}>
          <Metric label="AVG DEPTH" scale={scale} value={formatDepth(entry.averageDepth)} />
          <Metric label="HIGHEST PO2" scale={scale} value={entry.highestPpO2.toFixed(2)} />
        </View>
      </View>
    );
  }
  return (
    <View style={[styles.surfaceScreen, { padding: 8 * scale }]}>
      <Label scale={scale}>LOG DATA 4</Label>
      <View style={styles.metricRow}>
        <Metric label="O2 SAT AT END" scale={scale} value={`${entry.endOfDiveCnsPercent.toFixed(0)}%`} />
        <Metric label="GAS" scale={scale} value={entry.fo2Label} />
      </View>
    </View>
  );
}

function TotalHoursScreen({ display }) {
  return (
    <View style={styles.centerScreen}>
      <Text allowFontScaling={false} style={styles.leadInTitle}>TOTAL HOURS</Text>
      <Text allowFontScaling={false} style={styles.fieldValue}>{display.history.totalHours}</Text>
      <Text allowFontScaling={false} style={styles.leadInCount}>{display.history.totalDives} DIVES LOGGED</Text>
    </View>
  );
}

function ExtremesScreen({ display, scale }) {
  const extremes = display.history.extremes;
  return (
    <View style={[styles.surfaceScreen, { padding: 8 * scale }]}>
      <Label scale={scale}>EXTREMES</Label>
      <View style={styles.metricRow}>
        <Metric label="DEEPEST DIVE" scale={scale} value={formatDepth(extremes.deepestDive)} />
        <Metric label="LONGEST DIVE" scale={scale} value={extremes.longestDive} />
      </View>
      <View style={[styles.metricRow, { marginTop: 10 * scale }]}>
        <Metric label="HIGHEST ELEVATION" scale={scale} value={`${extremes.highestElevation.value.toFixed(0)} ${extremes.highestElevation.unit}`} />
        <Metric label="LOWEST TEMP" scale={scale} value={formatTemperature(extremes.lowestTemperature)} />
      </View>
    </View>
  );
}

function SerialNumberScreen({ display }) {
  return (
    <View style={styles.centerScreen}>
      <Text allowFontScaling={false} style={styles.leadInTitle}>SERIAL NUMBER</Text>
      <Text allowFontScaling={false} style={styles.fieldValue}>{display.serialNumber.serial}</Text>
      <Text allowFontScaling={false} style={styles.leadInCount}>REV {display.serialNumber.revision}</Text>
    </View>
  );
}

// ---- Underwater dive-mode screens - unchanged, out of scope for this pass. ----

function WarningScreen({ display, focused = false, scale }) {
  const warningColor = display.warning?.severity === 'danger' ? LCD.danger : LCD.warning;
  return (
    <View style={[styles.warningScreen, focused && styles.focusedScreen, display.warning?.flashing && styles.warningFlash, { padding: 8 * scale }]}>
      <Text adjustsFontSizeToFit allowFontScaling={false} minimumFontScale={0.62} numberOfLines={2} style={[styles.warningTitle, { color: warningColor, fontSize: 25 * scale, lineHeight: 27 * scale }]}>{display.warning?.label || 'WARNING'}</Text>
      <View style={[styles.metricRow, { marginTop: 8 * scale }]}>
        <Metric label="DEPTH" scale={scale} value={formatDepth(display.primary.depth)} />
        <Metric label="ASCENT" scale={scale} value={`${display.ascentRate.metersPerMinute.toFixed(1)} M/MIN`} valueStyle={{ color: warningColor }} />
      </View>
      <Text allowFontScaling={false} style={[styles.ackText, { color: warningColor, fontSize: 7.5 * scale }]}>PRESS RIGHT TO ACKNOWLEDGE</Text>
    </View>
  );
}

const STOP_TYPE_LABELS = Object.freeze({
  decompression: 'DECOMPRESSION STOP',
  deepStop: 'DEEP STOP',
  safetyStop: 'SAFETY STOP',
});

function StopScreen({ display, focused = false, scale }) {
  const isDeco = display.stop.type === 'decompression';
  const timeValue = display.stop.remaining.formatted || `${display.stop.remaining.value} MIN`;
  return (
    <View style={[styles.stopScreen, focused && styles.focusedScreen, { padding: 8 * scale }]}>
      <Label scale={scale}>{STOP_TYPE_LABELS[display.stop.type]}</Label>
      <View style={[styles.stopPrimary, { marginTop: 4 * scale }]}>
        <View style={styles.stopTime}>
          <Label scale={scale}>TIME</Label>
          <Numeric scale={scale} size={43} style={{ color: isDeco ? LCD.warning : LCD.text }}>{timeValue}</Numeric>
        </View>
        <Metric label={isDeco ? 'STOP DEPTH' : 'HOLD DEPTH'} scale={scale} value={formatDepth(display.stop.depth)} />
      </View>
      <View style={[styles.metricRow, { marginTop: 4 * scale }]}>
        <Metric label="CURRENT DEPTH" scale={scale} value={formatDepth(display.primary.depth)} />
        {isDeco && display.stop.ceiling ? <Metric label="CEILING" scale={scale} value={formatDepth(display.stop.ceiling)} /> : <Metric label="STATUS" scale={scale} value={display.stop.status.toUpperCase()} />}
      </View>
      <AscentRate ascentRate={display.ascentRate} scale={scale} />
    </View>
  );
}

function DiveAltScreen({ display, focused = false, scale, screenId }) {
  if (screenId === 'dive.alt2') {
    return (
      <View style={[styles.surfaceScreen, focused && styles.focusedScreen, { padding: 8 * scale }]}>
        <Label scale={scale}>ALT 2</Label>
        <View style={styles.metricRow}>
          <Metric label="TIME" scale={scale} value={display.diveAlt2.time.formatted} />
          <Metric label="TEMP" scale={scale} value={formatTemperature(display.diveAlt2.temperature)} />
        </View>
      </View>
    );
  }
  const alt3 = display.diveAlt3;
  return (
    <View style={[styles.surfaceScreen, focused && styles.focusedScreen, { padding: 8 * scale }]}>
      <Label scale={scale}>ALT 3 · OXYGEN STATUS</Label>
      <View style={styles.metricRow}>
        <Metric label="GAS" scale={scale} value={alt3.fo2Label} />
        <Metric label="O2 SATURATION" scale={scale} value={`${alt3.cnsPercent.value.toFixed(0)}%`} />
      </View>
      <View style={[styles.metricRow, { marginTop: 10 * scale }]}>
        <Metric label="PO2" scale={scale} value={alt3.ppO2.value.toFixed(2)} />
      </View>
    </View>
  );
}

function DeepStopPreviewScreen({ display, focused = false, scale }) {
  const preview = display.deepStopPreview;
  return (
    <View style={[styles.surfaceScreen, focused && styles.focusedScreen, { padding: 8 * scale }]}>
      <Label scale={scale}>DEEP STOP PENDING</Label>
      <View style={styles.metricRow}>
        <Metric label="STOP DEPTH" scale={scale} value={formatDepth(preview.depth)} />
        <Metric label="STOP TIME" scale={scale} value={preview.pending.formatted} />
      </View>
    </View>
  );
}

function PrimaryDiveScreen({ display, focusAreas, scale }) {
  const ndl = display.primary.ndl.value >= 99 ? '99+' : `${Math.max(0, Math.floor(display.primary.ndl.value))}`;
  return (
    <View style={[styles.primaryScreen, { padding: 7 * scale }]}>
      <View style={styles.primaryRow}>
        <View style={[styles.depthField, focusAreas.includes('depth') && styles.focusedField]}>
          <Label scale={scale}>DEPTH</Label>
          <Numeric scale={scale} size={47}>{formatDepth(display.primary.depth)}</Numeric>
        </View>
        <View style={[styles.ndlField, focusAreas.includes('ndl') && styles.focusedField]}>
          <Label scale={scale}>NDL</Label>
          <Numeric scale={scale} size={42}>{ndl}</Numeric>
          <Label scale={scale}>MIN</Label>
        </View>
      </View>
      <View style={[styles.rule, { marginVertical: 3 * scale }]} />
      <View style={styles.diveFooter}>
        <Metric highlighted={focusAreas.includes('time')} label="DIVE TIME" scale={scale} value={display.primary.diveTime.formatted} />
        <Metric label="MAX" scale={scale} value={formatDepth(display.primary.maxDepth)} />
        <AscentRate ascentRate={display.ascentRate} focused={focusAreas.includes('ascent')} scale={scale} />
      </View>
    </View>
  );
}

function DisplayContent({ display, focusAreas, scale }) {
  const layout = selectInstrumentDisplayLayout(display);
  if (layout === INSTRUMENT_DISPLAY_LAYOUTS.WARNING) return <WarningScreen display={display} focused={focusAreas.includes('warning')} scale={scale} />;
  if (layout === INSTRUMENT_DISPLAY_LAYOUTS.STOP) return <StopScreen display={display} focused={focusAreas.includes('stop')} scale={scale} />;
  if (layout === INSTRUMENT_DISPLAY_LAYOUTS.DEEP_STOP_PREVIEW) return <DeepStopPreviewScreen display={display} focused={focusAreas.includes('display')} scale={scale} />;
  if (layout === INSTRUMENT_DISPLAY_LAYOUTS.DIVE_ALT) return <DiveAltScreen display={display} focused={focusAreas.includes('display')} scale={scale} screenId={display.screenId} />;
  if (layout === INSTRUMENT_DISPLAY_LAYOUTS.PRIMARY_DIVE) return <PrimaryDiveScreen display={display} focusAreas={focusAreas} scale={scale} />;
  if (layout === INSTRUMENT_DISPLAY_LAYOUTS.ALT) return <AltScreen display={display} scale={scale} screenId={display.screenId} />;
  if (layout === INSTRUMENT_DISPLAY_LAYOUTS.FLY_SAT) return <FlySatScreen display={display} scale={scale} />;
  if (layout === INSTRUMENT_DISPLAY_LAYOUTS.LEAD_IN) return <LeadInScreen display={display} />;
  if (layout === INSTRUMENT_DISPLAY_LAYOUTS.FIELD_STEPPER) return <FieldStepperScreen display={display} />;
  if (layout === INSTRUMENT_DISPLAY_LAYOUTS.PLANNER) return <PlannerScreen display={display} />;
  if (layout === INSTRUMENT_DISPLAY_LAYOUTS.LOG_PREVIEW) return <LogPreviewScreen display={display} />;
  if (layout === INSTRUMENT_DISPLAY_LAYOUTS.LOG_DATA) return <LogDataScreen display={display} scale={scale} screenId={display.screenId} />;
  if (layout === INSTRUMENT_DISPLAY_LAYOUTS.TOTAL_HOURS) return <TotalHoursScreen display={display} />;
  if (layout === INSTRUMENT_DISPLAY_LAYOUTS.EXTREMES) return <ExtremesScreen display={display} scale={scale} />;
  if (layout === INSTRUMENT_DISPLAY_LAYOUTS.SERIAL_NUMBER) return <SerialNumberScreen display={display} />;
  return <HomeScreen display={display} scale={scale} />;
}

export default function InstrumentDisplay({ display, focusAreas = [], height, holdProgress = 0, scale, width }) {
  const warningBorder = display.warningIndicator.active
    ? display.warning?.severity === 'danger' ? LCD.danger : LCD.warning
    : '#263E3A';
  return (
    <View
      accessibilityLabel={`${display.labels.status} dive computer display`}
      style={[styles.glass, { borderRadius: 5 * scale, borderWidth: 3 * scale, height, padding: 4 * scale, width }]}
    >
      <View style={[styles.lcd, { borderColor: warningBorder, borderRadius: 2 * scale, borderWidth: Math.max(1, scale) }]}>
        <DisplayHeader display={display} focused={focusAreas.includes('status')} scale={scale} />
        <View style={styles.content}><DisplayContent display={display} focusAreas={focusAreas} scale={scale} /></View>
      </View>
      {holdProgress > 0 ? (
        <View accessible accessibilityLabel="Hold both buttons to return to the home screen" pointerEvents="none" style={styles.holdOverlay}>
          <Text allowFontScaling={false} style={[styles.holdTitle, { fontSize: 11 * scale }]}>RETURN HOME</Text>
          <View style={[styles.holdTrack, { height: 6 * scale, width: width * 0.62 }]}>
            <View style={[styles.holdFill, { width: `${Math.min(100, Math.round(holdProgress * 100))}%` }]} />
          </View>
          <Text allowFontScaling={false} style={[styles.holdHint, { fontSize: 7.5 * scale }]}>KEEP HOLDING · RELEASE TO CANCEL</Text>
        </View>
      ) : null}
      <View pointerEvents="none" style={[styles.glassHighlight, { borderRadius: 2 * scale }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  ackText: { fontWeight: '900', letterSpacing: 0.8, marginTop: 'auto', textAlign: 'center' },
  ascent: { alignItems: 'flex-end' },
  ascentSegment: { borderRadius: 1 },
  ascentSegments: { alignItems: 'flex-end', flexDirection: 'row' },
  centerScreen: { alignItems: 'center', flex: 1, justifyContent: 'center' },
  content: { flex: 1 },
  depthField: { flex: 1.45, justifyContent: 'center' },
  diveFooter: { alignItems: 'flex-end', flexDirection: 'row', gap: 8, justifyContent: 'space-between' },
  emptyText: { color: LCD.dim, fontWeight: '800', textAlign: 'center' },
  fieldValue: { color: LCD.text, fontSize: 22, fontWeight: '900', marginTop: 6, textAlign: 'center' },
  focusedField: { backgroundColor: 'rgba(112,221,246,.12)', borderColor: LCD.text, borderWidth: 1 },
  focusedScreen: { backgroundColor: 'rgba(112,221,246,.09)', borderColor: LCD.text, borderWidth: 1 },
  glass: { backgroundColor: '#020807', borderColor: '#0B1012', overflow: 'hidden' },
  glassHighlight: { borderColor: 'rgba(255,255,255,.06)', borderLeftWidth: 1, borderTopWidth: 1, bottom: 4, left: 4, position: 'absolute', right: 4, top: 4 },
  header: { alignItems: 'center', borderBottomColor: LCD.line, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', justifyContent: 'space-between' },
  holdOverlay: { alignItems: 'center', backgroundColor: 'rgba(3,8,7,0.92)', bottom: 0, gap: 8, justifyContent: 'center', left: 0, position: 'absolute', right: 0, top: 0 },
  holdTitle: { color: LCD.text, fontWeight: '900', letterSpacing: 1.5 },
  holdTrack: { backgroundColor: 'rgba(174,235,218,0.16)', borderRadius: 3, overflow: 'hidden' },
  holdFill: { backgroundColor: LCD.text, borderRadius: 3, height: '100%' },
  holdHint: { color: LCD.dim, fontWeight: '800', letterSpacing: 0.6 },
  headerRight: { alignItems: 'center', flexDirection: 'row', gap: 6 },
  headerText: { color: LCD.dim, fontWeight: '900', letterSpacing: 0.8 },
  label: { color: LCD.dim, fontWeight: '900', letterSpacing: 0.7 },
  lcd: { backgroundColor: LCD.background, flex: 1, overflow: 'hidden' },
  leadInCount: { color: LCD.dim, fontSize: 10, fontWeight: '800', letterSpacing: 0.6, marginTop: 6, textAlign: 'center' },
  leadInTitle: { color: LCD.text, fontSize: 15, fontWeight: '900', letterSpacing: 1.2, textAlign: 'center' },
  metric: { flex: 1 },
  metricRow: { flexDirection: 'row', gap: 10 },
  ndlField: { alignItems: 'flex-end', borderLeftColor: LCD.line, borderLeftWidth: StyleSheet.hairlineWidth, flex: 0.75, justifyContent: 'center', paddingLeft: 8 },
  numeric: { color: LCD.text, fontVariant: ['tabular-nums'], fontWeight: '800', letterSpacing: -0.8 },
  planMeta: { color: LCD.dim, fontSize: 7.5, fontVariant: ['tabular-nums'], fontWeight: '800', marginTop: 7, textAlign: 'center' },
  primaryRow: { flex: 1, flexDirection: 'row' },
  primaryScreen: { flex: 1 },
  rule: { backgroundColor: LCD.line, height: StyleSheet.hairlineWidth },
  stopPrimary: { alignItems: 'flex-end', flexDirection: 'row', gap: 10 },
  stopScreen: { flex: 1 },
  stopTime: { flex: 1.5 },
  surfaceScreen: { flex: 1, justifyContent: 'center' },
  timerRunning: { color: LCD.text },
  warningFlash: { backgroundColor: 'rgba(109, 27, 20, 0.28)' },
  warningIcon: { color: LCD.warning, fontWeight: '900' },
  warningScreen: { flex: 1 },
  warningTitle: { fontWeight: '900', letterSpacing: -0.2, textAlign: 'center' },
});
