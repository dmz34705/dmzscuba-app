import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import VirtualDiveComputer from './VirtualDiveComputer';
import WaterColumnViewport from './WaterColumnViewport';
import { resolveSimulatorWorkspaceLayout } from './workspaceLayout';

export default function SimulatorWorkspace({ depthUnit, deviceDisplay, focusAreas = [], focusLevel = 'quiet', onDeviceEvent, simulation }) {
  const [availableWidth, setAvailableWidth] = useState(360);
  const layout = useMemo(() => resolveSimulatorWorkspaceLayout(availableWidth), [availableWidth]);

  return (
    <View
      accessibilityLabel="Synchronized dive simulator workspace"
      onLayout={(event) => setAvailableWidth(event.nativeEvent.layout.width)}
      style={styles.viewport}
    >
      <ScrollView
        contentContainerStyle={[styles.row, { gap: layout.gap, minWidth: Math.max(availableWidth, layout.contentWidth) }]}
        horizontal
        nestedScrollEnabled
        showsHorizontalScrollIndicator={layout.requiresHorizontalScroll}
      >
        <WaterColumnViewport
          depthUnit={depthUnit}
          focused={focusAreas.includes('water')}
          height={layout.instrument.height}
          simulation={simulation}
          width={layout.gaugeWidth}
        />
        <VirtualDiveComputer
          display={deviceDisplay}
          embedded
          focusAreas={focusAreas}
          focusLevel={focusLevel}
          instrumentWidth={layout.instrument.width}
          onDeviceEvent={onDeviceEvent}
        />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { alignItems: 'flex-start', justifyContent: 'center' },
  viewport: { marginTop: 14, width: '100%' },
});
