import { useEffect, useMemo, useState } from 'react';
import { Keyboard, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { colors, radii } from '../../theme';
import { searchDiveSites } from './siteSearch';

// A plan's dive site: type to search the Ocean Atlas (and your own pinned sites) and link one, keep a
// typed name as-is, or drop a pin for a site the atlas doesn't list.
export default function SiteField({ label = 'Dive site', value, onChange, mySites = [], onDropPin }) {
  const [focused, setFocused] = useState(false);
  const [query, setQuery] = useState(value?.name || '');
  useEffect(() => { if (!focused) setQuery(value?.name || ''); }, [value?.name, focused]);
  // Warm the area lookup so the first real search is instant.
  useEffect(() => { const timer = setTimeout(() => { try { searchDiveSites('ab'); } catch { /* optional */ } }, 300); return () => clearTimeout(timer); }, []);
  const linked = Boolean(value?.siteId);
  const results = useMemo(() => (focused && !linked ? searchDiveSites(query, mySites) : []), [focused, linked, query, mySites]);
  const typed = query.trim();

  const type = (text) => {
    setQuery(text);
    // Editing the name unlinks the site: the text no longer names that atlas record.
    onChange({ name: text });
  };
  const pick = (site) => {
    Keyboard.dismiss(); setFocused(false); setQuery(site.name);
    onChange({ name: site.name, siteId: site.id, latitude: site.latitude, longitude: site.longitude, area: site.area, custom: site.custom });
  };

  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        autoCorrect={false}
        onBlur={() => setTimeout(() => setFocused(false), 150)}
        onChangeText={type}
        onFocus={() => setFocused(true)}
        placeholder="Search the Ocean Atlas or type a name"
        placeholderTextColor={colors.faint}
        returnKeyType="done"
        style={[styles.input, linked && styles.inputLinked]}
        value={query}
      />
      {linked ? (
        <View style={styles.linked}>
          <Text style={[styles.linkedText, value.custom && { color: colors.gold }]} numberOfLines={1}>{value.custom ? '📍 My site' : '✓ Linked to Ocean Atlas'}{value.area && !value.custom ? ` · ${value.area}` : ''}</Text>
          <Pressable accessibilityRole="button" hitSlop={8} onPress={() => onChange({ name: value.name })}><Text style={styles.unlink}>Unlink</Text></Pressable>
        </View>
      ) : null}
      {focused && typed.length >= 2 && !linked ? (
        <View style={styles.list}>
          {results.map((site) => (
            <Pressable key={site.id} accessibilityRole="button" accessibilityLabel={`${site.name}, ${site.area}`} onPress={() => pick(site)} style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
              <View style={[styles.dot, site.custom && styles.dotMine]} />
              <View style={styles.flex}>
                <Text style={styles.name} numberOfLines={1}>{site.name}</Text>
                <Text style={styles.area} numberOfLines={1}>{site.area || 'Dive site'}</Text>
              </View>
            </Pressable>
          ))}
          {!results.length ? <Text style={styles.none}>No Ocean Atlas site matches “{typed}”.</Text> : null}
          <Pressable accessibilityRole="button" onPress={() => { Keyboard.dismiss(); setFocused(false); onDropPin?.(typed); }} style={({ pressed }) => [styles.row, styles.action, pressed && styles.pressed]}>
            <Text style={styles.pinIcon}>📍</Text>
            <View style={styles.flex}><Text style={[styles.name, { color: colors.gold }]} numberOfLines={1}>Drop a pin for “{typed}”</Text><Text style={styles.area}>Add it to My sites on the Ocean Atlas</Text></View>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={() => { Keyboard.dismiss(); setFocused(false); }} style={({ pressed }) => [styles.row, styles.action, pressed && styles.pressed]}>
            <Text style={styles.pinIcon}>✎</Text>
            <View style={styles.flex}><Text style={styles.name} numberOfLines={1}>Just use “{typed}”</Text><Text style={styles.area}>Save the name without a map location</Text></View>
          </Pressable>
        </View>
      ) : null}
      {!focused && !linked && typed ? (
        <Pressable accessibilityRole="button" hitSlop={6} onPress={() => onDropPin?.(typed)}><Text style={styles.hint}>Not on the map yet · <Text style={{ color: colors.gold, fontWeight: '800' }}>Drop a pin</Text></Text></Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  field: { marginBottom: 14 },
  flex: { flex: 1, minWidth: 0 },
  label: { color: colors.muted, fontSize: 11, fontWeight: '800', letterSpacing: 0.45, marginBottom: 7, textTransform: 'uppercase' },
  input: { backgroundColor: colors.backgroundRaised, borderColor: colors.lineStrong, borderRadius: radii.md, borderWidth: 1, color: colors.text, fontSize: 16, fontWeight: '600', minHeight: 50, paddingHorizontal: 13 },
  inputLinked: { borderColor: 'rgba(112,221,246,0.55)' },
  linked: { alignItems: 'center', flexDirection: 'row', gap: 10, marginTop: 7 },
  linkedText: { color: colors.cyan, flex: 1, fontSize: 12, fontWeight: '700' },
  unlink: { color: colors.faint, fontSize: 12, fontWeight: '700' },
  list: { backgroundColor: colors.surface, borderColor: colors.lineStrong, borderRadius: radii.md, borderWidth: 1, marginTop: 6, overflow: 'hidden' },
  row: { alignItems: 'center', borderBottomColor: colors.line, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: 12, minHeight: 54, paddingHorizontal: 13, paddingVertical: 9 },
  action: { backgroundColor: colors.backgroundRaised },
  pressed: { backgroundColor: colors.surfaceSoft },
  dot: { backgroundColor: colors.cyan, borderColor: colors.background, borderRadius: 6, borderWidth: 2, height: 12, width: 12 },
  dotMine: { backgroundColor: colors.gold },
  name: { color: colors.text, fontSize: 15, fontWeight: '700' },
  area: { color: colors.muted, fontSize: 12, marginTop: 2 },
  none: { color: colors.muted, fontSize: 13, paddingHorizontal: 13, paddingVertical: 12 },
  pinIcon: { fontSize: 15, textAlign: 'center', width: 14 },
  hint: { color: colors.faint, fontSize: 12, marginTop: 7 },
});
