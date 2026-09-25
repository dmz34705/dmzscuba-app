import { useEffect, useMemo, useState } from 'react';
import { Alert, Linking, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

import { ScreenHeader } from '../components/AppShell';
import DateField from '../components/DateField';
import { ProgressBar } from '../components/Ui';
import { checklistEntriesForItem, includedWithSelection, setupProgress } from '../features/gearChecklist/model';
import PlanEditor from '../features/planner/PlanEditor';
import SegmentEditor from '../features/planner/SegmentEditor';
import usePlanner from '../features/planner/usePlanner';
import { planDives } from '../features/siteDives/siteMatch';
import {
  SEGMENT_TYPES, STATUS_LABELS, cardsFor, certLabel, emptyPlan, formatDay, formatRange, formatTime, normalizePlan, normalizeSegment,
  parseDay, planPhase, planTimeline, planTitle, readinessSummary, sortPlans,
} from '../features/planner/model';
import { colors, radii, spacing } from '../theme';

const TONES = { danger: colors.danger, warning: colors.warning, info: colors.cyan, good: colors.good };
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const GLYPHS = {
  flight: 'M3 13.5 21 6l-4.5 15-4.2-6.3L3 13.5Zm9.3 1.2L21 6',
  transfer: 'M5 16.5h14M6.5 16.5 8 11h8l1.5 5.5M5 16.5v2h2.5v-2m9 0v2H19v-2',
  ferry: 'M3 18c2 1.4 4 1.4 6 0s4-1.4 6 0 4 1.4 6 0M5 15l1-5h12l1 5M9.5 10V6.5h5V10',
  stay: 'M3 18V7m0 7h18v4m0-4v-1.5A2.5 2.5 0 0 0 18.5 10H11v4M7 12.5h.01',
  liveaboard: 'M3 18c2 1.4 4 1.4 6 0s4-1.4 6 0 4 1.4 6 0M4 15h16l-2 -4H6l-2 4ZM8 11V7h5l3 4',
  diving: 'M4 9h16v4.5a2.5 2.5 0 0 1-2.5 2.5H15l-3-2-3 2H6.5A2.5 2.5 0 0 1 4 13.5V9Z',
  other: 'M12 8v8M8 12h8',
  check: 'M5 12.5 10 17l9-10',
};
const Glyph = ({ name, color = colors.cyan, size = 18 }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none"><Path d={GLYPHS[name] || GLYPHS.other} stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" /></Svg>
);

function DateBlock({ date, tone = colors.cyan }) {
  const day = parseDay(date);
  return (
    <View style={[styles.dateBlock, { borderColor: `${tone}55` }]}>
      <Text style={[styles.dateMonth, { color: tone }]}>{day ? MONTHS[day.getUTCMonth()] : '—'}</Text>
      <Text style={styles.dateDay}>{day ? day.getUTCDate() : '?'}</Text>
    </View>
  );
}

function Pill({ label, tone = colors.cyan }) {
  return <View style={[styles.pill, { borderColor: `${tone}66`, backgroundColor: `${tone}14` }]}><Text style={[styles.pillText, { color: tone }]}>{label}</Text></View>;
}

function Section({ title, action, onAction, children }) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHead}>
        <Text accessibilityRole="header" style={styles.sectionTitle}>{title}</Text>
        {action ? <Pressable accessibilityRole="button" hitSlop={10} onPress={onAction}><Text style={styles.sectionAction}>{action}</Text></Pressable> : null}
      </View>
      {children}
    </View>
  );
}

function Row({ label, value, onPress, last }) {
  if (!value) return null;
  return (
    <Pressable accessibilityRole={onPress ? 'button' : undefined} disabled={!onPress} onPress={onPress} style={({ pressed }) => [styles.row, !last && styles.rowBorder, pressed && styles.rowPressed]}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={[styles.rowValue, onPress && styles.link]} numberOfLines={2}>{value}</Text>
    </Pressable>
  );
}

// --- list -------------------------------------------------------------------
function PlanRow({ plan, alerts, onPress, last, logged = 0 }) {
  const phase = planPhase(plan);
  const summary = readinessSummary(alerts);
  const cancelled = plan.status === 'cancelled';
  const sub = [plan.kind === 'trip' ? formatRange(plan.startDate, plan.endDate) : [formatDay(plan.startDate, { weekday: true }), formatTime(plan.startTime)].filter(Boolean).join(' · '), plan.operator.name].filter(Boolean).join(' · ');
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${planTitle(plan)}, ${sub}`} onPress={onPress} style={({ pressed }) => [styles.planRow, !last && styles.rowBorder, pressed && styles.rowPressed]}>
      <DateBlock date={plan.startDate} tone={cancelled || phase.key === 'past' ? colors.faint : plan.kind === 'trip' ? colors.gold : colors.cyan} />
      <View style={styles.flex}>
        <Text style={[styles.planTitle, cancelled && styles.struck]} numberOfLines={1}>{planTitle(plan)}</Text>
        <Text style={styles.planSub} numberOfLines={1}>{sub}</Text>
        {phase.key !== 'past' && !cancelled ? (
          <View style={styles.planMeta}>
            <Text style={styles.planPhase}>{phase.label}</Text>
            <View style={[styles.dot, { backgroundColor: TONES[summary.tone] }]} />
            <Text style={[styles.planReady, { color: TONES[summary.tone] }]}>{summary.label}</Text>
          </View>
        ) : <Text style={[styles.planPhase, logged && !cancelled ? { color: colors.good } : null]}>{cancelled ? 'Cancelled' : logged ? `Dived ✓ · ${logged} ${logged === 1 ? 'dive' : 'dives'} logged` : phase.label}</Text>}
      </View>
      <Text style={styles.chevron}>›</Text>
    </Pressable>
  );
}

function NextUp({ plan, alerts, onPress }) {
  const phase = planPhase(plan);
  const summary = readinessSummary(alerts);
  const trip = plan.kind === 'trip';
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [pressed && styles.pressed]}>
      <LinearGradient colors={trip ? ['#2A2410', '#0B1C2E'] : ['#0E3550', '#0B1C2E']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
        <View style={styles.heroTop}>
          <Text style={[styles.heroEyebrow, { color: trip ? colors.gold : colors.cyan }]}>NEXT UP · {trip ? 'DIVE TRIP' : 'DIVE DAY'}</Text>
          <Text style={styles.heroCountdown}>{phase.label}</Text>
        </View>
        <Text style={styles.heroTitle} numberOfLines={2}>{planTitle(plan)}</Text>
        <Text style={styles.heroSub}>{trip ? formatRange(plan.startDate, plan.endDate) : [formatDay(plan.startDate, { weekday: true, year: true }), formatTime(plan.startTime)].filter(Boolean).join(' · ')}</Text>
        {plan.destination.name && plan.title ? <Text style={styles.heroSub}>{plan.destination.name}</Text> : null}
        <View style={[styles.heroStatus, { borderColor: `${TONES[summary.tone]}55` }]}>
          <View style={[styles.dot, { backgroundColor: TONES[summary.tone] }]} />
          <Text style={[styles.heroStatusLabel, { color: TONES[summary.tone] }]}>{summary.label}</Text>
          <Text style={styles.heroStatusText} numberOfLines={2}>{summary.headline}</Text>
        </View>
      </LinearGradient>
    </Pressable>
  );
}

function KindPicker({ visible, onPick, onClose }) {
  const insets = useSafeAreaInsets();
  const Option = ({ kind, title, body, tone }) => (
    <Pressable accessibilityRole="button" onPress={() => onPick(kind)} style={({ pressed }) => [styles.kindOption, { borderColor: `${tone}55` }, pressed && styles.pressed]}>
      <View style={[styles.kindIcon, { backgroundColor: `${tone}18` }]}><Glyph color={tone} name={kind === 'trip' ? 'flight' : 'diving'} size={22} /></View>
      <View style={styles.flex}><Text style={styles.kindTitle}>{title}</Text><Text style={styles.kindBody}>{body}</Text></View>
    </Pressable>
  );
  return (
    <Modal animationType="fade" onRequestClose={onClose} transparent visible={visible}>
      <Pressable onPress={onClose} style={styles.backdrop}>
        <Pressable onPress={(e) => e.stopPropagation()} style={[styles.pickerSheet, { paddingBottom: insets.bottom + spacing.md }]}>
          <Text style={styles.pickerTitle}>What are you planning?</Text>
          <Option body="A shore dive, a charter or a local boat trip — one day, one plan." kind="day" title="Dive day" tone={colors.cyan} />
          <Option body="Flights, transfers, stays and dive days, with travel and paperwork checks." kind="trip" title="Dive trip" tone={colors.gold} />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// --- plan detail --------------------------------------------------------------
const ACTION_LABELS = { gear: 'Open Gear Locker', setup: 'Choose setup', account: 'Open profile', logbook: 'Open logbook', requirements: 'Edit requirements' };

function AlertRow({ alert, onAction, last }) {
  const tone = TONES[alert.tone];
  const label = ACTION_LABELS[alert.action];
  return (
    <View style={[styles.alert, !last && styles.rowBorder]}>
      <View style={[styles.alertBar, { backgroundColor: tone }]} />
      <View style={styles.flex}>
        <Text style={styles.alertTitle}>{alert.title}</Text>
        <Text style={styles.alertDetail}>{alert.detail}</Text>
        {label ? <Pressable accessibilityRole="button" hitSlop={8} onPress={() => onAction(alert.action)}><Text style={[styles.alertAction, { color: tone }]}>{label} ›</Text></Pressable> : null}
      </View>
    </View>
  );
}

function LegRow({ leg, onPress, variant = 'start' }) {
  const type = SEGMENT_TYPES[leg.type];
  const time = variant === 'end' ? formatTime(leg.endTime) : formatTime(leg.startTime);
  const title = variant === 'continuing' ? `Staying · ${leg.title || leg.provider || type.label}` : variant === 'end' ? `${leg.type === 'stay' ? 'Check out' : 'Disembark'} · ${leg.title || leg.provider || type.label}` : leg.title || leg.provider || type.label;
  const route = leg.type === 'flight' || leg.type === 'transfer' || leg.type === 'ferry' ? [leg.from, leg.to].filter(Boolean).join(' → ') : leg.from;
  const arrival = variant === 'start' && leg.endTime && (leg.type === 'flight' || leg.type === 'transfer' || leg.type === 'ferry') ? `arrives ${formatTime(leg.endTime)}${leg.endDate && leg.endDate !== leg.startDate ? ` (${formatDay(leg.endDate)})` : ''}` : '';
  const sub = variant === 'start' ? [route, arrival, leg.type !== 'flight' && leg.provider && leg.provider !== title ? leg.provider : leg.type === 'flight' ? leg.provider : '', leg.dives ? `${leg.dives} dives` : '', leg.reference ? `Conf. ${leg.reference}` : ''].filter(Boolean).join(' · ') : '';
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.leg, variant !== 'start' && styles.legQuiet, pressed && styles.rowPressed]}>
      <View style={styles.legTime}><Text style={styles.legTimeText}>{time || (variant === 'start' ? '—' : '')}</Text></View>
      <View style={[styles.legIcon, variant !== 'start' && styles.legIconQuiet]}><Glyph color={variant === 'start' ? colors.cyan : colors.faint} name={leg.type} size={16} /></View>
      <View style={styles.flex}>
        <Text style={[styles.legTitle, variant !== 'start' && styles.legTitleQuiet]} numberOfLines={2}>{title}</Text>
        {sub ? <Text style={styles.legSub} numberOfLines={3}>{sub}</Text> : null}
      </View>
    </Pressable>
  );
}

function PackingList({ setup, items, onToggle }) {
  const byId = new Map(items.map((item) => [item.id, item]));
  const packedWith = includedWithSelection(setup.itemIds, items, setup.accessoryChoices);
  const checked = new Set(setup.checkedIds);
  const entries = setup.itemIds.map((id) => byId.get(id)).filter((item) => item && !packedWith.has(item.id));
  if (!entries.length) return <Text style={styles.empty}>This setup has no gear yet. Add equipment to it in your Gear Locker.</Text>;
  return entries.map((item, index) => {
    const { itemKey, parts } = checklistEntriesForItem(item, items, setup);
    // As in the Gear Locker: the item counts as packed when it and every part are, and ticking it
    // ticks (or clears) them all at once; parts can still be ticked one by one.
    const allKeys = [itemKey, ...parts.map((part) => part.key)];
    const allChecked = allKeys.every((key) => checked.has(key));
    const someChecked = allKeys.some((key) => checked.has(key));
    const Check = ({ keys, on, partial, label, meta, nested }) => (
      <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: partial ? 'mixed' : on }} onPress={() => onToggle(keys, !on)} style={({ pressed }) => [styles.check, nested && styles.checkNested, pressed && styles.rowPressed]}>
        <View style={[styles.box, on && styles.boxOn, partial && styles.boxPartial]}>{on ? <Glyph color={colors.background} name="check" size={14} /> : partial ? <View style={styles.boxDash} /> : null}</View>
        <View style={styles.flex}>
          <Text style={[styles.checkLabel, on && styles.checkDone, nested && styles.checkLabelNested]} numberOfLines={1}>{label}</Text>
          {meta ? <Text style={styles.checkMeta} numberOfLines={1}>{meta}</Text> : null}
        </View>
      </Pressable>
    );
    const parentMeta = [item.category, parts.length ? `${parts.length} part${parts.length === 1 ? '' : 's'}${someChecked && !allChecked ? ' · partly packed' : ''}` : ''].filter(Boolean).join(' · ');
    return (
      <View key={item.id} style={index < entries.length - 1 && styles.rowBorder}>
        <Check keys={parts.length ? allKeys : [itemKey]} label={item.name} meta={parentMeta} on={parts.length ? allChecked : checked.has(itemKey)} partial={parts.length > 0 && someChecked && !allChecked} />
        {parts.map((part) => <Check key={part.key} keys={[part.key]} label={part.label} meta={part.meta} nested on={checked.has(part.key)} />)}
      </View>
    );
  });
}

function SetupPicker({ visible, setups, items, value, onPick, onClose }) {
  const insets = useSafeAreaInsets();
  return (
    <Modal animationType="fade" onRequestClose={onClose} transparent visible={visible}>
      <Pressable onPress={onClose} style={styles.backdrop}>
        <Pressable onPress={(e) => e.stopPropagation()} style={[styles.pickerSheet, { paddingBottom: insets.bottom + spacing.md }]}>
          <Text style={styles.pickerTitle}>Which gear are you bringing?</Text>
          <ScrollView style={styles.pickerList}>
            {setups.map((setup) => {
              const progress = setupProgress(setup, items);
              return (
                <Pressable key={setup.id} accessibilityRole="radio" accessibilityState={{ checked: setup.id === value }} onPress={() => onPick(setup.id)} style={({ pressed }) => [styles.setupOption, setup.id === value && styles.setupOptionOn, pressed && styles.pressed]}>
                  <View style={styles.flex}><Text style={styles.kindTitle}>{setup.name}</Text><Text style={styles.kindBody}>{setup.type} · {progress.total} items to pack</Text></View>
                  {setup.id === value ? <Glyph name="check" /> : null}
                </Pressable>
              );
            })}
            {!setups.length ? <Text style={styles.empty}>No setups yet. Create one in your Gear Locker — a setup is the gear you take on a dive, with its own packing checklist.</Text> : null}
            {value ? <Pressable accessibilityRole="button" onPress={() => onPick('')} style={styles.setupNone}><Text style={styles.sectionAction}>No setup</Text></Pressable> : null}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function PlanDetail({ plan, planner, certifications, signedIn, onEdit, onBack, onOpenTool }) {
  const [segment, setSegment] = useState(null);
  const [pickSetup, setPickSetup] = useState(false);
  const [task, setTask] = useState('');
  const alerts = planner.alertsFor(plan);
  const summary = readinessSummary(alerts);
  const phase = planPhase(plan);
  const trip = plan.kind === 'trip';
  const setup = planner.gear.setups.find((entry) => entry.id === plan.setupId) || null;
  const progress = setup ? setupProgress(setup, planner.gear.items) : null;
  const timeline = trip ? planTimeline(plan) : null;
  const liveDives = planner.dives.filter((row) => row && !row.deletedAt).length;
  // Dives the logbook has linked to this plan's site on its dates (computer + location → verified).
  const logged = planDives(plan, planner.dives);
  const verifiedCount = logged.filter((row) => row.siteVerification === 'verified').length;
  const save = (patch) => planner.savePlan({ ...plan, ...patch }).catch((error) => Alert.alert('Not saved', error?.message || 'Try again.'));
  const act = (action) => {
    if (action === 'gear') onOpenTool('gear-checklist');
    else if (action === 'setup') setPickSetup(true);
    else if (action === 'account') onOpenTool(signedIn ? 'account-profile' : 'account-login');
    else if (action === 'logbook') onOpenTool('dive-log');
    else if (action === 'requirements') onEdit();
  };
  const saveSegment = (next) => {
    const segments = plan.segments.some((leg) => leg.id === next.id) ? plan.segments.map((leg) => (leg.id === next.id ? next : leg)) : [...plan.segments, next];
    save({ segments }); setSegment(null);
  };
  const addLeg = () => setSegment({ isNew: true, value: normalizeSegment({ type: plan.segments.length ? 'diving' : 'flight', startDate: plan.startDate }) });
  const addTask = () => { const label = task.trim(); if (!label) return; save({ tasks: [...plan.tasks, { label }] }); setTask(''); };
  const remove = () => Alert.alert(`Delete “${planTitle(plan)}”?`, 'This removes the plan and its itinerary from this device.', [
    { text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: () => planner.deletePlan(plan.id).then(onBack) },
  ]);
  const call = (phone) => Linking.openURL(`tel:${phone.replace(/[^+\d]/g, '')}`).catch(() => {});

  return (
    <View style={styles.screen}>
      <ScreenHeader action={<Pressable accessibilityRole="button" hitSlop={10} onPress={onEdit} style={styles.headerButton}><Text style={styles.headerButtonText}>Edit</Text></Pressable>} eyebrow={trip ? 'DIVE TRIP' : 'DIVE DAY'} onBack={onBack} title={planTitle(plan)} />
      <ScrollView contentContainerStyle={styles.content}>
        <LinearGradient colors={trip ? ['#2A2410', '#0B1C2E'] : ['#0E3550', '#0B1C2E']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
          <View style={styles.heroTop}>
            <Pill label={STATUS_LABELS[plan.status].toUpperCase()} tone={plan.status === 'booked' ? colors.good : plan.status === 'cancelled' ? colors.faint : trip ? colors.gold : colors.cyan} />
            <Text style={styles.heroCountdown}>{phase.label}</Text>
          </View>
          <Text style={styles.heroTitle}>{planTitle(plan)}</Text>
          <Text style={styles.heroSub}>{trip ? formatRange(plan.startDate, plan.endDate) : [formatDay(plan.startDate, { weekday: true, year: true }), plan.startTime ? `meet ${formatTime(plan.startTime)}` : ''].filter(Boolean).join(' · ')}</Text>
          {plan.destination.name && plan.title ? <Text style={styles.heroSub}>{plan.destination.name}</Text> : null}
        </LinearGradient>

        {logged.length ? (
          <Section title="Logged">
            <Pressable accessibilityRole="button" onPress={() => onOpenTool('dive-log')} style={({ pressed }) => [styles.card, styles.dived, pressed && styles.pressed]}>
              <View style={styles.divedBadge}><Glyph color={colors.background} name="check" size={18} /></View>
              <View style={styles.flex}>
                <Text style={styles.divedTitle}>Dived{plan.destination.name ? ` ${plan.destination.name}` : ''}</Text>
                <Text style={styles.planSub}>{logged.length} {logged.length === 1 ? 'dive' : 'dives'} logged{verifiedCount ? ` · ${verifiedCount} verified by dive computer and location` : ''}</Text>
              </View>
              <Text style={styles.chevron}>›</Text>
            </Pressable>
          </Section>
        ) : null}

        <Section title="Readiness">
          <View style={styles.card}>
            <View style={[styles.summary, alerts.length && styles.rowBorder]}>
              <View style={[styles.dot, styles.dotLarge, { backgroundColor: TONES[summary.tone] }]} />
              <Text style={[styles.summaryLabel, { color: TONES[summary.tone] }]}>{summary.label}</Text>
              {!alerts.length ? <Text style={styles.summaryText}>{plan.status === 'cancelled' ? 'This plan is cancelled.' : phase.key === 'past' ? 'This plan is complete.' : 'Gear, cards and paperwork all check out.'}</Text> : null}
            </View>
            {alerts.map((alert, index) => <AlertRow key={alert.key} alert={alert} last={index === alerts.length - 1} onAction={act} />)}
          </View>
        </Section>

        {trip ? (
          <Section action="+ Add" onAction={addLeg} title="Itinerary">
            <View style={styles.card}>
              {timeline.days.length ? timeline.days.map((day) => (
                <View key={day.date} style={styles.day}>
                  <Text style={styles.dayLabel}>DAY {day.index} · {formatDay(day.date, { weekday: true }).toUpperCase()}</Text>
                  {day.starts.map((leg) => <LegRow key={leg.id} leg={leg} onPress={() => setSegment({ value: leg })} />)}
                  {day.ends.map((leg) => <LegRow key={`${leg.id}-end`} leg={leg} onPress={() => setSegment({ value: leg })} variant="end" />)}
                  {day.continuing.map((leg) => <LegRow key={`${leg.id}-on`} leg={leg} onPress={() => setSegment({ value: leg })} variant="continuing" />)}
                  {!day.starts.length && !day.ends.length && !day.continuing.length ? <Text style={styles.dayEmpty}>Nothing planned</Text> : null}
                </View>
              )) : <Text style={styles.empty}>Add your flights, transfers, stays and dive days to build the trip day by day.</Text>}
              {timeline.undated.map((leg) => <LegRow key={leg.id} leg={leg} onPress={() => setSegment({ value: leg })} />)}
              <Pressable accessibilityRole="button" onPress={addLeg} style={({ pressed }) => [styles.addRow, pressed && styles.rowPressed]}><Text style={styles.sectionAction}>+ Flight, transfer, stay or dive day</Text></Pressable>
            </View>
          </Section>
        ) : null}

        <Section title={trip ? 'Dive operator' : 'The dive'}>
          <View style={styles.card}>
            {plan.operator.name || plan.operator.meetingPoint || plan.operator.phone || plan.destination.name ? (
              <>
                {!trip ? <Row label="Site" value={[plan.destination.name, plan.destination.custom ? 'My site' : plan.destination.area].filter(Boolean).join(' · ')} /> : null}
                {!trip && Number.isFinite(plan.destination.latitude) ? <Row label="Map" onPress={() => onOpenTool('ocean-atlas', { focus: { siteId: plan.destination.siteId, name: plan.destination.name, latitude: plan.destination.latitude, longitude: plan.destination.longitude } })} value="Open in Ocean Atlas ›" /> : null}
                <Row label={trip ? 'Operator' : 'With'} value={plan.operator.name} />
                {!trip ? <Row label="Meet" value={[plan.startTime ? formatTime(plan.startTime) : '', plan.operator.meetingPoint].filter(Boolean).join(' · ')} /> : null}
                <Row label="Phone" onPress={() => call(plan.operator.phone)} value={plan.operator.phone} />
                <Row label="Email" onPress={() => Linking.openURL(`mailto:${plan.operator.email}`).catch(() => {})} value={plan.operator.email} />
                <Row label="Confirmation" value={plan.operator.confirmation} />
                <Row label="Dives" last value={!trip && plan.dives ? `${plan.dives} planned` : ''} />
              </>
            ) : <Pressable accessibilityRole="button" onPress={onEdit} style={styles.addRow}><Text style={styles.sectionAction}>+ Add operator, meeting point and confirmation</Text></Pressable>}
          </View>
        </Section>

        <Section action="Edit" onAction={onEdit} title="Requirements">
          <View style={styles.card}>
            {plan.requirements.certs.map((key) => {
              const cards = certifications ? cardsFor(certifications, key) : null;
              const ok = cards?.length > 0;
              return (
                <View key={key} style={[styles.row, styles.rowBorder]}>
                  <Text style={styles.rowLabel}>{certLabel(key)}</Text>
                  <Text style={[styles.rowValue, { color: cards == null ? colors.faint : ok ? colors.good : colors.warning }]} numberOfLines={2}>
                    {cards == null ? 'Sign in to check' : ok ? `✓ ${cards[0].agency ? `${cards[0].agency} ` : ''}${cards[0].certificationName}${cards[0].certificationNumber ? ` · ${cards[0].certificationNumber}` : ''}` : 'Not on your profile'}
                  </Text>
                </View>
              );
            })}
            {plan.requirements.minDives ? <Row label="Logged dives" value={`${plan.requirements.minDives} required · you have ${liveDives}`} /> : null}
            {plan.requirements.recentMonths ? <Row label="Recent dive" value={`Within ${plan.requirements.recentMonths} months`} /> : null}
            {[['insurance', 'Dive insurance'], ['medical', 'Medical statement'], ['waiver', 'Forms & waiver']].filter(([key]) => plan.requirements[key]).map(([key, label]) => {
              const on = plan.confirmed[key];
              return (
                <Pressable key={key} accessibilityRole="checkbox" accessibilityState={{ checked: on }} onPress={() => save({ confirmed: { ...plan.confirmed, [key]: !on } })} style={({ pressed }) => [styles.check, styles.rowBorder, pressed && styles.rowPressed]}>
                  <View style={[styles.box, on && styles.boxOn]}>{on ? <Glyph color={colors.background} name="check" size={14} /> : null}</View>
                  <View style={styles.flex}><Text style={[styles.checkLabel, on && styles.checkDone]}>{label}</Text><Text style={styles.checkMeta}>{on ? 'Done' : 'Tap when it’s sorted'}</Text></View>
                </Pressable>
              );
            })}
            {!plan.requirements.certs.length && !plan.requirements.minDives && !plan.requirements.recentMonths && !['insurance', 'medical', 'waiver'].some((key) => plan.requirements[key])
              ? <Pressable accessibilityRole="button" onPress={onEdit} style={styles.addRow}><Text style={styles.sectionAction}>+ Add the operator’s requirements</Text></Pressable> : null}
          </View>
        </Section>

        <Section action={setup ? 'Change' : 'Choose'} onAction={() => setPickSetup(true)} title="Gear & packing">
          <View style={styles.card}>
            {setup ? (
              <>
                <View style={[styles.packHead, styles.rowBorder]}>
                  <View style={styles.flex}><Text style={styles.planTitle}>{setup.name}</Text><Text style={styles.planSub}>{progress.checked} of {progress.total} packed · shared with your Gear Locker</Text></View>
                  <Text style={styles.packPercent}>{progress.total ? Math.round(progress.ratio * 100) : 0}%</Text>
                </View>
                <View style={styles.packBar}><ProgressBar color={progress.ratio === 1 ? colors.good : colors.cyan} value={progress.ratio} /></View>
                <PackingList items={planner.gear.items} onToggle={(keys, checked) => planner.setPacked(setup.id, keys, checked).catch(() => {})} setup={setup} />
                <Pressable accessibilityRole="button" onPress={() => onOpenTool('gear-checklist')} style={({ pressed }) => [styles.addRow, pressed && styles.rowPressed]}><Text style={styles.sectionAction}>Open in Gear Locker ›</Text></Pressable>
              </>
            ) : <Pressable accessibilityRole="button" onPress={() => setPickSetup(true)} style={styles.addRow}><Text style={styles.sectionAction}>+ Choose the gear setup you’re bringing</Text></Pressable>}
          </View>
        </Section>

        {trip ? (
          <Section title="Travel documents">
            <View style={[styles.card, styles.cardPad]}>
              <DateField helper="Many countries require six months’ validity beyond your return." label="Passport expires" onChange={(passportExpiry) => save({ travel: { ...plan.travel, passportExpiry } })} value={plan.travel.passportExpiry} />
            </View>
          </Section>
        ) : null}

        <Section title="To-dos">
          <View style={styles.card}>
            {plan.tasks.map((entry) => (
              <Pressable key={entry.id} accessibilityRole="checkbox" accessibilityState={{ checked: entry.done }} onLongPress={() => save({ tasks: plan.tasks.filter((t) => t.id !== entry.id) })} onPress={() => save({ tasks: plan.tasks.map((t) => (t.id === entry.id ? { ...t, done: !t.done } : t)) })} style={({ pressed }) => [styles.check, styles.rowBorder, pressed && styles.rowPressed]}>
                <View style={[styles.box, entry.done && styles.boxOn]}>{entry.done ? <Glyph color={colors.background} name="check" size={14} /> : null}</View>
                <Text style={[styles.checkLabel, styles.flex, entry.done && styles.checkDone]}>{entry.label}</Text>
              </Pressable>
            ))}
            <View style={styles.taskInputRow}>
              <TextInput accessibilityLabel="Add a to-do" maxLength={200} onChangeText={setTask} onSubmitEditing={addTask} placeholder={trip ? 'Notify bank, buy reef-safe sunscreen…' : 'Fill tanks, check tide times…'} placeholderTextColor={colors.faint} returnKeyType="done" style={styles.taskInput} value={task} />
              <Pressable accessibilityRole="button" disabled={!task.trim()} onPress={addTask} style={[styles.taskAdd, !task.trim() && styles.disabled]}><Text style={styles.taskAddText}>Add</Text></Pressable>
            </View>
          </View>
          {plan.tasks.length ? <Text style={styles.hint}>Tap to tick off · long-press to remove</Text> : null}
        </Section>

        {plan.notes ? <Section title="Notes"><View style={[styles.card, styles.cardPad]}><Text style={styles.notes}>{plan.notes}</Text></View></Section> : null}

        <View style={styles.footerActions}>
          {plan.status !== 'cancelled' ? <Pressable accessibilityRole="button" onPress={() => save({ status: 'cancelled' })} style={({ pressed }) => [styles.footerButton, pressed && styles.pressed]}><Text style={styles.footerText}>Mark cancelled</Text></Pressable>
            : <Pressable accessibilityRole="button" onPress={() => save({ status: 'planned' })} style={({ pressed }) => [styles.footerButton, pressed && styles.pressed]}><Text style={styles.footerText}>Restore plan</Text></Pressable>}
          <Pressable accessibilityRole="button" onPress={remove} style={({ pressed }) => [styles.footerButton, styles.footerDanger, pressed && styles.pressed]}><Text style={[styles.footerText, { color: colors.danger }]}>Delete</Text></Pressable>
        </View>
      </ScrollView>

      <SegmentEditor
        onCancel={() => setSegment(null)}
        onDelete={segment && !segment.isNew ? () => { save({ segments: plan.segments.filter((leg) => leg.id !== segment.value.id) }); setSegment(null); } : null}
        onSave={saveSegment}
        segment={segment?.value || null}
        visible={Boolean(segment)}
      />
      <SetupPicker items={planner.gear.items} onClose={() => setPickSetup(false)} onPick={(setupId) => { save({ setupId }); setPickSetup(false); }} setups={planner.gear.setups} value={plan.setupId} visible={pickSetup} />
    </View>
  );
}

// --- screen -----------------------------------------------------------------
const FILTERS = [['all', 'All'], ['day', 'Dive days'], ['trip', 'Trips']];

export default function PlannerScreen({ account = null, signedIn = false, focusPlanId = null, onBack, onOpenTool }) {
  const certifications = signedIn && Array.isArray(account?.certifications) ? account.certifications : null;
  const planner = usePlanner({ certifications });
  const [openId, setOpenId] = useState(focusPlanId);
  const [filter, setFilter] = useState('all');
  const [showPast, setShowPast] = useState(false);
  const [choosing, setChoosing] = useState(false);
  const [editor, setEditor] = useState(null);
  useEffect(() => { if (focusPlanId) setOpenId(focusPlanId); }, [focusPlanId]);

  const { upcoming, past } = useMemo(() => sortPlans(planner.plans), [planner.plans]);
  const visible = (list) => list.filter((plan) => filter === 'all' || plan.kind === filter);
  const open = planner.plans.find((plan) => plan.id === openId) || null;
  const next = visible(upcoming)[0] || null;

  const startNew = (kind) => { setChoosing(false); setEditor({ plan: emptyPlan(kind), isNew: true }); };
  const saveEditor = async (draft) => {
    const saved = await planner.savePlan(normalizePlan(draft)).catch((error) => { Alert.alert('Not saved', error?.message || 'Try again.'); return null; });
    if (!saved) return;
    if (editor?.isNew) setOpenId(saved.id);
    setEditor(null);
  };

  const editorSheet = <PlanEditor isNew={editor?.isNew} onCancel={() => setEditor(null)} onSave={saveEditor} plan={editor?.plan || null} visible={Boolean(editor)} />;

  if (open) {
    return (
      <>
        <PlanDetail certifications={certifications} onBack={() => setOpenId(null)} onEdit={() => setEditor({ plan: open })} onOpenTool={onOpenTool} plan={open} planner={planner} signedIn={signedIn} />
        {editorSheet}
      </>
    );
  }

  const list = visible(upcoming).slice(next ? 1 : 0);
  const pastList = visible(past);
  return (
    <View style={styles.screen}>
      <ScreenHeader action={<Pressable accessibilityLabel="New plan" accessibilityRole="button" hitSlop={10} onPress={() => setChoosing(true)} style={styles.addButton}><Text style={styles.addButtonText}>+</Text></Pressable>} eyebrow="DIVE PLANNER" onBack={onBack} title="Upcoming" />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.filters}>
          {FILTERS.map(([key, label]) => (
            <Pressable key={key} accessibilityRole="tab" accessibilityState={{ selected: filter === key }} onPress={() => setFilter(key)} style={[styles.filter, filter === key && styles.filterOn]}>
              <Text style={[styles.filterText, filter === key && styles.filterTextOn]}>{label}</Text>
            </Pressable>
          ))}
        </View>

        {!planner.loaded ? <Text style={styles.empty}>Loading your plans…</Text> : null}
        {planner.error ? <Text style={[styles.empty, { color: colors.danger }]}>{planner.error}</Text> : null}

        {next ? <NextUp alerts={planner.alertsFor(next)} onPress={() => setOpenId(next.id)} plan={next} /> : null}

        {planner.loaded && !next ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>{filter === 'trip' ? 'No trips planned' : filter === 'day' ? 'No dive days planned' : 'Nothing planned yet'}</Text>
            <Text style={styles.emptyBody}>Add a dive day or a trip. The planner checks it against your gear service dates, certification cards, logbook and travel times, and flags anything to sort out before you go.</Text>
            <View style={styles.emptyActions}>
              {filter !== 'trip' ? <Pressable accessibilityRole="button" onPress={() => startNew('day')} style={({ pressed }) => [styles.emptyButton, pressed && styles.pressed]}><Glyph name="diving" /><Text style={styles.emptyButtonText}>Plan a dive day</Text></Pressable> : null}
              {filter !== 'day' ? <Pressable accessibilityRole="button" onPress={() => startNew('trip')} style={({ pressed }) => [styles.emptyButton, pressed && styles.pressed]}><Glyph color={colors.gold} name="flight" /><Text style={styles.emptyButtonText}>Plan a trip</Text></Pressable> : null}
            </View>
          </View>
        ) : null}

        {list.length ? (
          <Section title="Coming up">
            <View style={styles.card}>{list.map((plan, index) => <PlanRow key={plan.id} alerts={planner.alertsFor(plan)} last={index === list.length - 1} onPress={() => setOpenId(plan.id)} plan={plan} />)}</View>
          </Section>
        ) : null}

        {pastList.length ? (
          <Section action={showPast ? 'Hide' : `Show ${pastList.length}`} onAction={() => setShowPast((value) => !value)} title="Past & cancelled">
            {showPast ? <View style={styles.card}>{pastList.map((plan, index) => <PlanRow key={plan.id} alerts={[]} last={index === pastList.length - 1} logged={planDives(plan, planner.dives).length} onPress={() => setOpenId(plan.id)} plan={plan} />)}</View> : null}
          </Section>
        ) : null}
      </ScrollView>
      <KindPicker onClose={() => setChoosing(false)} onPick={startNew} visible={choosing} />
      {editorSheet}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: colors.background, flex: 1 },
  content: { padding: spacing.md, paddingBottom: 60 },
  flex: { flex: 1, minWidth: 0 },
  pressed: { opacity: 0.8, transform: [{ scale: 0.99 }] },
  disabled: { opacity: 0.4 },
  addButton: { alignItems: 'center', backgroundColor: colors.surface, borderColor: colors.lineStrong, borderRadius: radii.pill, borderWidth: 1, height: 40, justifyContent: 'center', width: 40 },
  addButtonText: { color: colors.cyan, fontSize: 24, fontWeight: '500', lineHeight: 26 },
  headerButton: { alignItems: 'center', height: 40, justifyContent: 'center', minWidth: 40 },
  headerButtonText: { color: colors.cyan, fontSize: 15, fontWeight: '800' },
  filters: { backgroundColor: colors.backgroundRaised, borderColor: colors.line, borderRadius: radii.md, borderWidth: 1, flexDirection: 'row', marginBottom: spacing.md, padding: 4 },
  filter: { alignItems: 'center', borderRadius: 12, flex: 1, minHeight: 38, justifyContent: 'center' },
  filterOn: { backgroundColor: colors.surfaceSoft },
  filterText: { color: colors.faint, fontSize: 13, fontWeight: '700' },
  filterTextOn: { color: colors.text },
  hero: { borderColor: colors.lineStrong, borderRadius: radii.lg, borderWidth: 1, marginBottom: spacing.lg, padding: spacing.md + 2 },
  heroTop: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  heroEyebrow: { fontSize: 10, fontWeight: '900', letterSpacing: 1.6 },
  heroCountdown: { color: colors.text, fontSize: 13, fontWeight: '800' },
  heroTitle: { color: colors.text, fontSize: 26, fontWeight: '900', letterSpacing: -0.5, lineHeight: 31 },
  heroSub: { color: colors.muted, fontSize: 14, marginTop: 5 },
  heroStatus: { alignItems: 'center', backgroundColor: 'rgba(2,8,16,0.35)', borderRadius: radii.md, borderWidth: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14, padding: 11 },
  heroStatusLabel: { fontSize: 12, fontWeight: '900', letterSpacing: 0.3 },
  heroStatusText: { color: colors.muted, flexBasis: '100%', fontSize: 13, lineHeight: 18 },
  pill: { borderRadius: radii.pill, borderWidth: 1, paddingHorizontal: 9, paddingVertical: 4 },
  pillText: { fontSize: 10, fontWeight: '900', letterSpacing: 1 },
  section: { marginBottom: spacing.lg },
  sectionHead: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginBottom: 9, paddingHorizontal: 2 },
  sectionTitle: { color: colors.muted, fontSize: 11, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase' },
  sectionAction: { color: colors.cyan, fontSize: 13, fontWeight: '800' },
  card: { backgroundColor: colors.surface, borderColor: colors.line, borderRadius: radii.md, borderWidth: 1, overflow: 'hidden' },
  cardPad: { padding: spacing.md, paddingBottom: 2 },
  row: { flexDirection: 'row', gap: 12, minHeight: 50, paddingHorizontal: 14, paddingVertical: 13 },
  rowBorder: { borderBottomColor: colors.line, borderBottomWidth: StyleSheet.hairlineWidth },
  rowPressed: { backgroundColor: colors.surfaceSoft },
  rowLabel: { color: colors.muted, fontSize: 13, fontWeight: '600', width: 104 },
  rowValue: { color: colors.text, flex: 1, fontSize: 14, fontWeight: '600', lineHeight: 20, textAlign: 'right' },
  link: { color: colors.cyan },
  planRow: { alignItems: 'center', flexDirection: 'row', gap: 13, minHeight: 78, paddingHorizontal: 13, paddingVertical: 12 },
  dateBlock: { alignItems: 'center', backgroundColor: colors.backgroundRaised, borderRadius: 12, borderWidth: 1, height: 52, justifyContent: 'center', width: 50 },
  dateMonth: { fontSize: 10, fontWeight: '900', letterSpacing: 1 },
  dateDay: { color: colors.text, fontSize: 20, fontWeight: '900', marginTop: 1 },
  planTitle: { color: colors.text, fontSize: 16, fontWeight: '700' },
  planSub: { color: colors.muted, fontSize: 13, marginTop: 3 },
  planMeta: { alignItems: 'center', flexDirection: 'row', gap: 6, marginTop: 6 },
  planPhase: { color: colors.faint, fontSize: 12, fontWeight: '700', marginTop: 6 },
  planReady: { fontSize: 12, fontWeight: '800', marginTop: 6 },
  struck: { color: colors.faint, textDecorationLine: 'line-through' },
  chevron: { color: colors.faint, fontSize: 24, fontWeight: '300' },
  dot: { borderRadius: 4, height: 8, marginTop: 6, width: 8 },
  dotLarge: { height: 10, marginTop: 0, width: 10, borderRadius: 5 },
  summary: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: 9, minHeight: 50, paddingHorizontal: 14, paddingVertical: 12 },
  summaryLabel: { fontSize: 14, fontWeight: '900' },
  summaryText: { color: colors.muted, fontSize: 13 },
  alert: { flexDirection: 'row', gap: 12, paddingHorizontal: 14, paddingVertical: 13 },
  alertBar: { borderRadius: 2, width: 3 },
  alertTitle: { color: colors.text, fontSize: 15, fontWeight: '700', lineHeight: 20 },
  alertDetail: { color: colors.muted, fontSize: 13, lineHeight: 19, marginTop: 3 },
  alertAction: { fontSize: 13, fontWeight: '800', marginTop: 8 },
  day: { borderBottomColor: colors.line, borderBottomWidth: StyleSheet.hairlineWidth, paddingBottom: 6, paddingTop: 12 },
  dayLabel: { color: colors.cyan, fontSize: 10, fontWeight: '900', letterSpacing: 1.3, marginBottom: 4, paddingHorizontal: 14 },
  dayEmpty: { color: colors.faint, fontSize: 13, paddingHorizontal: 14, paddingVertical: 8 },
  leg: { alignItems: 'flex-start', flexDirection: 'row', gap: 10, paddingHorizontal: 14, paddingVertical: 9 },
  legQuiet: { paddingVertical: 6 },
  legTime: { paddingTop: 7, width: 62 },
  legTimeText: { color: colors.muted, fontSize: 12, fontWeight: '700' },
  legIcon: { alignItems: 'center', backgroundColor: 'rgba(112,221,246,0.1)', borderRadius: 10, height: 32, justifyContent: 'center', width: 32 },
  legIconQuiet: { backgroundColor: 'transparent' },
  legTitle: { color: colors.text, fontSize: 15, fontWeight: '700', lineHeight: 20, paddingTop: 5 },
  legTitleQuiet: { color: colors.muted, fontSize: 13, fontWeight: '600' },
  legSub: { color: colors.muted, fontSize: 12, lineHeight: 17, marginTop: 2 },
  addRow: { alignItems: 'center', justifyContent: 'center', minHeight: 52, paddingHorizontal: 14 },
  packHead: { alignItems: 'center', flexDirection: 'row', gap: 12, paddingHorizontal: 14, paddingVertical: 12 },
  packPercent: { color: colors.cyan, fontSize: 20, fontWeight: '900' },
  packBar: { paddingHorizontal: 14, paddingVertical: 10 },
  check: { alignItems: 'center', flexDirection: 'row', gap: 12, minHeight: 50, paddingHorizontal: 14, paddingVertical: 10 },
  checkNested: { minHeight: 40, paddingLeft: 48, paddingVertical: 6 },
  box: { alignItems: 'center', borderColor: colors.lineStrong, borderRadius: 7, borderWidth: 1.5, height: 24, justifyContent: 'center', width: 24 },
  boxOn: { backgroundColor: colors.good, borderColor: colors.good },
  boxPartial: { borderColor: colors.good },
  boxDash: { backgroundColor: colors.good, borderRadius: 1, height: 2.5, width: 11 },
  checkLabel: { color: colors.text, fontSize: 15, fontWeight: '600' },
  checkLabelNested: { color: colors.muted, fontSize: 13 },
  checkDone: { color: colors.faint, textDecorationLine: 'line-through' },
  checkMeta: { color: colors.faint, fontSize: 11, marginTop: 2 },
  taskInputRow: { alignItems: 'center', flexDirection: 'row', gap: 8, padding: 10 },
  taskInput: { backgroundColor: colors.backgroundRaised, borderColor: colors.line, borderRadius: radii.sm, borderWidth: 1, color: colors.text, flex: 1, fontSize: 15, minHeight: 44, paddingHorizontal: 12 },
  taskAdd: { alignItems: 'center', backgroundColor: 'rgba(112,221,246,0.14)', borderRadius: radii.sm, justifyContent: 'center', minHeight: 44, paddingHorizontal: 16 },
  taskAddText: { color: colors.cyan, fontSize: 14, fontWeight: '800' },
  hint: { color: colors.faint, fontSize: 11, marginTop: 6, paddingHorizontal: 2 },
  notes: { color: colors.text, fontSize: 14, lineHeight: 21, marginBottom: 14 },
  empty: { color: colors.muted, fontSize: 13, lineHeight: 19, padding: 14 },
  emptyCard: { backgroundColor: colors.surface, borderColor: colors.line, borderRadius: radii.lg, borderWidth: 1, marginBottom: spacing.lg, padding: spacing.lg },
  emptyTitle: { color: colors.text, fontSize: 20, fontWeight: '900' },
  emptyBody: { color: colors.muted, fontSize: 14, lineHeight: 21, marginTop: 8 },
  emptyActions: { gap: 10, marginTop: spacing.md },
  emptyButton: { alignItems: 'center', backgroundColor: colors.backgroundRaised, borderColor: colors.lineStrong, borderRadius: radii.md, borderWidth: 1, flexDirection: 'row', gap: 10, minHeight: 52, paddingHorizontal: 14 },
  emptyButtonText: { color: colors.text, fontSize: 15, fontWeight: '800' },
  dived: { alignItems: 'center', borderColor: 'rgba(112,226,163,0.4)', flexDirection: 'row', gap: 12, padding: 14 },
  divedBadge: { alignItems: 'center', backgroundColor: colors.good, borderRadius: 18, height: 36, justifyContent: 'center', width: 36 },
  divedTitle: { color: colors.text, fontSize: 16, fontWeight: '800' },
  footerActions: { flexDirection: 'row', gap: 10, marginTop: spacing.sm },
  footerButton: { alignItems: 'center', borderColor: colors.lineStrong, borderRadius: radii.md, borderWidth: 1, flex: 1, justifyContent: 'center', minHeight: 48 },
  footerDanger: { borderColor: 'rgba(255,127,127,0.4)' },
  footerText: { color: colors.muted, fontSize: 14, fontWeight: '800' },
  backdrop: { backgroundColor: 'rgba(2, 8, 16, 0.6)', flex: 1, justifyContent: 'flex-end' },
  pickerSheet: { backgroundColor: colors.backgroundRaised, borderColor: colors.lineStrong, borderTopLeftRadius: radii.lg, borderTopRightRadius: radii.lg, borderWidth: 1, gap: 10, maxHeight: '80%', padding: spacing.md },
  pickerTitle: { color: colors.text, fontSize: 18, fontWeight: '900', marginBottom: 4 },
  pickerList: { flexGrow: 0 },
  kindOption: { alignItems: 'center', backgroundColor: colors.surface, borderRadius: radii.md, borderWidth: 1, flexDirection: 'row', gap: 14, padding: 14 },
  kindIcon: { alignItems: 'center', borderRadius: 12, height: 46, justifyContent: 'center', width: 46 },
  kindTitle: { color: colors.text, fontSize: 16, fontWeight: '800' },
  kindBody: { color: colors.muted, fontSize: 13, lineHeight: 18, marginTop: 3 },
  setupOption: { alignItems: 'center', backgroundColor: colors.surface, borderColor: colors.line, borderRadius: radii.md, borderWidth: 1, flexDirection: 'row', gap: 12, marginBottom: 8, padding: 14 },
  setupOptionOn: { borderColor: colors.cyan },
  setupNone: { alignItems: 'center', minHeight: 44, justifyContent: 'center' },
});
