import { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import DateField from '../../components/DateField';
import { colors, radii } from '../../theme';
import { Chips, EditorSheet, Field, FormLabel, Half, ToggleRow, TwoUp } from '../planner/fields';
import { INSURANCE_TYPES, createDocumentId, normalizeDocument, normalizePolicy } from './model';
import { openDocument } from './openDocument';

const TYPE_OPTIONS = INSURANCE_TYPES.map(({ key, label }) => ({ key, label }));

async function pickFiles() {
  const DocumentPicker = require('expo-document-picker');
  const result = await DocumentPicker.getDocumentAsync({ type: ['application/pdf', 'image/*', '*/*'], copyToCacheDirectory: true, multiple: true });
  if (result.canceled) return [];
  return result.assets.map((asset) => normalizeDocument({ id: createDocumentId(), uri: asset.uri, name: asset.name, mimeType: asset.mimeType, size: asset.size, kind: asset.mimeType?.startsWith('image/') ? 'photo' : 'file' }));
}

async function pickPhotos() {
  const ImagePicker = require('expo-image-picker');
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) throw new Error('Allow photo access in Settings to add a picture of your card.');
  const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.9, allowsMultipleSelection: true });
  if (result.canceled) return [];
  return result.assets.map((asset, index) => normalizeDocument({ id: createDocumentId(), uri: asset.uri, name: asset.fileName || `Insurance photo ${index + 1}.jpg`, mimeType: asset.mimeType || 'image/jpeg', size: asset.fileSize, kind: 'photo' }));
}

// One policy's details and documents. Everything is typed in by the diver — nothing is read by AI.
export default function PolicyEditor({ policy, visible, onCancel, onSave, onDelete }) {
  const [draft, setDraft] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (visible) setDraft(normalizePolicy(policy || {})); }, [policy, visible]);
  if (!draft) return null;
  const set = (patch) => setDraft((current) => ({ ...current, ...patch }));
  const hint = INSURANCE_TYPES.find((type) => type.key === draft.type)?.hint;

  const add = async (picker) => {
    try { const documents = await picker(); if (documents.length) set({ documents: [...draft.documents, ...documents] }); }
    catch (error) { Alert.alert('Couldn’t add that', error?.message || 'Try again.'); }
  };
  const removeDocument = (document) => Alert.alert('Remove this document?', document.name, [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Remove', style: 'destructive', onPress: () => set({ documents: draft.documents.filter((entry) => entry.id !== document.id) }) },
  ]);
  const save = async () => {
    if (!draft.provider.trim() && !draft.policyNumber.trim()) { Alert.alert('Add the provider or policy number', 'Enough to recognise this policy later.'); return; }
    setBusy(true);
    try { await onSave(draft); } catch (error) { Alert.alert('Not saved', error?.message || 'Try again.'); } finally { setBusy(false); }
  };

  return (
    <EditorSheet
      eyebrow="INSURANCE"
      footer={onDelete ? (
        <Pressable accessibilityRole="button" onPress={() => Alert.alert('Delete this policy?', 'Its details and saved documents are removed from this phone.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: onDelete }])} style={({ pressed }) => [styles.delete, pressed && styles.pressed]}>
          <Text style={styles.deleteText}>Delete policy</Text>
        </Pressable>
      ) : null}
      onCancel={onCancel}
      onSave={save}
      saveDisabled={busy}
      saveLabel={busy ? 'Saving…' : 'Save'}
      title={policy?.id ? 'Edit policy' : 'Add policy'}
      visible={visible}
    >
      <Chips helper={hint} label="Type" onChange={(type) => set({ type })} options={TYPE_OPTIONS} value={draft.type} />
      <Field label="Provider" onChange={(provider) => set({ provider })} placeholder={draft.type === 'dive' ? 'DAN' : draft.type === 'travel' ? 'World Nomads' : 'Insurer'} value={draft.provider} />
      <TwoUp>
        <Half><Field autoCapitalize="characters" label="Policy number" maxLength={80} onChange={(policyNumber) => set({ policyNumber })} value={draft.policyNumber} /></Half>
        <Half><Field autoCapitalize="characters" label="Member / certificate" maxLength={80} onChange={(memberNumber) => set({ memberNumber })} value={draft.memberNumber} /></Half>
      </TwoUp>
      <FormLabel>Coverage</FormLabel>
      <TwoUp>
        <Half><DateField label="Starts" onChange={(startDate) => set({ startDate, endDate: draft.endDate && draft.endDate < startDate ? '' : draft.endDate })} value={draft.startDate} /></Half>
        <Half><DateField label="Ends" minimumDate={draft.startDate || undefined} onChange={(endDate) => set({ endDate })} value={draft.endDate} /></Half>
      </TwoUp>
      <View style={styles.group}>
        <ToggleRow body="It renews automatically, so it won’t be flagged as expiring." label="Auto-renews" last onChange={(autoRenews) => set({ autoRenews })} value={draft.autoRenews} />
      </View>
      <Field autoCapitalize="none" helper="The 24/7 emergency or assistance line — shown on your trips, tap to call." keyboardType="phone-pad" label="Emergency / assistance phone" maxLength={60} onChange={(emergencyPhone) => set({ emergencyPhone })} placeholder="+1 919 684 9111" value={draft.emergencyPhone} />
      <Field label="Who’s covered" maxLength={200} onChange={(covered) => set({ covered })} placeholder="Me, or family members" value={draft.covered} />
      <Field label="Coverage limits & notes" maxLength={2000} multiline onChange={(notes) => set({ notes })} placeholder="Medical limit, evacuation, depth limits, excluded activities…" value={draft.notes} />

      <FormLabel>Documents</FormLabel>
      {draft.documents.map((document) => (
        <View key={document.id} style={styles.document}>
          <Pressable accessibilityRole="button" accessibilityLabel={`Open ${document.name}`} onPress={() => openDocument(document)} style={styles.documentCopy}>
            <Text numberOfLines={1} style={styles.documentName}>{document.name}</Text>
            <Text style={styles.documentMeta}>{document.kind === 'photo' ? 'Photo' : /pdf/i.test(document.mimeType) || /\.pdf$/i.test(document.name) ? 'PDF' : 'File'}{document.size ? ` · ${document.size > 1048576 ? `${(document.size / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(document.size / 1024))} KB`}` : ''} · tap to open</Text>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${document.name}`} hitSlop={10} onPress={() => removeDocument(document)}><Text style={styles.remove}>Remove</Text></Pressable>
        </View>
      ))}
      <View style={styles.addRow}>
        <Pressable accessibilityRole="button" onPress={() => add(pickFiles)} style={({ pressed }) => [styles.addButton, pressed && styles.pressed]}><Text style={styles.addText}>+ PDF or file</Text></Pressable>
        <Pressable accessibilityRole="button" onPress={() => add(pickPhotos)} style={({ pressed }) => [styles.addButton, pressed && styles.pressed]}><Text style={styles.addText}>+ Photo of card</Text></Pressable>
      </View>
      <Text style={styles.footnote}>Kept on this phone only and included in your device backups. Nothing here is sent to a server or read by AI.</Text>
    </EditorSheet>
  );
}

const styles = StyleSheet.create({
  group: { backgroundColor: colors.surface, borderColor: colors.line, borderRadius: radii.md, borderWidth: 1, marginBottom: 14, overflow: 'hidden' },
  document: { alignItems: 'center', backgroundColor: colors.surface, borderColor: colors.line, borderRadius: radii.md, borderWidth: 1, flexDirection: 'row', gap: 12, marginBottom: 8, minHeight: 56, paddingHorizontal: 12 },
  documentCopy: { flex: 1, paddingVertical: 10 },
  documentName: { color: colors.text, fontSize: 14, fontWeight: '700' },
  documentMeta: { color: colors.faint, fontSize: 11, marginTop: 2 },
  remove: { color: colors.danger, fontSize: 13, fontWeight: '700' },
  addRow: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  addButton: { alignItems: 'center', backgroundColor: colors.surface, borderColor: colors.lineStrong, borderRadius: radii.md, borderWidth: 1, flex: 1, justifyContent: 'center', minHeight: 48 },
  addText: { color: colors.cyan, fontSize: 14, fontWeight: '800' },
  footnote: { color: colors.faint, fontSize: 11, lineHeight: 16 },
  delete: { alignItems: 'center', borderColor: 'rgba(255,127,127,0.4)', borderRadius: radii.md, borderWidth: 1, justifyContent: 'center', marginTop: 18, minHeight: 48 },
  deleteText: { color: colors.danger, fontSize: 14, fontWeight: '800' },
  pressed: { opacity: 0.74 },
});
