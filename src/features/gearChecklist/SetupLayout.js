import { useState } from 'react';
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { requireOptionalNativeModule } from 'expo';
import Svg, { Circle, G, Path, Rect } from 'react-native-svg';
import { SecondaryButton } from '../../components/Ui';
import { colors, radii } from '../../theme';
import { checklistEntriesForItem, serviceStatusForSet } from './model';
import { SETUP_ZONES, setupLayoutItems } from './setupLayoutModel';

// Existing development clients can show the card before being rebuilt with ExpoBlur.
const Backdrop = Platform.OS === 'web' || requireOptionalNativeModule('ExpoBlur')
  ? require('expo-blur').BlurView
  : View;

export function EquipmentMark({ kind, color = colors.cyan, size = 38 }) {
  const paths = {
    vision: 'M7 19 Q7 14 13 14 H35 Q41 14 41 19 V29 Q38 35 30 30 L24 25 L18 30 Q10 35 7 29 Z M2 19 H7 M41 19 H46',
    instruments: 'M18 3 H30 V12 M18 36 V45 H30 V36 M15 13 H33 V35 H15 Z M20 20 H28 M20 26 H25',
    breathing: 'M15 12 V5 H21 V12 M27 12 V5 H33 V12 M18 5 H30 M18 5 V2 M15 20 H21 M27 20 H33',
    buoyancy: 'M18 7 L10 12 L5 31 Q5 40 15 40 L19 30 H29 L33 40 Q43 40 43 31 L38 12 L30 7 M18 7 L20 27 M30 7 L28 27 M17 33 H31',
    exposure: 'M17 5 H31 L43 21 L36 26 L30 19 V31 L34 44 H26 L24 34 L22 44 H14 L18 31 V19 L12 26 L5 21 Z',
    propulsion: 'M9 5 H19 V19 L23 42 Q15 47 5 42 L9 19 Z M29 5 H39 V19 L43 42 Q35 47 25 42 L29 19 Z M11 24 L10 39 M33 24 L34 39',
    extras: 'M10 17 H38 V41 H10 Z M18 17 V9 H30 V17 M10 26 H38 M24 26 V33',
  };
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48" aria-hidden>
      <G fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        {kind === 'breathing' ? <><Rect x="11" y="12" width="14" height="32" rx="6" /><Rect x="23" y="12" width="14" height="32" rx="6" /></> : null}
        <Path d={paths[kind] || paths.extras} />
        {kind === 'instruments' ? <Circle cx="24" cy="24" r="16" strokeOpacity="0.3" /> : null}
      </G>
    </Svg>
  );
}

export default function SetupLayout({ setup, items, onOpenGear, onAddExisting, onAddGear, onMoveFloating, setups = [] }) {
  const [selected, setSelected] = useState(null);
  const { height } = useWindowDimensions();
  const close = () => setSelected(null);
  const leave = (action) => { close(); action(); };
  const layoutItems = setupLayoutItems(setup, items);
  const zones = SETUP_ZONES.map((zone) => ({ ...zone, items: layoutItems.filter((item) => zone.categories.includes(item.category)) }));
  const attention = layoutItems.filter((item) => ['blocked', 'attention', 'overdue', 'due-soon', 'retired'].includes(serviceStatusForSet(item, items).key));
  const elsewhereItems = layoutItems.filter((item) => item.floating && item.currentSetupId !== setup.id);
  const active = selected === 'review' ? { key: 'extras', label: 'Needs review', items: attention }
    : selected === 'elsewhere' ? { key: 'extras', label: 'Shared gear to move', items: elsewhereItems }
    : zones.find((zone) => zone.key === selected);
  const orderedZones = ['breathing', 'buoyancy', 'exposure', 'instruments', 'vision', 'propulsion', 'extras'].map((key) => zones.find((zone) => zone.key === key));
  return (
    <View>
      <View style={styles.heading}>
        <Text style={styles.eyebrow}>SETUP OVERVIEW</Text>
        <Text style={styles.count}>{layoutItems.length} items</Text>
      </View>
      <Text style={styles.title}>{setup.type || 'Your configuration'}</Text>
      {setup.description ? <Text style={styles.body}>{setup.description}</Text> : null}
      <View style={styles.statusRow}>
        <Pressable accessibilityRole="button" accessibilityLabel={`Review ${attention.length} gear service flags`} onPress={() => setSelected('review')} style={({ pressed }) => [styles.statusChip, pressed && styles.pressed]}>
          <View style={[styles.statusDot, attention.length > 0 && styles.warningDot]} />
          <Text style={[styles.statusText, attention.length > 0 && styles.warningText]}>{attention.length ? `${attention.length} to review` : 'No service flags'}</Text>
          <Text style={styles.count}>›</Text>
        </Pressable>
        {elsewhereItems.length ? <Pressable accessibilityRole="button" onPress={() => setSelected('elsewhere')} style={({ pressed }) => [styles.statusChip, pressed && styles.pressed]}><Text style={styles.statusText}>{elsewhereItems.length} shared {elsewhereItems.length === 1 ? 'item' : 'items'} to move</Text><Text style={styles.count}>›</Text></Pressable> : null}
      </View>
      <View style={styles.sectionHeading}><Text style={styles.sectionTitle}>Equipment</Text><Text style={styles.count}>Tap a group to manage</Text></View>
      <View style={styles.equipmentGrid}>
        {orderedZones.map((zone) => {
          const reviewCount = zone.items.filter((item) => attention.some((entry) => entry.id === item.id)).length;
          const sharedCount = zone.items.filter((item) => elsewhereItems.some((entry) => entry.id === item.id)).length;
          const primary = zone.items[0];
          const summary = zone.items.slice(0, 2).map((item) => item.name).join(' · ');
          const specs = primary ? [primary.configuration, primary.size, primary.thickness].filter(Boolean).join(' · ') : '';
          return <Pressable key={zone.key} accessibilityRole="button" accessibilityLabel={`${zone.label}, ${zone.items.length} items${reviewCount ? `, ${reviewCount} need review` : ''}. Inspect gear`} onPress={() => setSelected(zone.key)} style={({ pressed }) => [styles.equipmentTile, selected === zone.key && styles.selectedTile, pressed && styles.pressed]}>
            <View style={styles.tileHeading}><EquipmentMark kind={zone.key} size={22} color={zone.items.length ? colors.cyan : colors.faint} /><Text style={styles.groupTitle}>{zone.key === 'extras' ? 'Safety & extras' : zone.label}</Text><Text style={styles.tileCount}>{zone.items.length || '+'}</Text></View>
            <Text style={[styles.tileSummary, !primary && styles.unassigned]} numberOfLines={2}>{summary || 'Assign from your locker'}</Text>
            <Text style={[styles.tileMeta, (reviewCount > 0 || sharedCount > 0) && styles.warningText]} numberOfLines={1}>{reviewCount ? `${reviewCount} need review` : sharedCount ? `${sharedCount} to move here` : zone.items.length > 2 ? `+${zone.items.length - 2} more items` : specs || (primary ? 'View gear & parts' : 'No gear assigned')}</Text>
          </Pressable>;
        })}
        <Pressable accessibilityRole="button" accessibilityLabel="Add gear to setup" onPress={onAddExisting} style={({ pressed }) => [styles.equipmentTile, styles.addTile, pressed && styles.pressed]}>
          <Text style={styles.addSymbol}>+</Text><Text style={styles.tileTitle}>Build your setup</Text><Text style={styles.tileSummary}>Assign gear from your locker</Text>
        </Pressable>
      </View>
      <Modal transparent visible={Boolean(active)} animationType="fade" onRequestClose={close} statusBarTranslucent>
        {active ? <View style={styles.overlay}>
          <Backdrop tint="dark" intensity={28} style={StyleSheet.absoluteFill} pointerEvents="none" />
          <Pressable style={StyleSheet.absoluteFill} accessibilityRole="button" accessibilityLabel="Close gear group" onPress={close} />
          <View accessibilityViewIsModal style={[styles.floatingCard, { maxHeight: height * 0.82 }]}>
            <View style={styles.detailHeading}>
              <View style={styles.modalTitle}><EquipmentMark kind={active.key} size={32} /><View style={styles.itemCopy}><Text accessibilityRole="header" style={styles.detailTitle}>{active.label}</Text><Text style={styles.count}>{active.items.length} {active.items.length === 1 ? 'item' : 'items'} in this setup</Text></View></View>
              <Pressable accessibilityRole="button" accessibilityLabel="Close gear details" onPress={close} style={styles.closeButton}><Text style={styles.closeText}>×</Text></Pressable>
            </View>
            <ScrollView style={styles.detailsScroll} contentContainerStyle={styles.detailsContent} showsVerticalScrollIndicator={false}>
      {active.items.length ? active.items.map((item) => {
        const { parts } = checklistEntriesForItem(item, items, setup);
        const status = serviceStatusForSet(item, items);
        const elsewhere = setups.find((entry) => entry.id === item.currentSetupId);
        return (
          <View key={item.id} style={styles.item}>
            <Pressable accessibilityRole="button" accessibilityLabel={`Inspect ${item.name}`} onPress={() => leave(() => onOpenGear(item))} style={({ pressed }) => [styles.itemLink, pressed && styles.pressed]}>
              <View style={styles.itemCopy}>
                <Text style={styles.itemCategory}>{item.category}</Text>
                <Text style={styles.itemName}>{item.name}</Text>
                <Text style={styles.body}>{[item.manufacturer, item.model, item.configuration].filter(Boolean).join(' · ') || 'View item details'}</Text>
                {['blocked', 'attention', 'overdue', 'due-soon', 'retired'].includes(status.key) ? <Text style={styles.attention}>{status.label}</Text> : null}
                {parts.length ? <Text style={styles.parts}>{parts.map((part) => part.label).join(' · ')}</Text> : null}
              </View>
              <Text style={styles.chevron}>›</Text>
            </Pressable>
            {item.floating ? <View style={styles.location}><Text style={styles.locationText}>{item.currentSetupId === setup.id ? 'On this setup' : elsewhere ? `Currently on ${elsewhere.name}` : 'Not currently on a setup'}</Text>{item.currentSetupId !== setup.id ? <SecondaryButton label="Move here" onPress={() => onMoveFloating(item.id, setup.id)} /> : null}</View> : null}
          </View>
        );
      }) : <View style={styles.empty}><Text style={styles.body}>{selected === 'review' ? 'No service flags recorded for the assigned gear.' : selected === 'elsewhere' ? 'All shared gear is on this setup.' : `No ${active.label.toLowerCase()} gear assigned yet. Add an item from your locker or create a new one.`}</Text></View>}
            </ScrollView>
            <View style={styles.actions}><SecondaryButton label="Add existing gear" onPress={() => leave(onAddExisting)} style={styles.action} /><SecondaryButton label="Add new gear" onPress={() => leave(onAddGear)} style={styles.action} /></View>
          </View>
        </View> : null}
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  heading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  eyebrow: { color: colors.cyan, fontSize: 10, fontWeight: '800', letterSpacing: 1.5 },
  count: { color: colors.muted, fontSize: 12 },
  title: { color: colors.text, fontSize: 27, fontWeight: '800', marginTop: 10, marginBottom: 6 },
  body: { color: colors.muted, fontSize: 13, lineHeight: 20 },
  attention: { color: colors.warning, fontSize: 12, lineHeight: 19, marginTop: 8 },
  statusRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14, marginBottom: 22 },
  statusChip: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, borderRadius: radii.pill, backgroundColor: colors.surface },
  statusDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: colors.muted },
  warningDot: { backgroundColor: colors.warning },
  warningText: { color: colors.warning },
  statusText: { color: colors.muted, fontSize: 12, fontWeight: '600' },
  sectionHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, gap: 8 },
  sectionTitle: { color: colors.text, fontSize: 16, fontWeight: '700' },
  equipmentGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  equipmentTile: { flexBasis: '47%', flexGrow: 1, minWidth: 120, padding: 13, borderRadius: radii.md, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.lineStrong, backgroundColor: colors.backgroundRaised },
  selectedTile: { borderColor: colors.cyan },
  tileHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 6, marginBottom: 10 },
  groupTitle: { flex: 1, color: colors.text, fontSize: 12, fontWeight: '700' },
  tileCount: { color: colors.faint, fontSize: 12, fontWeight: '600' },
  tileTitle: { color: colors.text, fontSize: 14, fontWeight: '700', marginBottom: 5 },
  tileSummary: { color: colors.muted, fontSize: 12, lineHeight: 17, minHeight: 34 },
  tileMeta: { color: colors.faint, fontSize: 10, marginTop: 9 },
  unassigned: { color: colors.faint },
  addTile: { borderStyle: 'dashed', backgroundColor: 'transparent', justifyContent: 'center' },
  addSymbol: { color: colors.cyan, fontSize: 26, marginBottom: 9 },
  overlay: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20, backgroundColor: 'rgba(2, 6, 11, 0.35)' },
  floatingCard: { width: '100%', maxWidth: 540, padding: 18, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.lineStrong, borderRadius: radii.lg },
  modalTitle: { flex: 1, flexDirection: 'row', gap: 12, alignItems: 'center' },
  closeButton: { width: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: radii.pill, backgroundColor: colors.surfaceSoft },
  closeText: { color: colors.muted, fontSize: 26 },
  detailsScroll: { flexGrow: 0, flexShrink: 1 },
  detailsContent: { paddingBottom: 4 },
  detailHeading: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, alignItems: 'center', marginBottom: 10 },
  detailTitle: { color: colors.text, fontSize: 19, fontWeight: '800' },
  item: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line, paddingVertical: 12 },
  itemLink: { flexDirection: 'row', gap: 12, alignItems: 'center', minHeight: 44 },
  itemCopy: { flex: 1 },
  itemCategory: { color: colors.cyan, fontSize: 10, fontWeight: '700', marginBottom: 4 },
  itemName: { color: colors.text, fontSize: 16, fontWeight: '700', marginBottom: 4 },
  parts: { color: colors.faint, fontSize: 12, lineHeight: 19, marginTop: 8 },
  chevron: { color: colors.muted, fontSize: 26 },
  location: { marginTop: 10, gap: 8, alignItems: 'flex-start' },
  locationText: { color: colors.warning, fontSize: 12 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 18 },
  action: { flex: 1, paddingHorizontal: 8 },
  empty: { paddingVertical: 16 },
  pressed: { opacity: 0.7 },
});
