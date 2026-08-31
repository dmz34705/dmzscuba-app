import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import ComputerHousing from './ComputerHousing';
import { INSTRUMENT_BASE_WIDTH, resolveInstrumentGeometry } from './geometry';

export default function VirtualDiveComputer({ display, embedded = false, focusAreas = [], focusLevel = 'quiet', instrumentWidth, onDeviceEvent }) {
  const [availableWidth, setAvailableWidth] = useState(INSTRUMENT_BASE_WIDTH);
  const requestedWidth = Number.isFinite(Number(instrumentWidth)) ? Number(instrumentWidth) : availableWidth;
  const geometry = useMemo(() => resolveInstrumentGeometry(requestedWidth), [requestedWidth]);
  const contentWidth = instrumentWidth == null ? Math.max(availableWidth, geometry.width) : geometry.width;

  return (
    <View
      onLayout={(event) => {
        const measuredWidth = event.nativeEvent.layout.width;
        if (measuredWidth > 0 && Math.abs(measuredWidth - availableWidth) > 0.5) setAvailableWidth(measuredWidth);
      }}
      style={[styles.viewport, embedded && styles.embeddedViewport, instrumentWidth != null && { width: geometry.width }]}
    >
      <ScrollView
        contentContainerStyle={[styles.scrollContent, embedded && styles.embeddedContent, { minWidth: contentWidth }]}
        horizontal
        nestedScrollEnabled
        showsHorizontalScrollIndicator={false}
      >
        <ComputerHousing display={display} focusAreas={focusAreas} focusLevel={focusLevel} geometry={geometry} onDeviceEvent={onDeviceEvent} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  embeddedContent: { paddingBottom: 0, paddingTop: 0 },
  embeddedViewport: { marginBottom: 0 },
  scrollContent: { alignItems: 'center', justifyContent: 'center', paddingBottom: 14, paddingTop: 8 },
  viewport: { marginBottom: 12, width: '100%' },
});
