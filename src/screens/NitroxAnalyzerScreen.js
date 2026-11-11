import { useState } from 'react';
import { Text, View } from 'react-native';

import MenuPage from '../components/MenuPage';
import { StatusBanner } from '../components/ScreenLayout';
import AnalyzerPanel from '../features/nitroxAnalyzer/AnalyzerPanel';
import FacilityLog from '../features/nitroxAnalyzer/FacilityLog';
import { Segmented } from '../features/nitroxAnalyzer/parts';
import PersonalLog from '../features/nitroxAnalyzer/PersonalLog';
import useNitroxAnalyzer from '../features/nitroxAnalyzer/useNitroxAnalyzer';
import useNitroxLog from '../features/nitroxAnalyzer/useNitroxLog';
import { colors, spacing } from '../theme';

const MODES = [
  { value: 'personal', label: 'Personal' },
  { value: 'facility', label: 'Facility' },
];

export default function NitroxAnalyzerScreen({ onBack, appSettings = {} }) {
  // One analyzer connection for both logs, so switching modes never drops it.
  const analyzer = useNitroxAnalyzer();
  const log = useNitroxLog();
  const [mode, setMode] = useState('personal');
  const [signing, setSigning] = useState(false);

  return (
    <MenuPage title="Nitrox" onBack={onBack} scrollEnabled={!signing}>
      <AnalyzerPanel analyzer={analyzer} />
      <Segmented options={MODES} value={mode} onChange={setMode} />
      {!log.loaded ? <Text style={{ color: colors.muted }}>Loading log…</Text> : null}
      {log.loaded && mode === 'personal' ? <PersonalLog analyzer={analyzer} log={log} appSettings={appSettings} /> : null}
      {log.loaded && mode === 'facility' ? <FacilityLog analyzer={analyzer} log={log} appSettings={appSettings} onSigningChange={setSigning} /> : null}
      <View style={{ marginTop: spacing.lg }}>
        <StatusBanner
          label="SAFETY"
          body="Always confirm the reading on the analyzer's own display, analyze every cylinder yourself, and check your computer is set to that mix before diving."
        />
      </View>
    </MenuPage>
  );
}
