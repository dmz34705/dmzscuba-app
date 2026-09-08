import { useState } from 'react';
import {
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import * as Sharing from 'expo-sharing';

import { ChoiceGroup, FormError, FormField } from '../components/AccountForm';
import { ScreenHeader } from '../components/AppShell';
import { Card, PrimaryButton, ProgressBar, SecondaryButton, Stat } from '../components/Ui';
import {
  GEAR_CATEGORIES,
  GEAR_CONDITIONS,
  SERVICE_INTERVALS,
  checklistProgress,
  createGearId,
  emptyGearItem,
  emptyGearList,
  formatDateOnly,
  gearSummary,
  listIdsForItem,
  serviceStatusForItem,
  sortGear,
} from '../features/gearChecklist/model';
import useGearChecklist from '../features/gearChecklist/useGearChecklist';
import { colors, radii, spacing } from '../theme';

const TONE_COLORS = {
  danger: colors.danger,
  warning: colors.warning,
  good: colors.good,
  muted: colors.faint,
};

function TinyAction({ label, onPress, danger = false }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.tinyAction, danger && styles.tinyDanger, pressed && styles.pressed]}>
      <Text style={[styles.tinyActionText, danger && styles.dangerText]}>{label}</Text>
    </Pressable>
  );
}

function EmptyState({ title, body, action, onPress }) {
  return (
    <Card style={styles.emptyCard}>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyBody}>{body}</Text>
      {action ? <SecondaryButton label={action} onPress={onPress} style={styles.emptyAction} /> : null}
    </Card>
  );
}

function ServiceBadge({ item }) {
  const status = serviceStatusForItem(item);
  const color = TONE_COLORS[status.tone] || colors.faint;
  const date = status.due ? formatDateOnly(status.due.date) : '';
  return (
    <View style={[styles.serviceBadge, { borderColor: `${color}70`, backgroundColor: `${color}12` }]}>
      <View style={[styles.serviceDot, { backgroundColor: color }]} />
      <Text style={[styles.serviceBadgeText, { color }]}>{status.label}{date ? ` · ${date}` : ''}</Text>
    </View>
  );
}

function GearRow({ item, lists, onPress, last = false }) {
  const memberships = lists.filter((list) => list.itemIds.includes(item.id));
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`Open ${item.name}`} onPress={onPress} style={({ pressed }) => [styles.gearRow, !last && styles.rowBorder, pressed && styles.rowPressed]}>
      <View style={styles.categoryGlyph}><Text style={styles.categoryGlyphText}>{item.category.slice(0, 2).toUpperCase()}</Text></View>
      <View style={styles.gearRowCopy}>
        <View style={styles.gearTitleRow}>
          <Text numberOfLines={1} style={styles.gearName}>{item.name}</Text>
          {item.quantity && item.quantity !== '1' ? <Text style={styles.quantity}>×{item.quantity}</Text> : null}
        </View>
        <Text numberOfLines={1} style={styles.gearMeta}>{[item.manufacturer, item.model, item.category].filter(Boolean).join(' · ')}</Text>
        <ServiceBadge item={item} />
        {memberships.length ? <Text numberOfLines={1} style={styles.listMembership}>{memberships.map((list) => list.name).join('  ·  ')}</Text> : null}
      </View>
      <Text style={styles.chevron}>›</Text>
    </Pressable>
  );
}

function SelectRow({ checked, label, body, onPress }) {
  return (
    <Pressable accessibilityRole="checkbox" accessibilityState={{ checked }} onPress={onPress} style={({ pressed }) => [styles.selectRow, pressed && styles.rowPressed]}>
      <View style={[styles.checkbox, checked && styles.checkboxChecked]}><Text style={styles.checkmark}>{checked ? '✓' : ''}</Text></View>
      <View style={styles.selectCopy}>
        <Text style={[styles.selectTitle, checked && styles.selectTitleChecked]}>{label}</Text>
        {body ? <Text style={styles.selectBody}>{body}</Text> : null}
      </View>
    </Pressable>
  );
}

function InventoryHome({ state, onAdd, onEdit }) {
  const [category, setCategory] = useState('All');
  const items = sortGear(category === 'All' ? state.items : state.items.filter((item) => item.category === category));
  const usedCategories = GEAR_CATEGORIES.filter((entry) => state.items.some((item) => item.category === entry));
  const summary = gearSummary(state);
  return (
    <>
      <View style={styles.statGrid}>
        <Stat label="Gear items" value={summary.total} style={styles.stat} />
        <Stat label="Service alerts" value={summary.alerts} accent={summary.alerts ? colors.warning : colors.good} style={styles.stat} />
        <Stat label="Ready" value={summary.ready} accent={colors.good} style={styles.stat} />
        <Stat label="Files & photos" value={summary.documents} style={styles.stat} />
      </View>
      <PrimaryButton label="Add a gear item" onPress={onAdd} />
      {usedCategories.length ? (
        <ScrollView horizontal contentContainerStyle={styles.filters} showsHorizontalScrollIndicator={false}>
          {['All', ...usedCategories].map((entry) => <SecondaryButton key={entry} label={entry} onPress={() => setCategory(entry)} selected={category === entry} style={styles.filter} />)}
        </ScrollView>
      ) : null}
      <View style={styles.sectionRow}><Text style={styles.sectionTitle}>Your gear</Text><Text style={styles.sectionMeta}>{items.length} ITEMS</Text></View>
      {items.length ? (
        <View style={styles.rowGroup}>
          {items.map((item, index) => <GearRow item={item} key={item.id} last={index === items.length - 1} lists={state.lists} onPress={() => onEdit(item)} />)}
        </View>
      ) : (
        <EmptyState title="Your gear locker is empty" body="Add your first piece of gear, then place it on as many dive checklists as you need." action="Add first item" onPress={onAdd} />
      )}
    </>
  );
}

function ChecklistsHome({ state, onAdd, onOpen }) {
  return (
    <>
      <PrimaryButton label="Create a checklist" onPress={onAdd} />
      <Text style={styles.helperLead}>An item can live on several lists. Checking it here only changes this list, not the gear record.</Text>
      <View style={styles.sectionRow}><Text style={styles.sectionTitle}>Dive checklists</Text><Text style={styles.sectionMeta}>{state.lists.length} LISTS</Text></View>
      {state.lists.length ? state.lists.map((list) => {
        const progress = checklistProgress(list);
        return (
          <Pressable accessibilityRole="button" accessibilityLabel={`Open ${list.name} checklist`} key={list.id} onPress={() => onOpen(list)} style={({ pressed }) => [styles.listCard, pressed && styles.pressed]}>
            <View style={styles.listTop}>
              <View style={styles.listIcon}><Text style={styles.listIconText}>✓</Text></View>
              <View style={styles.listCopy}>
                <Text style={styles.listName}>{list.name}</Text>
                <Text numberOfLines={2} style={styles.listDescription}>{list.description || 'Custom dive gear checklist'}</Text>
              </View>
              <Text style={styles.chevron}>›</Text>
            </View>
            <View style={styles.progressRow}><Text style={styles.progressText}>{progress.checked} of {progress.total} packed</Text><Text style={styles.progressPercent}>{Math.round(progress.ratio * 100)}%</Text></View>
            <ProgressBar value={progress.ratio} color={progress.ratio === 1 && progress.total ? colors.good : colors.cyan} />
          </Pressable>
        );
      }) : <EmptyState title="No checklists yet" body="Create lists for warm water, cold water, travel, classes, or any setup you use." action="Create checklist" onPress={onAdd} />}
    </>
  );
}

function ServiceHome({ state, onEdit }) {
  const groups = {
    urgent: [],
    upcoming: [],
    untracked: [],
  };
  sortGear(state.items).forEach((item) => {
    const status = serviceStatusForItem(item);
    if (['blocked', 'attention', 'overdue', 'due-soon'].includes(status.key)) groups.urgent.push(item);
    else if (status.key === 'current') groups.upcoming.push(item);
    else if (status.key === 'none') groups.untracked.push(item);
  });
  if (!state.items.length) return <EmptyState title="No service records yet" body="Service reminders appear as you add gear and maintenance information." />;
  return (
    <>
      {groups.urgent.length ? (
        <View style={styles.alertBanner}>
          <Text style={styles.alertLabel}>ACTION NEEDED</Text>
          <Text style={styles.alertText}>{groups.urgent.length} {groups.urgent.length === 1 ? 'item needs' : 'items need'} service or attention.</Text>
        </View>
      ) : (
        <View style={styles.goodBanner}><Text style={styles.goodLabel}>NO ACTIVE SERVICE ALERTS</Text><Text style={styles.alertText}>Nothing recorded is due within the next 30 days.</Text></View>
      )}
      {[
        ['Needs attention', groups.urgent],
        ['Scheduled service', groups.upcoming],
        ['Service not tracked', groups.untracked],
      ].map(([title, items]) => items.length ? (
        <View key={title} style={styles.serviceGroup}>
          <View style={styles.sectionRow}><Text style={styles.sectionTitle}>{title}</Text><Text style={styles.sectionMeta}>{items.length}</Text></View>
          <View style={styles.rowGroup}>{items.map((item, index) => <GearRow item={item} key={item.id} last={index === items.length - 1} lists={state.lists} onPress={() => onEdit(item)} />)}</View>
        </View>
      ) : null)}
    </>
  );
}

function NotesField({ label, value, onChangeText, placeholder }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        multiline
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.faint}
        style={styles.notesInput}
        textAlignVertical="top"
        value={value}
      />
    </View>
  );
}

function FieldSection({ title, body, children }) {
  return (
    <Card style={styles.formCard}>
      <Text style={styles.formTitle}>{title}</Text>
      {body ? <Text style={styles.formBody}>{body}</Text> : null}
      {children}
    </Card>
  );
}

function GearItemForm({ item, lists, onBack, onDelete, onSave }) {
  const isEditing = Boolean(item?.id);
  const [draft, setDraft] = useState(() => ({
    ...emptyGearItem(),
    ...item,
    attachments: [...(item?.attachments || [])],
    listIds: isEditing ? listIdsForItem(lists, item.id) : [],
  }));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const update = (key, value) => setDraft((current) => ({ ...current, [key]: value }));
  const toggleList = (listId) => update('listIds', draft.listIds.includes(listId) ? draft.listIds.filter((id) => id !== listId) : [...draft.listIds, listId]);

  const addPhoto = async () => {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        setError('Photo-library permission is needed to attach a gear photo.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.9, allowsMultipleSelection: true });
      if (result.canceled) return;
      const additions = result.assets.map((asset) => ({
        id: createGearId('attachment'),
        kind: 'photo',
        uri: asset.uri,
        name: asset.fileName || 'Gear photo',
        mimeType: asset.mimeType || 'image/jpeg',
        size: asset.fileSize || null,
      }));
      setDraft((current) => ({ ...current, attachments: [...current.attachments, ...additions] }));
    } catch (nextError) {
      setError(nextError?.message || 'The selected photo could not be attached.');
    }
  };

  const addDocument = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true, multiple: true });
      if (result.canceled) return;
      const additions = result.assets.map((asset) => ({
        id: createGearId('attachment'),
        kind: asset.mimeType?.startsWith('image/') ? 'photo' : 'document',
        uri: asset.uri,
        name: asset.name || 'Gear document',
        mimeType: asset.mimeType || '',
        size: asset.size || null,
      }));
      setDraft((current) => ({ ...current, attachments: [...current.attachments, ...additions] }));
    } catch (nextError) {
      setError(nextError?.message || 'The selected document could not be attached.');
    }
  };

  const openAttachment = async (attachment) => {
    try {
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(attachment.uri, { mimeType: attachment.mimeType || undefined, dialogTitle: attachment.name });
      } else Alert.alert('File saved', 'This device cannot open the system file sheet, but the attachment remains saved with this gear item.');
    } catch {
      Alert.alert('Could not open file', 'The attachment is still listed, but the system file sheet could not open it.');
    }
  };

  const save = async () => {
    if (!draft.name.trim()) {
      setError('Give this gear item a recognizable name.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await onSave(draft);
    } catch (nextError) {
      setError(nextError?.message || 'This gear item could not be saved.');
      setBusy(false);
    }
  };

  const confirmDelete = () => Alert.alert('Delete gear item?', 'The item and app-owned copies of its attachments will be removed from this device and every checklist.', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Delete', style: 'destructive', onPress: onDelete },
  ]);

  const isCylinder = draft.category === 'Cylinder / tank';
  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.screen}>
      <ScreenHeader eyebrow="GEAR LOCKER" title={isEditing ? 'Edit Gear' : 'Add Gear'} onBack={onBack} />
      <ScrollView contentContainerStyle={styles.formContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <FieldSection title="Identity & readiness" body="The essentials you need to recognize this item and know whether it should enter the water.">
          <FormField label="Item name" maxLength={120} onChangeText={(value) => update('name', value)} placeholder="My primary regulator" value={draft.name} />
          <ChoiceGroup choices={GEAR_CATEGORIES} label="Category" onChange={(value) => update('category', value)} value={draft.category} />
          <ChoiceGroup choices={GEAR_CONDITIONS} label="Current condition" onChange={(value) => update('condition', value)} value={draft.condition} />
          <FormField label="Manufacturer" maxLength={100} onChangeText={(value) => update('manufacturer', value)} placeholder="Optional" value={draft.manufacturer} />
          <FormField label="Model" maxLength={100} onChangeText={(value) => update('model', value)} placeholder="Optional" value={draft.model} />
          <FormField autoCapitalize="characters" label="Serial number" maxLength={120} onChangeText={(value) => update('serialNumber', value)} placeholder="Optional" value={draft.serialNumber} />
        </FieldSection>

        <FieldSection title="Checklists" body="Place this item on every setup where it belongs.">
          {lists.length ? lists.map((list) => <SelectRow checked={draft.listIds.includes(list.id)} key={list.id} label={list.name} body={list.description} onPress={() => toggleList(list.id)} />) : <Text style={styles.formEmpty}>Create a checklist after saving this item to assign it later.</Text>}
        </FieldSection>

        <FieldSection title="Service & inspections" body="Use a fixed next date, a recurring interval from the last service, or both. A fixed date takes priority.">
          <View style={styles.twoColumn}>
            <View style={styles.half}><FormField autoCapitalize="none" label="Last service" maxLength={10} onChangeText={(value) => update('lastServiceDate', value)} placeholder="YYYY-MM-DD" value={draft.lastServiceDate} /></View>
            <View style={styles.half}><FormField autoCapitalize="none" label="Next service" maxLength={10} onChangeText={(value) => update('nextServiceDate', value)} placeholder="YYYY-MM-DD" value={draft.nextServiceDate} /></View>
          </View>
          <ChoiceGroup choices={SERVICE_INTERVALS.map((value) => value || 'None')} label="Repeat every (months)" onChange={(value) => update('serviceIntervalMonths', value === 'None' ? '' : value)} value={draft.serviceIntervalMonths || 'None'} />
          {isCylinder ? (
            <View style={styles.twoColumn}>
              <View style={styles.half}><FormField autoCapitalize="none" label="Visual due" maxLength={10} onChangeText={(value) => update('visualInspectionDue', value)} placeholder="YYYY-MM-DD" value={draft.visualInspectionDue} /></View>
              <View style={styles.half}><FormField autoCapitalize="none" label="Hydro due" maxLength={10} onChangeText={(value) => update('hydrostaticTestDue', value)} placeholder="YYYY-MM-DD" value={draft.hydrostaticTestDue} /></View>
            </View>
          ) : null}
          <NotesField label="Service notes" onChangeText={(value) => update('serviceNotes', value)} placeholder="Shop, work performed, parts replaced…" value={draft.serviceNotes} />
        </FieldSection>

        <FieldSection title="Fit & specifications" body="Optional details help distinguish similar equipment and pack the correct configuration.">
          <View style={styles.twoColumn}>
            <View style={styles.half}><FormField keyboardType="number-pad" label="Quantity" maxLength={3} onChangeText={(value) => update('quantity', value)} value={draft.quantity} /></View>
            <View style={styles.half}><FormField label="Size" maxLength={40} onChangeText={(value) => update('size', value)} placeholder="M, L, 9–10…" value={draft.size} /></View>
          </View>
          <View style={styles.twoColumn}>
            <View style={styles.half}><FormField label="Thickness" maxLength={40} onChangeText={(value) => update('thickness', value)} placeholder="3 mm" value={draft.thickness} /></View>
            <View style={styles.half}><FormField label="Color" maxLength={40} onChangeText={(value) => update('color', value)} placeholder="Optional" value={draft.color} /></View>
          </View>
          <View style={styles.twoColumn}>
            <View style={styles.half}><FormField label="Weight" maxLength={40} onChangeText={(value) => update('weight', value)} placeholder="4 lb / 1.8 kg" value={draft.weight} /></View>
            <View style={styles.half}><FormField label="Capacity / lift" maxLength={50} onChangeText={(value) => update('capacity', value)} placeholder="80 cu ft / 30 lb" value={draft.capacity} /></View>
          </View>
          <FormField label="Working pressure" maxLength={50} onChangeText={(value) => update('workingPressure', value)} placeholder="3000 psi / 207 bar" value={draft.workingPressure} />
        </FieldSection>

        <FieldSection title="Ownership & warranty">
          <View style={styles.twoColumn}>
            <View style={styles.half}><FormField autoCapitalize="none" label="Purchase date" maxLength={10} onChangeText={(value) => update('purchaseDate', value)} placeholder="YYYY-MM-DD" value={draft.purchaseDate} /></View>
            <View style={styles.half}><FormField autoCapitalize="none" label="Warranty until" maxLength={10} onChangeText={(value) => update('warrantyUntil', value)} placeholder="YYYY-MM-DD" value={draft.warrantyUntil} /></View>
          </View>
          <View style={styles.twoColumn}>
            <View style={styles.half}><FormField label="Purchase price" maxLength={40} onChangeText={(value) => update('purchasePrice', value)} placeholder="$0.00" value={draft.purchasePrice} /></View>
            <View style={styles.half}><FormField label="Retailer / shop" maxLength={100} onChangeText={(value) => update('retailer', value)} placeholder="Optional" value={draft.retailer} /></View>
          </View>
        </FieldSection>

        <FieldSection title="Photos & documents" body="Save photos, manuals, receipts, service records, and work orders with this item. Files are copied into private app storage when you save.">
          <View style={styles.attachmentActions}>
            <SecondaryButton label="Add photos" onPress={addPhoto} style={styles.attachmentAction} />
            <SecondaryButton label="Add document" onPress={addDocument} style={styles.attachmentAction} />
          </View>
          {draft.attachments.map((attachment) => (
            <View key={attachment.id} style={styles.attachmentRow}>
              {attachment.kind === 'photo' ? <Image source={{ uri: attachment.uri }} style={styles.attachmentImage} /> : <View style={styles.documentIcon}><Text style={styles.documentIconText}>DOC</Text></View>}
              <Pressable accessibilityRole="button" onPress={() => openAttachment(attachment)} style={styles.attachmentCopy}>
                <Text numberOfLines={1} style={styles.attachmentName}>{attachment.name}</Text>
                <Text style={styles.attachmentMeta}>{attachment.kind === 'photo' ? 'PHOTO' : (attachment.mimeType || 'DOCUMENT').toUpperCase()}</Text>
              </Pressable>
              <TinyAction label="Remove" danger onPress={() => update('attachments', draft.attachments.filter((entry) => entry.id !== attachment.id))} />
            </View>
          ))}
        </FieldSection>

        <FieldSection title="Notes" body="Keep configuration details, markings, spare-part references, or anything else worth remembering.">
          <NotesField label="Private gear notes" onChangeText={(value) => update('notes', value)} placeholder="Optional notes…" value={draft.notes} />
        </FieldSection>

        <FormError message={error} />
        <PrimaryButton disabled={busy} label={busy ? 'Saving gear…' : 'Save gear item'} onPress={save} />
        {isEditing ? <SecondaryButton label="Delete gear item" onPress={confirmDelete} style={styles.deleteButton} /> : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function ListForm({ list, items, onBack, onDelete, onSave }) {
  const isEditing = Boolean(list?.id);
  const [draft, setDraft] = useState(() => ({ ...emptyGearList(), ...list, itemIds: [...(list?.itemIds || [])], checkedIds: [...(list?.checkedIds || [])] }));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const update = (key, value) => setDraft((current) => ({ ...current, [key]: value }));
  const toggleItem = (itemId) => update('itemIds', draft.itemIds.includes(itemId) ? draft.itemIds.filter((id) => id !== itemId) : [...draft.itemIds, itemId]);
  const save = async () => {
    if (!draft.name.trim()) {
      setError('Give this checklist a name.');
      return;
    }
    setBusy(true);
    try { await onSave(draft); } catch (nextError) { setError(nextError?.message || 'The checklist could not be saved.'); setBusy(false); }
  };
  const confirmDelete = () => Alert.alert('Delete checklist?', 'The checklist will be removed. Your gear items and files will stay in the gear locker.', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Delete', style: 'destructive', onPress: onDelete },
  ]);
  const sorted = sortGear(items);
  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.screen}>
      <ScreenHeader eyebrow="GEAR CHECKLIST" title={isEditing ? 'Edit List' : 'New List'} onBack={onBack} />
      <ScrollView contentContainerStyle={styles.formContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <FieldSection title="Checklist details" body="Use a destination, temperature range, type of dive, or setup as the list name.">
          <FormField label="List name" maxLength={100} onChangeText={(value) => update('name', value)} placeholder="Cold Water Shore Dive" value={draft.name} />
          <NotesField label="Description" onChangeText={(value) => update('description', value)} placeholder="What this setup is intended for…" value={draft.description} />
        </FieldSection>
        <FieldSection title="Gear on this list" body={`${draft.itemIds.length} of ${items.length} inventory items selected.`}>
          {sorted.length ? sorted.map((item) => <SelectRow checked={draft.itemIds.includes(item.id)} key={item.id} label={item.name} body={[item.category, item.manufacturer, item.model].filter(Boolean).join(' · ')} onPress={() => toggleItem(item.id)} />) : <Text style={styles.formEmpty}>Your gear locker is empty. Save this list, then add gear to it from the inventory.</Text>}
        </FieldSection>
        <FormError message={error} />
        <PrimaryButton disabled={busy} label={busy ? 'Saving checklist…' : 'Save checklist'} onPress={save} />
        {isEditing ? <SecondaryButton label="Delete checklist" onPress={confirmDelete} style={styles.deleteButton} /> : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function ChecklistDetail({ list, items, onBack, onEdit, onReset, onToggle }) {
  const available = sortGear(items.filter((item) => list.itemIds.includes(item.id)));
  const progress = checklistProgress(list);
  const grouped = GEAR_CATEGORIES.map((category) => ({ category, items: available.filter((item) => item.category === category) })).filter((group) => group.items.length);
  return (
    <View style={styles.screen}>
      <ScreenHeader eyebrow="PACK FOR THE DIVE" title={list.name} onBack={onBack} action={<TinyAction label="EDIT" onPress={onEdit} />} />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Card style={styles.checklistHero}>
          <View style={styles.checklistHeroTop}><View style={styles.checklistCount}><Text style={styles.checklistCountValue}>{progress.checked}/{progress.total}</Text><Text style={styles.checklistCountLabel}>PACKED</Text></View><Text style={styles.checklistPercent}>{Math.round(progress.ratio * 100)}%</Text></View>
          <ProgressBar value={progress.ratio} color={progress.ratio === 1 && progress.total ? colors.good : colors.cyan} />
          {list.description ? <Text style={styles.checklistDescription}>{list.description}</Text> : null}
          {progress.checked ? <TinyAction label="RESET CHECKS" onPress={onReset} /> : null}
        </Card>
        {grouped.length ? grouped.map((group) => (
          <View key={group.category} style={styles.checkCategory}>
            <View style={styles.sectionRow}><Text style={styles.sectionTitle}>{group.category}</Text><Text style={styles.sectionMeta}>{group.items.filter((item) => list.checkedIds.includes(item.id)).length}/{group.items.length}</Text></View>
            <View style={styles.rowGroup}>{group.items.map((item) => <SelectRow checked={list.checkedIds.includes(item.id)} key={item.id} label={item.name} body={[item.manufacturer, item.model].filter(Boolean).join(' · ')} onPress={() => onToggle(item.id)} />)}</View>
          </View>
        )) : <EmptyState title="This checklist is empty" body="Edit the list to add gear from your inventory, or assign this list while editing a gear item." action="Add gear to list" onPress={onEdit} />}
      </ScrollView>
    </View>
  );
}

export default function GearChecklistScreen({ onBack }) {
  const gear = useGearChecklist();
  const [tab, setTab] = useState('inventory');
  const [route, setRoute] = useState({ name: 'home' });
  const activeItem = route.itemId ? gear.state.items.find((item) => item.id === route.itemId) : null;
  const activeList = route.listId ? gear.state.lists.find((list) => list.id === route.listId) : null;

  if (route.name === 'gear-form') {
    return (
      <GearItemForm
        item={activeItem}
        lists={gear.state.lists}
        onBack={() => setRoute({ name: 'home' })}
        onDelete={activeItem ? async () => { await gear.deleteItem(activeItem.id); setRoute({ name: 'home' }); } : undefined}
        onSave={async (draft) => { await gear.saveItem(draft); setRoute({ name: 'home' }); }}
      />
    );
  }
  if (route.name === 'list-form') {
    return (
      <ListForm
        items={gear.state.items}
        list={activeList}
        onBack={() => setRoute(activeList ? { name: 'checklist', listId: activeList.id } : { name: 'home' })}
        onDelete={activeList ? async () => { await gear.deleteList(activeList.id); setRoute({ name: 'home' }); } : undefined}
        onSave={async (draft) => { const saved = await gear.saveList(draft); setRoute({ name: 'checklist', listId: saved.id }); }}
      />
    );
  }
  if (route.name === 'checklist' && activeList) {
    return (
      <ChecklistDetail
        items={gear.state.items}
        list={activeList}
        onBack={() => setRoute({ name: 'home' })}
        onEdit={() => setRoute({ name: 'list-form', listId: activeList.id })}
        onReset={() => gear.resetList(activeList.id)}
        onToggle={(itemId) => gear.toggleChecked(activeList.id, itemId)}
      />
    );
  }

  return (
    <View style={styles.screen}>
      <ScreenHeader eyebrow="DIVE WORKBENCH" title="Gear Locker" onBack={onBack} />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.pageTitle}>Pack with confidence.</Text>
        <Text style={styles.pageBody}>Track equipment, documents, service, and reusable checklists—all stored privately on this device.</Text>
        <View style={styles.tabs}>
          <SecondaryButton label="Inventory" onPress={() => setTab('inventory')} selected={tab === 'inventory'} style={styles.tab} />
          <SecondaryButton label="Checklists" onPress={() => setTab('checklists')} selected={tab === 'checklists'} style={styles.tab} />
          <SecondaryButton label="Service" onPress={() => setTab('service')} selected={tab === 'service'} style={styles.tab} />
        </View>
        <FormError message={gear.error} />
        {!gear.loaded ? <Text style={styles.loading}>Opening your gear locker…</Text> : null}
        {gear.loaded && tab === 'inventory' ? <InventoryHome state={gear.state} onAdd={() => setRoute({ name: 'gear-form' })} onEdit={(item) => setRoute({ name: 'gear-form', itemId: item.id })} /> : null}
        {gear.loaded && tab === 'checklists' ? <ChecklistsHome state={gear.state} onAdd={() => setRoute({ name: 'list-form' })} onOpen={(list) => setRoute({ name: 'checklist', listId: list.id })} /> : null}
        {gear.loaded && tab === 'service' ? <ServiceHome state={gear.state} onEdit={(item) => setRoute({ name: 'gear-form', itemId: item.id })} /> : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: colors.background, flex: 1 },
  content: { padding: spacing.md, paddingBottom: spacing.xxl },
  formContent: { padding: spacing.md, paddingBottom: 60 },
  pageTitle: { color: colors.text, fontSize: 29, fontWeight: '900', letterSpacing: -0.7, lineHeight: 34 },
  pageBody: { color: colors.muted, fontSize: 14, lineHeight: 21, marginBottom: 16, marginTop: 6 },
  tabs: { flexDirection: 'row', gap: 7, marginBottom: 14 },
  tab: { flex: 1, minHeight: 42, paddingHorizontal: 7 },
  loading: { color: colors.muted, fontSize: 13, paddingVertical: 30, textAlign: 'center' },
  statGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  stat: { flexBasis: '47%', flexGrow: 1 },
  filters: { gap: 7, paddingVertical: 13 },
  filter: { minHeight: 38, paddingHorizontal: 11, paddingVertical: 7 },
  sectionRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8, marginTop: 18 },
  sectionTitle: { color: colors.text, fontSize: 16, fontWeight: '900' },
  sectionMeta: { color: colors.faint, fontSize: 9, fontWeight: '900', letterSpacing: 1 },
  rowGroup: { backgroundColor: colors.surface, borderColor: colors.line, borderRadius: radii.md, borderWidth: 1, overflow: 'hidden' },
  gearRow: { alignItems: 'center', flexDirection: 'row', gap: 11, minHeight: 92, padding: 11 },
  rowBorder: { borderBottomColor: colors.line, borderBottomWidth: StyleSheet.hairlineWidth },
  rowPressed: { backgroundColor: colors.surfaceSoft },
  categoryGlyph: { alignItems: 'center', backgroundColor: 'rgba(112,221,246,0.1)', borderColor: 'rgba(112,221,246,0.3)', borderRadius: 12, borderWidth: 1, height: 45, justifyContent: 'center', width: 45 },
  categoryGlyphText: { color: colors.cyan, fontSize: 10, fontWeight: '900', letterSpacing: 0.6 },
  gearRowCopy: { flex: 1, minWidth: 0 },
  gearTitleRow: { alignItems: 'center', flexDirection: 'row', gap: 7 },
  gearName: { color: colors.text, flexShrink: 1, fontSize: 15, fontWeight: '800' },
  quantity: { color: colors.cyan, fontSize: 11, fontWeight: '900' },
  gearMeta: { color: colors.muted, fontSize: 10, lineHeight: 15, marginTop: 2 },
  listMembership: { color: colors.faint, fontSize: 9, marginTop: 5 },
  chevron: { color: colors.cyan, fontSize: 25, fontWeight: '300' },
  serviceBadge: { alignItems: 'center', alignSelf: 'flex-start', borderRadius: radii.pill, borderWidth: 1, flexDirection: 'row', gap: 5, marginTop: 6, paddingHorizontal: 7, paddingVertical: 3 },
  serviceDot: { borderRadius: 3, height: 5, width: 5 },
  serviceBadgeText: { fontSize: 7.5, fontWeight: '900', letterSpacing: 0.5 },
  emptyCard: { alignItems: 'center', marginTop: 9, paddingVertical: 27 },
  emptyTitle: { color: colors.text, fontSize: 17, fontWeight: '900', textAlign: 'center' },
  emptyBody: { color: colors.muted, fontSize: 12, lineHeight: 18, marginTop: 6, maxWidth: 285, textAlign: 'center' },
  emptyAction: { marginTop: 14 },
  helperLead: { color: colors.faint, fontSize: 10, lineHeight: 16, marginHorizontal: 8, marginTop: 10, textAlign: 'center' },
  listCard: { backgroundColor: colors.surface, borderColor: colors.line, borderRadius: radii.lg, borderWidth: 1, marginBottom: 10, padding: 14 },
  listTop: { alignItems: 'center', flexDirection: 'row', gap: 11 },
  listIcon: { alignItems: 'center', backgroundColor: 'rgba(112,226,163,0.1)', borderColor: 'rgba(112,226,163,0.3)', borderRadius: 12, borderWidth: 1, height: 43, justifyContent: 'center', width: 43 },
  listIconText: { color: colors.good, fontSize: 20, fontWeight: '900' },
  listCopy: { flex: 1 },
  listName: { color: colors.text, fontSize: 16, fontWeight: '900' },
  listDescription: { color: colors.muted, fontSize: 10, lineHeight: 15, marginTop: 3 },
  progressRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 7, marginTop: 13 },
  progressText: { color: colors.muted, fontSize: 10, fontWeight: '700' },
  progressPercent: { color: colors.cyan, fontSize: 10, fontWeight: '900' },
  alertBanner: { backgroundColor: 'rgba(255,179,106,0.09)', borderColor: 'rgba(255,179,106,0.35)', borderRadius: radii.md, borderWidth: 1, padding: 13 },
  goodBanner: { backgroundColor: 'rgba(112,226,163,0.08)', borderColor: 'rgba(112,226,163,0.3)', borderRadius: radii.md, borderWidth: 1, padding: 13 },
  alertLabel: { color: colors.warning, fontSize: 9, fontWeight: '900', letterSpacing: 1.1 },
  goodLabel: { color: colors.good, fontSize: 9, fontWeight: '900', letterSpacing: 1.1 },
  alertText: { color: colors.muted, fontSize: 11, lineHeight: 17, marginTop: 4 },
  serviceGroup: { marginBottom: 4 },
  field: { marginBottom: 14 },
  fieldLabel: { color: colors.muted, fontSize: 11, fontWeight: '800', letterSpacing: 0.45, marginBottom: 7, textTransform: 'uppercase' },
  notesInput: { backgroundColor: colors.backgroundRaised, borderColor: colors.lineStrong, borderRadius: radii.md, borderWidth: 1, color: colors.text, fontSize: 15, fontWeight: '600', minHeight: 94, padding: 13 },
  formCard: { padding: spacing.md },
  formTitle: { color: colors.text, fontSize: 18, fontWeight: '900' },
  formBody: { color: colors.muted, fontSize: 11, lineHeight: 17, marginBottom: 15, marginTop: 4 },
  formEmpty: { color: colors.faint, fontSize: 11, lineHeight: 17, paddingVertical: 4 },
  twoColumn: { flexDirection: 'row', gap: 9 },
  half: { flex: 1 },
  selectRow: { alignItems: 'center', borderBottomColor: colors.line, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: 11, minHeight: 58, paddingVertical: 9 },
  checkbox: { alignItems: 'center', borderColor: colors.lineStrong, borderRadius: 7, borderWidth: 1.5, height: 26, justifyContent: 'center', width: 26 },
  checkboxChecked: { backgroundColor: colors.cyan, borderColor: colors.cyan },
  checkmark: { color: colors.background, fontSize: 17, fontWeight: '900' },
  selectCopy: { flex: 1 },
  selectTitle: { color: colors.text, fontSize: 13, fontWeight: '700' },
  selectTitleChecked: { color: colors.cyan },
  selectBody: { color: colors.faint, fontSize: 9, lineHeight: 14, marginTop: 2 },
  attachmentActions: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  attachmentAction: { flex: 1 },
  attachmentRow: { alignItems: 'center', borderTopColor: colors.line, borderTopWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: 9, paddingVertical: 10 },
  attachmentImage: { backgroundColor: colors.backgroundRaised, borderRadius: 8, height: 46, width: 46 },
  documentIcon: { alignItems: 'center', backgroundColor: colors.backgroundRaised, borderColor: colors.line, borderRadius: 8, borderWidth: 1, height: 46, justifyContent: 'center', width: 46 },
  documentIconText: { color: colors.cyan, fontSize: 8, fontWeight: '900' },
  attachmentCopy: { flex: 1 },
  attachmentName: { color: colors.text, fontSize: 12, fontWeight: '800' },
  attachmentMeta: { color: colors.faint, fontSize: 8, fontWeight: '800', marginTop: 3 },
  tinyAction: { alignItems: 'center', borderColor: colors.lineStrong, borderRadius: radii.pill, borderWidth: 1, justifyContent: 'center', minHeight: 32, paddingHorizontal: 10 },
  tinyDanger: { borderColor: 'rgba(255,127,127,0.35)' },
  tinyActionText: { color: colors.cyan, fontSize: 9, fontWeight: '900', letterSpacing: 0.5 },
  dangerText: { color: colors.danger },
  deleteButton: { borderColor: 'rgba(255,127,127,0.35)', marginTop: 12 },
  checklistHero: { padding: 15 },
  checklistHeroTop: { alignItems: 'flex-end', flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  checklistCount: { flexDirection: 'row', alignItems: 'baseline', gap: 7 },
  checklistCountValue: { color: colors.text, fontSize: 27, fontWeight: '900' },
  checklistCountLabel: { color: colors.muted, fontSize: 9, fontWeight: '900', letterSpacing: 1 },
  checklistPercent: { color: colors.cyan, fontSize: 17, fontWeight: '900' },
  checklistDescription: { color: colors.muted, fontSize: 11, lineHeight: 17, marginBottom: 11, marginTop: 11 },
  checkCategory: { marginBottom: 5 },
  pressed: { opacity: 0.74, transform: [{ scale: 0.985 }] },
});
