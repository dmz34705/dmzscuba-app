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
import DateField from '../components/DateField';
import { Card, PrimaryButton, ProgressBar, SecondaryButton, Stat } from '../components/Ui';
import {
  BCD_STYLES,
  COMPONENT_TYPES,
  EXPOSURE_SUIT_TYPES,
  GEAR_CATEGORIES,
  GEAR_CONDITIONS,
  REGULATOR_CONFIGURATIONS,
  SERVICE_INTERVALS,
  SETUP_TYPES,
  TANK_CONFIGURATIONS,
  accessoryItemsForItem,
  bcdComponentTemplate,
  createGearId,
  emptyGearComponent,
  emptyGearItem,
  emptyGearSetup,
  exposureComponentTemplate,
  formatDateOnly,
  gearSummary,
  parentItemsForAccessory,
  regulatorComponentTemplate,
  serviceEntriesForItem,
  serviceStatusForAssembly,
  serviceStatusForItem,
  setupIdsForItem,
  setupProgress,
  sortGear,
  tankComponentTemplate,
} from '../features/gearChecklist/model';
import AddGearWizard from '../features/gearChecklist/AddGearWizard';
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

function ServiceBadge({ item, includeParts = false }) {
  const status = includeParts ? serviceStatusForAssembly(item) : serviceStatusForItem(item);
  const color = TONE_COLORS[status.tone] || colors.faint;
  const date = status.due ? formatDateOnly(status.due.date) : '';
  return (
    <View style={[styles.serviceBadge, { borderColor: `${color}70`, backgroundColor: `${color}12` }]}>
      <View style={[styles.serviceDot, { backgroundColor: color }]} />
      <Text style={[styles.serviceBadgeText, { color }]}>{status.label}{date ? ` · ${date}` : ''}</Text>
    </View>
  );
}

function GearRow({ item, setups, onPress, last = false }) {
  const memberships = setups.filter((setup) => setup.itemIds.includes(item.id));
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`Open ${item.name}`} onPress={onPress} style={({ pressed }) => [styles.gearRow, !last && styles.rowBorder, pressed && styles.rowPressed]}>
      <View style={styles.categoryGlyph}><Text style={styles.categoryGlyphText}>{item.category.slice(0, 2).toUpperCase()}</Text></View>
      <View style={styles.gearRowCopy}>
        <View style={styles.gearTitleRow}>
          <Text numberOfLines={1} style={styles.gearName}>{item.name}</Text>
          {item.quantity && item.quantity !== '1' ? <Text style={styles.quantity}>×{item.quantity}</Text> : null}
        </View>
        <Text numberOfLines={1} style={styles.gearMeta}>{[item.manufacturer, item.model, item.category, item.configuration].filter(Boolean).join(' · ')}</Text>
        {item.components?.length ? <Text style={styles.componentCount}>{item.components.length} TRACKED PARTS</Text> : null}
        <ServiceBadge item={item} includeParts />
        {memberships.length ? <Text numberOfLines={1} style={styles.listMembership}>{memberships.map((setup) => setup.name).join('  ·  ')}</Text> : null}
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

function InventoryHome({ state, onAdd, onOpen }) {
  const [category, setCategory] = useState('All');
  const items = sortGear(category === 'All' ? state.items : state.items.filter((item) => item.category === category));
  const usedCategories = GEAR_CATEGORIES.filter((entry) => state.items.some((item) => item.category === entry));
  const summary = gearSummary(state);
  return (
    <>
      <View style={styles.statGrid}>
        <Stat label="Gear / parts" value={`${summary.total} / ${summary.components}`} style={styles.stat} />
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
          {items.map((item, index) => <GearRow item={item} key={item.id} last={index === items.length - 1} setups={state.setups} onPress={() => onOpen(item)} />)}
        </View>
      ) : (
        <EmptyState title="Your gear locker is empty" body="Add your first piece of gear, then place it in any setup where you use it." action="Add first item" onPress={onAdd} />
      )}
    </>
  );
}

function SetupsHome({ state, onAdd, onOpen }) {
  return (
    <>
      <PrimaryButton label="Create a setup" onPress={onAdd} />
      <Text style={styles.helperLead}>Build reusable single-tank, doubles, sidemount, travel, or custom configurations. Packing checks stay independent for each setup.</Text>
      <View style={styles.sectionRow}><Text style={styles.sectionTitle}>Dive setups</Text><Text style={styles.sectionMeta}>{state.setups.length} SETUPS</Text></View>
      {state.setups.length ? state.setups.map((setup) => {
        const progress = setupProgress(setup);
        return (
          <Pressable accessibilityRole="button" accessibilityLabel={`Open ${setup.name} setup`} key={setup.id} onPress={() => onOpen(setup)} style={({ pressed }) => [styles.listCard, pressed && styles.pressed]}>
            <View style={styles.listTop}>
              <View style={styles.listIcon}><Text style={styles.listIconText}>✓</Text></View>
              <View style={styles.listCopy}>
                <Text style={styles.listName}>{setup.name}</Text>
                <Text style={styles.setupType}>{setup.type.toUpperCase()}</Text>
                <Text numberOfLines={2} style={styles.listDescription}>{setup.description || 'Reusable dive configuration'}</Text>
              </View>
              <Text style={styles.chevron}>›</Text>
            </View>
            <View style={styles.progressRow}><Text style={styles.progressText}>{progress.checked} of {progress.total} packed</Text><Text style={styles.progressPercent}>{Math.round(progress.ratio * 100)}%</Text></View>
            <ProgressBar value={progress.ratio} color={progress.ratio === 1 && progress.total ? colors.good : colors.cyan} />
          </Pressable>
        );
      }) : <EmptyState title="No setups yet" body="Create a reusable configuration, then add the exact gear you dive with." action="Create setup" onPress={onAdd} />}
    </>
  );
}

function ServiceHome({ state, onOpen }) {
  const groups = {
    urgent: [],
    upcoming: [],
    untracked: [],
  };
  sortGear(state.items).forEach((item) => {
    serviceEntriesForItem(item).forEach((entry) => {
      const status = serviceStatusForItem(entry.record);
      const value = { ...entry, owner: item, status };
      if (['blocked', 'attention', 'overdue', 'due-soon'].includes(status.key)) groups.urgent.push(value);
      else if (status.key === 'current') groups.upcoming.push(value);
      else if (status.key === 'none') groups.untracked.push(value);
    });
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
      ].map(([title, entries]) => entries.length ? (
        <View key={title} style={styles.serviceGroup}>
          <View style={styles.sectionRow}><Text style={styles.sectionTitle}>{title}</Text><Text style={styles.sectionMeta}>{entries.length}</Text></View>
          <View style={styles.rowGroup}>{entries.map((entry, index) => (
            <Pressable key={entry.id} onPress={() => onOpen(entry.owner)} style={[styles.serviceEntry, index < entries.length - 1 && styles.rowBorder]}>
              <View style={styles.serviceEntryCopy}>
                <Text style={styles.selectTitle}>{entry.name}</Text>
                <Text style={styles.selectBody}>{entry.parentId ? `${entry.category} · part of ${entry.owner.name}` : entry.category}</Text>
                <ServiceBadge item={entry.record} />
              </View>
              <Text style={styles.chevron}>›</Text>
            </Pressable>
          ))}</View>
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

function ComponentEditor({ category, component, onChange, onRemove }) {
  const types = COMPONENT_TYPES[category] || COMPONENT_TYPES.default;
  const update = (key, value) => onChange({ ...component, [key]: value });
  return (
    <View style={styles.componentEditor}>
      <View style={styles.componentHeader}>
        <Text style={styles.componentTitle}>{component.name || component.type || 'New part'}</Text>
        <TinyAction label="REMOVE" danger onPress={onRemove} />
      </View>
      <ChoiceGroup choices={types} label="Part type" onChange={(value) => update('type', value)} value={component.type} />
      <FormField autoCapitalize="words" label="Part name" maxLength={120} onChangeText={(value) => update('name', value)} placeholder={component.type} value={component.name} />
      <View style={styles.twoColumn}>
        <View style={styles.half}><FormField label="Manufacturer" maxLength={100} onChangeText={(value) => update('manufacturer', value)} placeholder="Optional" value={component.manufacturer} /></View>
        <View style={styles.half}><FormField label="Model" maxLength={100} onChangeText={(value) => update('model', value)} placeholder="Optional" value={component.model} /></View>
      </View>
      <FormField autoCapitalize="characters" label="Serial number" maxLength={120} onChangeText={(value) => update('serialNumber', value)} placeholder="Optional" value={component.serialNumber} />
      <ChoiceGroup choices={GEAR_CONDITIONS} label="Condition" onChange={(value) => update('condition', value)} value={component.condition} />
      <View style={styles.twoColumn}>
        <View style={styles.half}><DateField label="Last service" onChange={(value) => update('lastServiceDate', value)} value={component.lastServiceDate} /></View>
        <View style={styles.half}><DateField label="Next service" onChange={(value) => update('nextServiceDate', value)} value={component.nextServiceDate} /></View>
      </View>
      <ChoiceGroup choices={SERVICE_INTERVALS.map((value) => value || 'None')} label="Repeat every (months)" onChange={(value) => update('serviceIntervalMonths', value === 'None' ? '' : value)} value={component.serviceIntervalMonths || 'None'} />
      <NotesField label="Part notes" onChangeText={(value) => update('notes', value)} placeholder="Hose length, port, markings, service details…" value={component.notes} />
    </View>
  );
}

function GearItemForm({ item, setups, defaultSetupId, presetCategory, onBack, onDelete, onSave }) {
  const isEditing = Boolean(item?.id);
  const [draft, setDraft] = useState(() => ({
    ...emptyGearItem(),
    ...(!isEditing && presetCategory ? { category: presetCategory } : {}),
    ...item,
    attachments: [...(item?.attachments || [])],
    components: (item?.components || []).map((component) => ({ ...component })),
    setupIds: isEditing ? setupIdsForItem(setups, item.id) : (defaultSetupId ? [defaultSetupId] : []),
  }));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const update = (key, value) => setDraft((current) => ({ ...current, [key]: value }));
  const toggleSetup = (setupId) => update('setupIds', draft.setupIds.includes(setupId) ? draft.setupIds.filter((id) => id !== setupId) : [...draft.setupIds, setupId]);
  const addComponent = (type) => update('components', [...draft.components, { ...emptyGearComponent(draft.category, type), id: createGearId('component') }]);
  const updateComponent = (index, component) => update('components', draft.components.map((entry, i) => (i === index ? component : entry)));
  const removeComponent = (index) => update('components', draft.components.filter((_, i) => i !== index));
  const addRegulatorTemplate = () => {
    const template = isRegulator ? regulatorComponentTemplate(draft.configuration) : isCylinder ? tankComponentTemplate(draft.configuration) : isBcd ? bcdComponentTemplate() : exposureComponentTemplate();
    update('components', template.map((component) => ({ ...component, id: createGearId('component') })));
  };

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

  const confirmDelete = () => Alert.alert('Delete gear item?', 'The item, its tracked parts, and app-owned attachment copies will be removed from this device and every setup.', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Delete', style: 'destructive', onPress: onDelete },
  ]);

  const isCylinder = draft.category === 'Cylinder / tank';
  const isRegulator = draft.category === 'Regulator';
  const isBcd = draft.category === 'BCD';
  const isExposure = draft.category === 'Exposure suit';
  const configurationOptions = isRegulator ? REGULATOR_CONFIGURATIONS : isCylinder ? TANK_CONFIGURATIONS : isBcd ? BCD_STYLES : isExposure ? EXPOSURE_SUIT_TYPES : [];
  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.screen}>
      <ScreenHeader eyebrow="GEAR LOCKER" title={isEditing ? 'Edit Gear' : 'Add Gear'} onBack={onBack} />
      <ScrollView contentContainerStyle={styles.formContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <FieldSection title="Identity & readiness" body="The essentials you need to recognize this item and know whether it should enter the water.">
          <FormField autoCapitalize="words" label="Item name" maxLength={120} onChangeText={(value) => update('name', value)} placeholder="My primary regulator" value={draft.name} />
          <ChoiceGroup choices={GEAR_CATEGORIES} label="Category" onChange={(value) => setDraft((current) => ({ ...current, category: value, configuration: '', components: [] }))} value={draft.category} />
          <ChoiceGroup choices={GEAR_CONDITIONS} label="Current condition" onChange={(value) => update('condition', value)} value={draft.condition} />
          <FormField label="Manufacturer" maxLength={100} onChangeText={(value) => update('manufacturer', value)} placeholder="Optional" value={draft.manufacturer} />
          <FormField label="Model" maxLength={100} onChangeText={(value) => update('model', value)} placeholder="Optional" value={draft.model} />
          <FormField autoCapitalize="characters" label="Serial number" maxLength={120} onChangeText={(value) => update('serialNumber', value)} placeholder="Optional" value={draft.serialNumber} />
        </FieldSection>

        <FieldSection title="Assembly & parts" body="Keep simple gear as one item. Turn on parts for regulators, doubles, cameras, rebreathers, or anything you service and configure piece by piece.">
          {configurationOptions.length ? <ChoiceGroup choices={configurationOptions} label="Configuration" onChange={(value) => update('configuration', value)} value={draft.configuration} /> : null}
          <ChoiceGroup choices={['Single item', 'Track individual parts']} label="Item structure" onChange={(value) => setDraft((current) => ({ ...current, isAssembly: value === 'Track individual parts', components: value === 'Single item' ? [] : current.components }))} value={draft.isAssembly ? 'Track individual parts' : 'Single item'} />
          {draft.isAssembly ? (
            <>
              {(isRegulator || isCylinder || isBcd || isExposure) && !draft.components.length ? <SecondaryButton label={isRegulator ? `Add ${draft.configuration || 'single tank'} regulator parts` : isCylinder ? 'Add typical tank parts' : isBcd ? 'Add typical BCD parts' : 'Add typical exposure suit parts'} onPress={addRegulatorTemplate} style={styles.componentTemplateButton} /> : null}
              {draft.components.map((component, index) => (
                <ComponentEditor category={draft.category} component={component} key={component.id || index} onChange={(value) => updateComponent(index, value)} onRemove={() => removeComponent(index)} />
              ))}
              <SecondaryButton label="Add a part" onPress={() => addComponent()} />
            </>
          ) : null}
        </FieldSection>

        <FieldSection title="Dive setups" body="Place this item in every configuration where you use it. Its tracked parts travel with it.">
          {setups.length ? setups.map((setup) => <SelectRow checked={draft.setupIds.includes(setup.id)} key={setup.id} label={setup.name} body={[setup.type, setup.description].filter(Boolean).join(' · ')} onPress={() => toggleSetup(setup.id)} />) : <Text style={styles.formEmpty}>Create a setup after saving this item to assign it later.</Text>}
        </FieldSection>

        <FieldSection title="Service & inspections" body="Use a fixed next date, a recurring interval from the last service, or both. A fixed date takes priority.">
          <View style={styles.twoColumn}>
            <View style={styles.half}><DateField label="Last service" onChange={(value) => update('lastServiceDate', value)} value={draft.lastServiceDate} /></View>
            <View style={styles.half}><DateField label="Next service" onChange={(value) => update('nextServiceDate', value)} value={draft.nextServiceDate} /></View>
          </View>
          <ChoiceGroup choices={SERVICE_INTERVALS.map((value) => value || 'None')} label="Repeat every (months)" onChange={(value) => update('serviceIntervalMonths', value === 'None' ? '' : value)} value={draft.serviceIntervalMonths || 'None'} />
          {isCylinder ? (
            <View style={styles.twoColumn}>
              <View style={styles.half}><DateField label="Visual due" onChange={(value) => update('visualInspectionDue', value)} value={draft.visualInspectionDue} /></View>
              <View style={styles.half}><DateField label="Hydro due" onChange={(value) => update('hydrostaticTestDue', value)} value={draft.hydrostaticTestDue} /></View>
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
            <View style={styles.half}><DateField label="Purchase date" onChange={(value) => update('purchaseDate', value)} value={draft.purchaseDate} /></View>
            <View style={styles.half}><DateField label="Warranty until" onChange={(value) => update('warrantyUntil', value)} value={draft.warrantyUntil} /></View>
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

function SetupForm({ setup, items, onBack, onDelete, onSave }) {
  const isEditing = Boolean(setup?.id);
  const [draft, setDraft] = useState(() => ({ ...emptyGearSetup(), ...setup, itemIds: [...(setup?.itemIds || [])], checkedIds: [...(setup?.checkedIds || [])] }));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const update = (key, value) => setDraft((current) => ({ ...current, [key]: value }));
  const toggleItem = (itemId) => update('itemIds', draft.itemIds.includes(itemId) ? draft.itemIds.filter((id) => id !== itemId) : [...draft.itemIds, itemId]);
  const save = async () => {
    if (!draft.name.trim()) {
      setError('Give this setup a name.');
      return;
    }
    setBusy(true);
    try { await onSave(draft); } catch (nextError) { setError(nextError?.message || 'The setup could not be saved.'); setBusy(false); }
  };
  const confirmDelete = () => Alert.alert('Delete setup?', 'The setup and its packing checks will be removed. Your gear and files will stay in the locker.', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Delete', style: 'destructive', onPress: onDelete },
  ]);
  const sorted = sortGear(items);
  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.screen}>
      <ScreenHeader eyebrow="DIVE SETUP" title={isEditing ? 'Edit Setup' : 'New Setup'} onBack={onBack} />
      <ScrollView contentContainerStyle={styles.formContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <FieldSection title="Setup details" body="Name the complete configuration the way you talk about it before a dive.">
          <FormField autoCapitalize="words" label="Setup name" maxLength={100} onChangeText={(value) => update('name', value)} placeholder="Lake doubles" value={draft.name} />
          <ChoiceGroup choices={SETUP_TYPES} label="Setup type" onChange={(value) => update('type', value)} value={draft.type} />
          <NotesField label="Description" onChangeText={(value) => update('description', value)} placeholder="What this setup is intended for…" value={draft.description} />
        </FieldSection>
        <FieldSection title="Gear in this setup" body={`${draft.itemIds.length} of ${items.length} locker items selected. Assemblies include their tracked parts.`}>
          {sorted.length ? sorted.map((item) => <SelectRow checked={draft.itemIds.includes(item.id)} key={item.id} label={item.name} body={[item.category, item.manufacturer, item.model].filter(Boolean).join(' · ')} onPress={() => toggleItem(item.id)} />) : <Text style={styles.formEmpty}>Your gear locker is empty. Save this setup, then add gear to it from the inventory.</Text>}
        </FieldSection>
        <FormError message={error} />
        <PrimaryButton disabled={busy} label={busy ? 'Saving setup…' : 'Save setup'} onPress={save} />
        {isEditing ? <SecondaryButton label="Delete setup" onPress={confirmDelete} style={styles.deleteButton} /> : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function SetupDetail({ setup, items, onAddGear, onBack, onEdit, onReset, onToggle }) {
  const available = sortGear(items.filter((item) => setup.itemIds.includes(item.id)));
  const progress = setupProgress(setup);
  const grouped = GEAR_CATEGORIES.map((category) => ({ category, items: available.filter((item) => item.category === category) })).filter((group) => group.items.length);
  return (
    <View style={styles.screen}>
      <ScreenHeader eyebrow={setup.type.toUpperCase()} title={setup.name} onBack={onBack} action={<TinyAction label="EDIT" onPress={onEdit} />} />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Card style={styles.checklistHero}>
          <View style={styles.checklistHeroTop}><View style={styles.checklistCount}><Text style={styles.checklistCountValue}>{progress.checked}/{progress.total}</Text><Text style={styles.checklistCountLabel}>PACKED</Text></View><Text style={styles.checklistPercent}>{Math.round(progress.ratio * 100)}%</Text></View>
          <ProgressBar value={progress.ratio} color={progress.ratio === 1 && progress.total ? colors.good : colors.cyan} />
          {setup.description ? <Text style={styles.checklistDescription}>{setup.description}</Text> : null}
          <View style={styles.setupActions}>
            <TinyAction label="ADD NEW GEAR" onPress={onAddGear} />
            {progress.checked ? <TinyAction label="RESET CHECKS" onPress={onReset} /> : null}
          </View>
        </Card>
        {grouped.length ? grouped.map((group) => (
          <View key={group.category} style={styles.checkCategory}>
            <View style={styles.sectionRow}><Text style={styles.sectionTitle}>{group.category}</Text><Text style={styles.sectionMeta}>{group.items.filter((item) => setup.checkedIds.includes(item.id)).length}/{group.items.length}</Text></View>
            <View style={styles.rowGroup}>{group.items.map((item) => <SelectRow checked={setup.checkedIds.includes(item.id)} key={item.id} label={item.name} body={[item.manufacturer, item.model, item.configuration, item.components?.length ? `${item.components.length} parts` : ''].filter(Boolean).join(' · ')} onPress={() => onToggle(item.id)} />)}</View>
          </View>
        )) : <EmptyState title="This setup is empty" body="Add a new locker item here, or tap Edit above to select gear you already own." action="Add new gear" onPress={onAddGear} />}
      </ScrollView>
    </View>
  );
}

function DetailField({ label, value }) {
  if (!value) return null;
  return (
    <View style={styles.detailField}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

function ComponentRow({ component, last }) {
  return (
    <View style={[styles.componentRow, !last && styles.rowBorder]}>
      <View style={styles.gearRowCopy}>
        <Text style={styles.selectTitle}>{component.name}</Text>
        <Text style={styles.selectBody}>{[component.type, component.manufacturer, component.model].filter(Boolean).join(' · ')}</Text>
        {component.notes ? <Text style={styles.componentNotes}>{component.notes}</Text> : null}
        <ServiceBadge item={component} />
      </View>
    </View>
  );
}

// A locker item that's linked in (a hood, boots) — not a buried description, its own gear with
// its own service history — so tapping it opens that item's own detail view, not this one's edit form.
function AccessoryRow({ item, last, onPress }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`Open ${item.name}`} onPress={onPress} style={({ pressed }) => [styles.gearRow, !last && styles.rowBorder, pressed && styles.rowPressed]}>
      <View style={styles.categoryGlyph}><Text style={styles.categoryGlyphText}>{item.category.slice(0, 2).toUpperCase()}</Text></View>
      <View style={styles.gearRowCopy}>
        <Text numberOfLines={1} style={styles.gearName}>{item.name}</Text>
        <Text numberOfLines={1} style={styles.gearMeta}>{[item.manufacturer, item.model, item.category].filter(Boolean).join(' · ')}</Text>
        <ServiceBadge item={item} />
      </View>
      <Text style={styles.chevron}>›</Text>
    </Pressable>
  );
}

function GearItemDetail({ item, items, setups, onBack, onEdit, onOpenAccessory }) {
  const memberships = setups.filter((setup) => setup.itemIds.includes(item.id));
  const accessories = accessoryItemsForItem(items, item);
  const usedIn = parentItemsForAccessory(items, item.id);
  const openAttachment = async (attachment) => {
    try {
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(attachment.uri, { mimeType: attachment.mimeType || undefined, dialogTitle: attachment.name });
      } else Alert.alert('File saved', 'This device cannot open the system file sheet, but the attachment remains saved with this gear item.');
    } catch {
      Alert.alert('Could not open file', 'The attachment is still listed, but the system file sheet could not open it.');
    }
  };
  return (
    <View style={styles.screen}>
      <ScreenHeader eyebrow={item.category.toUpperCase()} title={item.name} onBack={onBack} action={<TinyAction label="EDIT" onPress={onEdit} />} />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Card style={styles.detailHero}>
          <ServiceBadge item={item} includeParts />
          <Text style={styles.detailMeta}>{[item.manufacturer, item.model, item.configuration].filter(Boolean).join(' · ') || 'No manufacturer or model set'}</Text>
          <View style={styles.detailGrid}>
            <DetailField label="Serial" value={item.serialNumber} />
            <DetailField label="Size" value={item.size} />
            <DetailField label="Thickness" value={item.thickness} />
            <DetailField label="Color" value={item.color} />
            <DetailField label="Weight" value={item.weight} />
            <DetailField label="Capacity / lift" value={item.capacity} />
            <DetailField label="Working pressure" value={item.workingPressure} />
            <DetailField label="Quantity" value={item.quantity && item.quantity !== '1' ? item.quantity : ''} />
          </View>
        </Card>

        {item.components.length ? (
          <View style={styles.sectionGroup}>
            <View style={styles.sectionRow}><Text style={styles.sectionTitle}>Tracked parts</Text><Text style={styles.sectionMeta}>{item.components.length}</Text></View>
            <View style={styles.rowGroup}>{item.components.map((component, index) => <ComponentRow component={component} key={component.id || index} last={index === item.components.length - 1} />)}</View>
          </View>
        ) : null}

        {accessories.length ? (
          <View style={styles.sectionGroup}>
            <View style={styles.sectionRow}><Text style={styles.sectionTitle}>Includes</Text><Text style={styles.sectionMeta}>{accessories.length}</Text></View>
            <View style={styles.rowGroup}>{accessories.map((accessory, index) => <AccessoryRow item={accessory} key={accessory.id} last={index === accessories.length - 1} onPress={() => onOpenAccessory(accessory.id)} />)}</View>
          </View>
        ) : null}

        {usedIn.length ? (
          <View style={styles.sectionGroup}>
            <Text style={styles.sectionTitle}>Part of</Text>
            <Text numberOfLines={2} style={styles.listMembership}>{usedIn.map((parent) => parent.name).join('  ·  ')}</Text>
          </View>
        ) : null}

        {memberships.length ? (
          <View style={styles.sectionGroup}>
            <Text style={styles.sectionTitle}>In these setups</Text>
            <Text numberOfLines={2} style={styles.listMembership}>{memberships.map((setup) => setup.name).join('  ·  ')}</Text>
          </View>
        ) : null}

        {item.lastServiceDate || item.nextServiceDate || item.serviceIntervalMonths || item.serviceNotes || item.visualInspectionDue || item.hydrostaticTestDue ? (
          <View style={styles.sectionGroup}>
            <Text style={styles.sectionTitle}>Service</Text>
            <View style={styles.detailGrid}>
              <DetailField label="Last service" value={item.lastServiceDate} />
              <DetailField label="Next service" value={item.nextServiceDate} />
              <DetailField label="Repeat every" value={item.serviceIntervalMonths ? `${item.serviceIntervalMonths} months` : ''} />
              <DetailField label="Visual due" value={item.visualInspectionDue} />
              <DetailField label="Hydro due" value={item.hydrostaticTestDue} />
            </View>
            {item.serviceNotes ? <Text style={styles.detailValue}>{item.serviceNotes}</Text> : null}
          </View>
        ) : null}

        {item.purchaseDate || item.purchasePrice || item.retailer || item.warrantyUntil ? (
          <View style={styles.sectionGroup}>
            <Text style={styles.sectionTitle}>Ownership & warranty</Text>
            <View style={styles.detailGrid}>
              <DetailField label="Purchased" value={item.purchaseDate} />
              <DetailField label="Price" value={item.purchasePrice} />
              <DetailField label="Retailer" value={item.retailer} />
              <DetailField label="Warranty until" value={item.warrantyUntil} />
            </View>
          </View>
        ) : null}

        {item.attachments.length ? (
          <View style={styles.sectionGroup}>
            <Text style={styles.sectionTitle}>Photos & documents</Text>
            {item.attachments.map((attachment) => (
              <Pressable key={attachment.id} onPress={() => openAttachment(attachment)} style={styles.attachmentRow}>
                {attachment.kind === 'photo' ? <Image source={{ uri: attachment.uri }} style={styles.attachmentImage} /> : <View style={styles.documentIcon}><Text style={styles.documentIconText}>DOC</Text></View>}
                <View style={styles.attachmentCopy}>
                  <Text numberOfLines={1} style={styles.attachmentName}>{attachment.name}</Text>
                  <Text style={styles.attachmentMeta}>{attachment.kind === 'photo' ? 'PHOTO' : (attachment.mimeType || 'DOCUMENT').toUpperCase()}</Text>
                </View>
              </Pressable>
            ))}
          </View>
        ) : null}

        {item.notes ? (
          <View style={styles.sectionGroup}>
            <Text style={styles.sectionTitle}>Notes</Text>
            <Text style={styles.detailValue}>{item.notes}</Text>
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

export default function GearChecklistScreen({ onBack }) {
  const gear = useGearChecklist();
  const [tab, setTab] = useState('inventory');
  const [route, setRoute] = useState({ name: 'home' });
  const activeItem = route.itemId ? gear.state.items.find((item) => item.id === route.itemId) : null;
  const activeSetup = route.setupId ? gear.state.setups.find((setup) => setup.id === route.setupId) : null;

  if (route.name === 'add-gear-wizard') {
    const leaveTo = route.setupId ? { name: 'setup', setupId: route.setupId } : { name: 'home' };
    return (
      <AddGearWizard
        defaultSetupId={route.setupId}
        items={gear.state.items}
        onCancel={() => setRoute(leaveTo)}
        onPickOtherCategory={(category) => setRoute({ name: 'gear-form', setupId: route.setupId, presetCategory: category || undefined })}
        onSave={async ({ item, pendingAccessories }) => {
          const created = [];
          for (const accessory of pendingAccessories) {
            // Sequential on purpose: each new accessory needs a real id before the parent can link it.
            // eslint-disable-next-line no-await-in-loop
            created.push(await gear.saveItem(accessory));
          }
          const saved = await gear.saveItem({ ...item, accessoryItemIds: [...item.accessoryItemIds, ...created.map((entry) => entry.id)] });
          setRoute({ name: 'gear-detail', itemId: saved.id, setupId: route.setupId });
        }}
      />
    );
  }
  if (route.name === 'gear-detail' && activeItem) {
    return (
      <GearItemDetail
        item={activeItem}
        items={gear.state.items}
        setups={gear.state.setups}
        onBack={() => setRoute(route.setupId ? { name: 'setup', setupId: route.setupId } : { name: 'home' })}
        onEdit={() => setRoute({ name: 'gear-form', itemId: activeItem.id, setupId: route.setupId })}
        onOpenAccessory={(accessoryId) => setRoute({ name: 'gear-detail', itemId: accessoryId })}
      />
    );
  }
  if (route.name === 'gear-form') {
    const returnRoute = activeItem ? { name: 'gear-detail', itemId: activeItem.id, setupId: route.setupId } : (route.setupId ? { name: 'setup', setupId: route.setupId } : { name: 'home' });
    return (
      <GearItemForm
        item={activeItem}
        setups={gear.state.setups}
        defaultSetupId={route.setupId}
        presetCategory={route.presetCategory}
        onBack={() => setRoute(returnRoute)}
        onDelete={activeItem ? async () => { await gear.deleteItem(activeItem.id); setRoute({ name: 'home' }); } : undefined}
        onSave={async (draft) => { const saved = await gear.saveItem(draft); setRoute({ name: 'gear-detail', itemId: saved.id, setupId: route.setupId }); }}
      />
    );
  }
  if (route.name === 'setup-form') {
    return (
      <SetupForm
        items={gear.state.items}
        setup={activeSetup}
        onBack={() => setRoute(activeSetup ? { name: 'setup', setupId: activeSetup.id } : { name: 'home' })}
        onDelete={activeSetup ? async () => { await gear.deleteSetup(activeSetup.id); setRoute({ name: 'home' }); } : undefined}
        onSave={async (draft) => { const saved = await gear.saveSetup(draft); setRoute({ name: 'setup', setupId: saved.id }); }}
      />
    );
  }
  if (route.name === 'setup' && activeSetup) {
    return (
      <SetupDetail
        items={gear.state.items}
        setup={activeSetup}
        onAddGear={() => setRoute({ name: 'add-gear-wizard', setupId: activeSetup.id })}
        onBack={() => setRoute({ name: 'home' })}
        onEdit={() => setRoute({ name: 'setup-form', setupId: activeSetup.id })}
        onReset={() => gear.resetSetup(activeSetup.id)}
        onToggle={(itemId) => gear.toggleChecked(activeSetup.id, itemId)}
      />
    );
  }

  return (
    <View style={styles.screen}>
      <ScreenHeader eyebrow="DIVE WORKBENCH" title="Gear Locker" onBack={onBack} />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.pageTitle}>Pack with confidence.</Text>
        <Text style={styles.pageBody}>Track complete gear, its individual parts, service needs, and reusable dive setups—all stored privately on this device.</Text>
        <View style={styles.tabs}>
          <SecondaryButton label="Inventory" onPress={() => setTab('inventory')} selected={tab === 'inventory'} style={styles.tab} />
          <SecondaryButton label="Setups" onPress={() => setTab('setups')} selected={tab === 'setups'} style={styles.tab} />
          <SecondaryButton label="Service" onPress={() => setTab('service')} selected={tab === 'service'} style={styles.tab} />
        </View>
        <FormError message={gear.error} />
        {!gear.loaded ? <Text style={styles.loading}>Opening your gear locker…</Text> : null}
        {gear.loaded && tab === 'inventory' ? <InventoryHome state={gear.state} onAdd={() => setRoute({ name: 'add-gear-wizard' })} onOpen={(item) => setRoute({ name: 'gear-detail', itemId: item.id })} /> : null}
        {gear.loaded && tab === 'setups' ? <SetupsHome state={gear.state} onAdd={() => setRoute({ name: 'setup-form' })} onOpen={(setup) => setRoute({ name: 'setup', setupId: setup.id })} /> : null}
        {gear.loaded && tab === 'service' ? <ServiceHome state={gear.state} onOpen={(item) => setRoute({ name: 'gear-detail', itemId: item.id })} /> : null}
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
  componentCount: { color: colors.gold, fontSize: 8, fontWeight: '900', letterSpacing: 0.7, marginTop: 4 },
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
  setupType: { color: colors.cyan, fontSize: 8, fontWeight: '900', letterSpacing: 0.9, marginTop: 2 },
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
  serviceEntry: { alignItems: 'center', flexDirection: 'row', minHeight: 78, padding: 12 },
  serviceEntryCopy: { flex: 1 },
  field: { marginBottom: 14 },
  fieldLabel: { color: colors.muted, fontSize: 11, fontWeight: '800', letterSpacing: 0.45, marginBottom: 7, textTransform: 'uppercase' },
  notesInput: { backgroundColor: colors.backgroundRaised, borderColor: colors.lineStrong, borderRadius: radii.md, borderWidth: 1, color: colors.text, fontSize: 15, fontWeight: '600', minHeight: 94, padding: 13 },
  formCard: { padding: spacing.md },
  formTitle: { color: colors.text, fontSize: 18, fontWeight: '900' },
  formBody: { color: colors.muted, fontSize: 11, lineHeight: 17, marginBottom: 15, marginTop: 4 },
  formEmpty: { color: colors.faint, fontSize: 11, lineHeight: 17, paddingVertical: 4 },
  componentTemplateButton: { marginBottom: 12 },
  componentEditor: { backgroundColor: colors.backgroundRaised, borderColor: colors.lineStrong, borderRadius: radii.md, borderWidth: 1, marginBottom: 12, padding: 12 },
  componentHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  componentTitle: { color: colors.cyan, flex: 1, fontSize: 14, fontWeight: '900', marginRight: 8 },
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
  setupActions: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  checkCategory: { marginBottom: 5 },
  detailHero: { gap: 8, padding: 15 },
  detailMeta: { color: colors.muted, fontSize: 13, fontWeight: '600' },
  detailGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, marginTop: 8 },
  detailField: { minWidth: '30%' },
  detailLabel: { color: colors.faint, fontSize: 9, fontWeight: '900', letterSpacing: 0.6, marginBottom: 2, textTransform: 'uppercase' },
  detailValue: { color: colors.text, fontSize: 13, fontWeight: '700', lineHeight: 19 },
  sectionGroup: { marginBottom: 4, marginTop: 18 },
  componentRow: { flexDirection: 'row', gap: 11, padding: 11 },
  componentNotes: { color: colors.faint, fontSize: 10, lineHeight: 15, marginTop: 3 },
  pressed: { opacity: 0.74, transform: [{ scale: 0.985 }] },
});
