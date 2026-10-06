import { useMemo, useRef, useState } from 'react';
import { Animated, Modal, PanResponder, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PrimaryButton, SecondaryButton } from '../../components/Ui';
import { colors, spacing } from '../../theme';
import { moveLayoutItem } from './layoutPreferences';

const ROW_HEIGHT = 64;
function DraggableRow({ item, index, count, onMove, onRemove, onDragging }) {
  const offset = useRef(new Animated.Value(0)).current;
  const [dragging, setDragging] = useState(false);
  const finish = (dy, apply) => {
    offset.setValue(0); setDragging(false); onDragging(false);
    if (apply) onMove(index, index + Math.round(dy / ROW_HEIGHT));
  };
  const responder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onPanResponderGrant: () => { setDragging(true); onDragging(true); },
    onPanResponderMove: (_, gesture) => offset.setValue(Math.max(-index * ROW_HEIGHT, Math.min((count - index - 1) * ROW_HEIGHT, gesture.dy))),
    onPanResponderRelease: (_, gesture) => finish(gesture.dy, true),
    onPanResponderTerminate: () => finish(0, false),
    onPanResponderTerminationRequest: () => false,
  }), [index, count, onMove, onDragging, offset]);
  return (
    <Animated.View style={[styles.row, dragging && styles.dragging, { transform: [{ translateY: offset }] }]}>
      <View {...responder.panHandlers} accessible accessibilityRole="adjustable"
        accessibilityLabel={`Reorder ${item.title}`} accessibilityHint="Drag to reorder, or use move up and move down."
        accessibilityActions={[{ name: 'increment', label: 'Move down' }, { name: 'decrement', label: 'Move up' }]}
        onAccessibilityAction={event => onMove(index, index + (event.nativeEvent.actionName === 'increment' ? 1 : -1))} style={styles.handle}>
        <Text style={styles.handleText}>☰</Text>
      </View>
      <Text numberOfLines={1} style={styles.name}>{item.title}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel={`Move ${item.title} up`} disabled={index === 0} onPress={() => onMove(index, index - 1)} style={styles.small}><Text style={[styles.control, index === 0 && styles.disabled]}>↑</Text></Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel={`Move ${item.title} down`} disabled={index === count - 1} onPress={() => onMove(index, index + 1)} style={styles.small}><Text style={[styles.control, index === count - 1 && styles.disabled]}>↓</Text></Pressable>
      {onRemove ? <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${item.title} from Quick access`} onPress={onRemove} style={styles.small}><Text style={styles.control}>−</Text></Pressable> : null}
    </Animated.View>
  );
}
export default function LayoutEditor({ title, ids, options, selectable = false, defaults, onSave, onCancel }) {
  const insets = useSafeAreaInsets();
  const [draft, setDraft] = useState(() => [...ids]);
  const [dragging, setDragging] = useState(false);
  const move = (from, to) => setDraft(current => moveLayoutItem(current, from, to));
  const available = options.filter(item => !draft.includes(item.id));
  return (
    <Modal animationType="slide" visible onRequestClose={onCancel}>
      <View style={[styles.screen, { paddingTop: insets.top + spacing.md, paddingBottom: insets.bottom + spacing.md }]}>
        <Text accessibilityRole="header" style={styles.title}>{title}</Text>
        <Text style={styles.caption}>Drag the handles to reorder.{selectable ? ' Add or remove your shortcuts below.' : ''}</Text>
        <ScrollView scrollEnabled={!dragging} contentContainerStyle={styles.list} keyboardShouldPersistTaps="handled">
          {draft.map((id, index) => {
            const item = options.find(option => option.id === id);
            return item ? <DraggableRow key={id} item={item} index={index} count={draft.length} onMove={move} onDragging={setDragging}
              onRemove={selectable ? () => setDraft(current => current.filter(value => value !== id)) : null} /> : null;
          })}
          {!draft.length ? <Text style={styles.caption}>No shortcuts selected. Add one below.</Text> : null}
          {selectable && available.length ? <>
            <Text style={styles.addTitle}>Add to Quick access</Text>
            {available.map(item => <Pressable key={item.id} accessibilityRole="button" accessibilityLabel={`Add ${item.title}`} style={styles.add}
              onPress={() => setDraft(current => [...current, item.id])}><Text style={styles.name}>{item.title}</Text><Text style={styles.control}>+</Text></Pressable>)}
          </> : null}
        </ScrollView>
        <View style={styles.actions}>
          <SecondaryButton label="Reset to default" onPress={() => setDraft([...defaults])} />
          <PrimaryButton label="Save layout" disabled={dragging} onPress={() => onSave(draft)} />
          <SecondaryButton label="Cancel" onPress={onCancel} />
        </View>
      </View>
    </Modal>
  );
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background, paddingHorizontal: spacing.md },
  title: { color: colors.text, fontSize: 23, fontWeight: '800' }, caption: { color: colors.muted, fontSize: 13, marginVertical: 10 },
  list: { paddingBottom: 20 }, row: { height: ROW_HEIGHT, flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.line },
  dragging: { zIndex: 100, elevation: 8, backgroundColor: colors.surfaceRaised || colors.surface, borderWidth: 1, borderColor: colors.cyan },
  handle: { width: 44, height: ROW_HEIGHT, alignItems: 'center', justifyContent: 'center' }, handleText: { color: colors.cyan, fontSize: 20 },
  name: { flex: 1, color: colors.text, fontSize: 14, fontWeight: '600' }, small: { width: 40, height: 48, alignItems: 'center', justifyContent: 'center' },
  control: { color: colors.cyan, fontSize: 23 }, disabled: { opacity: 0.25 }, addTitle: { color: colors.muted, marginTop: 24, marginBottom: 8, fontWeight: '700' },
  add: { flexDirection: 'row', alignItems: 'center', minHeight: 52, borderBottomWidth: 1, borderBottomColor: colors.line, paddingHorizontal: 12 }, actions: { gap: 8, paddingTop: 12 },
});
