import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { colors, radii } from '../../theme';

const LEVEL_COLOR = {
  info: '#8CE0FF',
  dim: '#5B7488',
  dive: '#70E2A3',
  warn: '#F5C451',
  error: '#FF8B7A',
};

function stamp(t) {
  const d = new Date(t);
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

/**
 * Scrolling terminal view of the download engine's log stream. Purely
 * decorative-plus-diagnostic: it fills the space under the dialog and lets the
 * user watch the transfer work.
 *
 * @param {{ log: Array<{id,t,level,text}>, onClear?: () => void }} props
 */
export default function DownloadConsole({ log = [], onClear }) {
  const scrollRef = useRef(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    // stick to the bottom as new lines land
    const id = setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 30);
    return () => clearTimeout(id);
  }, [log.length, expanded]);

  if (!log.length) return null;

  return (
    <View style={styles.wrap}>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded }} onPress={() => setExpanded(!expanded)} style={styles.header}>
        <Text style={styles.headerLabel}>Transfer details</Text>
        <Text style={styles.clear}>{expanded ? 'Hide −' : 'Show +'}</Text>
      </Pressable>
      {expanded ? <>
      <ScrollView
        ref={scrollRef}
        style={styles.body}
        contentContainerStyle={styles.bodyContent}
        showsVerticalScrollIndicator={false}
      >
        {log.map((line) => (
          <Text key={line.id} style={styles.line}>
            <Text style={styles.time}>{stamp(line.t)}  </Text>
            <Text style={{ color: LEVEL_COLOR[line.level] || LEVEL_COLOR.info }}>{line.text}</Text>
          </Text>
        ))}
      </ScrollView>
      {onClear ? <Pressable accessibilityRole="button" onPress={onClear} style={styles.clearButton}><Text style={styles.clear}>Clear details</Text></Pressable> : null}
      </> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: '#0A1016',
    borderColor: colors.lineStrong,
    borderRadius: radii.md,
    borderWidth: 1,
    marginTop: 14,
    overflow: 'hidden',
  },
  header: {
    alignItems: 'center',
    backgroundColor: '#111A22',
    borderBottomColor: colors.line,
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 12,
    minHeight: 44,
    paddingVertical: 10,
  },
  dots: { flexDirection: 'row', gap: 5 },
  dot: { borderRadius: 4, height: 8, width: 8 },
  headerLabel: {
    color: colors.muted,
    flex: 1,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  clear: { color: colors.cyan, fontSize: 12, fontWeight: '600' },
  clearButton: { alignItems: 'center', justifyContent: 'center', minHeight: 44, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line },
  body: { maxHeight: 190 },
  bodyContent: { padding: 11 },
  line: {
    fontFamily: 'Menlo',
    fontSize: 11,
    lineHeight: 17,
  },
  time: { color: colors.muted },
});
