import { useEffect, useRef } from 'react';
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

  useEffect(() => {
    // stick to the bottom as new lines land
    const id = setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 30);
    return () => clearTimeout(id);
  }, [log.length]);

  if (!log.length) return null;

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <View style={styles.dots}>
          <View style={[styles.dot, { backgroundColor: '#FF5F56' }]} />
          <View style={[styles.dot, { backgroundColor: '#FFBD2E' }]} />
          <View style={[styles.dot, { backgroundColor: '#27C93F' }]} />
        </View>
        <Text style={styles.headerLabel}>transfer log</Text>
        {onClear ? (
          <Pressable onPress={onClear} hitSlop={8}>
            <Text style={styles.clear}>clear</Text>
          </Pressable>
        ) : null}
      </View>
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
    paddingVertical: 7,
  },
  dots: { flexDirection: 'row', gap: 5 },
  dot: { borderRadius: 4, height: 8, width: 8 },
  headerLabel: {
    color: '#5B7488',
    flex: 1,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  clear: { color: '#5B7488', fontSize: 11, fontWeight: '700' },
  body: { maxHeight: 190 },
  bodyContent: { padding: 11 },
  line: {
    fontFamily: 'Menlo',
    fontSize: 11,
    lineHeight: 17,
  },
  time: { color: '#3E5061' },
});
