// The live analysis: waits for tank gas, watches it settle, then locks the result
// so the number survives the sensor drifting back to room air.
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Card, PrimaryButton, SecondaryButton, Stat } from '../../components/Ui';
import { colors, spacing } from '../../theme';
import { PHASE, phaseMessage } from './analysis';
import { formatDepth, modMeters } from './model';
import { mixName } from './nitroxLog';
import { Field, TextLink } from './parts';

export default function AnalysisCard({ analyzer, capture, depthUnit }) {
  const { analysis, result } = capture;
  const [manualOpen, setManualOpen] = useState(false);
  const [manualValue, setManualValue] = useState('');
  const ready = analyzer.status === 'connected' && analyzer.calibration;

  // Start watching as soon as the analyzer is usable.
  useEffect(() => {
    if (ready && !analysis) capture.start();
  }, [ready, analysis, capture]);

  const submitManual = () => {
    if (capture.enterManually(manualValue)) { setManualOpen(false); setManualValue(''); }
  };

  if (result) {
    return (
      <Card style={styles.lockedCard}>
        <View style={styles.headRow}>
          <Text style={[styles.label, { color: colors.good }]}>🔒 RESULT LOCKED</Text>
          <Text style={styles.method}>{result.method === 'manual' ? 'Entered manually' : result.method === 'held' ? 'Held by hand' : 'Auto-detected'}</Text>
        </View>
        <Text accessibilityLabel={`Analyzed ${result.o2.toFixed(1)} percent oxygen`} style={styles.result}>
          {result.o2.toFixed(1)}<Text style={styles.unit}>%</Text>
        </Text>
        <Text style={styles.mix}>{mixName(result.o2)}</Text>
        <View style={styles.statRow}>
          <Stat style={styles.flex} label="MOD @ 1.4" value={formatDepth(modMeters(result.o2, 1.4), depthUnit)} />
          <Stat style={styles.flex} label="MOD @ 1.6" value={formatDepth(modMeters(result.o2, 1.6), depthUnit)} />
        </View>
        <Text style={styles.message}>{result.method === 'manual' ? 'Saved as entered.' : phaseMessage(analysis)}</Text>
        {result.method !== 'manual' && analyzer.o2 != null ? <Text style={styles.faint}>Sensor now reads {analyzer.o2.toFixed(1)}%</Text> : null}
        <SecondaryButton style={styles.gapTop} label="Re-analyze" onPress={() => { capture.reset(); }} />
      </Card>
    );
  }

  return (
    <Card>
      <Text style={styles.label}>ANALYSIS</Text>
      {ready && analysis ? (
        <>
          <Text style={[styles.live, { color: analysis.phase === PHASE.settling ? colors.text : colors.muted }]}>
            {analyzer.o2 != null ? analyzer.o2.toFixed(1) : '—'}<Text style={styles.unit}>%</Text>
          </Text>
          <Text style={[styles.phase, { color: analysis.phase === PHASE.settling ? colors.warning : colors.cyan }]}>
            {analysis.phase === PHASE.settling ? 'SETTLING ON TANK GAS…' : 'WAITING FOR TANK GAS'}
          </Text>
          <Text style={styles.message}>{phaseMessage(analysis)}</Text>
          <SecondaryButton
            style={styles.gapTop}
            label={analyzer.stable ? 'Hold this reading' : 'Hold this reading (waiting for stable)'}
            onPress={analyzer.stable ? capture.hold : undefined}
          />
          <Text style={styles.faint}>Use Hold for air, or a mix too close to air to detect automatically.</Text>
        </>
      ) : (
        <Text style={styles.message}>
          {analyzer.status === 'connected' ? 'Calibrate the analyzer in air (above) to start.' : 'Connect and calibrate the analyzer above to analyze.'}
        </Text>
      )}
      <View style={styles.gapTop}>
        {manualOpen ? (
          <View>
            <Field label="O₂ % from another analyzer" keyboardType="decimal-pad" value={manualValue} onChangeText={setManualValue} placeholder="32.0" autoFocus />
            <View style={styles.headRow}>
              <PrimaryButton style={styles.flex} label="Use this result" onPress={submitManual} disabled={!manualValue} />
              <SecondaryButton label="Cancel" onPress={() => setManualOpen(false)} />
            </View>
          </View>
        ) : (
          <TextLink label="Enter a result from another analyzer" onPress={() => setManualOpen(true)} />
        )}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  gapTop: { marginTop: spacing.md },
  lockedCard: { borderColor: 'rgba(112,226,163,0.45)' },
  headRow: { alignItems: 'center', flexDirection: 'row', gap: 10, justifyContent: 'space-between' },
  label: { color: colors.muted, fontSize: 11, fontWeight: '800', letterSpacing: 1, marginBottom: 8 },
  method: { color: colors.faint, fontSize: 12, marginBottom: 8 },
  result: { color: colors.text, fontSize: 76, fontVariant: ['tabular-nums'], fontWeight: '900', letterSpacing: -2, lineHeight: 84 },
  live: { fontSize: 56, fontVariant: ['tabular-nums'], fontWeight: '900', letterSpacing: -1.5, lineHeight: 64 },
  unit: { fontSize: 30, fontWeight: '800' },
  mix: { color: colors.good, fontSize: 15, fontWeight: '900', letterSpacing: 1, marginBottom: spacing.md },
  phase: { fontSize: 12, fontWeight: '900', letterSpacing: 1.2, marginBottom: 6 },
  statRow: { flexDirection: 'row', gap: 10 },
  message: { color: colors.muted, fontSize: 14, lineHeight: 20, marginTop: 10 },
  faint: { color: colors.faint, fontSize: 12, lineHeight: 17, marginTop: 6 },
});
