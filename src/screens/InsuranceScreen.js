import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import MenuPage from '../components/MenuPage';
import { PrimaryButton } from '../components/Ui';
import { callNumber } from '../features/insurance/openDocument';
import PolicyEditor from '../features/insurance/PolicyEditor';
import { insuranceTypeLabel, policyStatus } from '../features/insurance/model';
import useInsurance from '../features/insurance/useInsurance';
import { formatDay, todayString } from '../features/planner/model';
import { colors, radii, spacing } from '../theme';

const TONES = { good: colors.good, warning: colors.warning, danger: colors.danger, info: colors.cyan };

export function PolicyCard({ policy, today, onPress, compact = false }) {
  const status = policyStatus(policy, today);
  const tone = TONES[status.tone];
  const dates = policy.startDate || policy.endDate
    ? [policy.startDate ? formatDay(policy.startDate, { year: true }) : '', policy.endDate ? formatDay(policy.endDate, { year: true }) : policy.autoRenews ? 'renews' : ''].filter(Boolean).join(' – ')
    : '';
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${insuranceTypeLabel(policy.type)} insurance, ${policy.provider}, ${status.label}`} disabled={!onPress} onPress={onPress} style={({ pressed }) => [styles.card, compact && styles.cardCompact, pressed && styles.pressed]}>
      <View style={styles.cardTop}>
        <Text style={styles.type}>{insuranceTypeLabel(policy.type).toUpperCase()}</Text>
        <View style={[styles.status, { borderColor: `${tone}66`, backgroundColor: `${tone}14` }]}><Text style={[styles.statusText, { color: tone }]}>{status.label}</Text></View>
      </View>
      <Text style={styles.provider}>{policy.provider || 'Unnamed policy'}</Text>
      <Text style={styles.meta}>{[policy.policyNumber ? `Policy ${policy.policyNumber}` : '', policy.memberNumber ? `Member ${policy.memberNumber}` : ''].filter(Boolean).join(' · ') || 'No policy number'}</Text>
      {dates ? <Text style={styles.meta}>{dates}</Text> : null}
      {!compact && policy.covered ? <Text style={styles.meta}>Covers {policy.covered}</Text> : null}
      <View style={styles.cardFoot}>
        <Text style={styles.docs}>{policy.documents.length ? `${policy.documents.length} ${policy.documents.length === 1 ? 'document' : 'documents'}` : 'No documents'}</Text>
        {policy.emergencyPhone ? (
          <Pressable accessibilityRole="button" accessibilityLabel={`Call ${policy.provider || 'insurer'} emergency line`} hitSlop={8} onPress={() => callNumber(policy.emergencyPhone)} style={styles.call}>
            <Text style={styles.callText}>Call {policy.emergencyPhone}</Text>
          </Pressable>
        ) : null}
      </View>
    </Pressable>
  );
}

export default function InsuranceScreen({ onBack }) {
  const insurance = useInsurance();
  const [editing, setEditing] = useState(null); // { policy } — an empty policy when adding
  const today = todayString();
  const current = insurance.policies.filter((policy) => policyStatus(policy, today).key !== 'expired');
  const expired = insurance.policies.filter((policy) => policyStatus(policy, today).key === 'expired');
  const byEnd = (a, b) => (a.endDate || '9999').localeCompare(b.endDate || '9999');

  return (
    <MenuPage backLabel="Account" onBack={onBack} subtitle="Dive accident, travel, liability and equipment cover — details and documents kept on this phone, ready for your trips." title="Insurance">
      <PrimaryButton label="Add a policy" onPress={() => setEditing({ policy: null })} />
      {insurance.loaded && !insurance.policies.length ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>No policies yet</Text>
          <Text style={styles.emptyBody}>Add your dive accident cover first — trips that ask for dive insurance use it automatically, and its emergency number shows on every trip.</Text>
        </View>
      ) : null}
      {current.length ? <Text style={styles.section}>IN FORCE</Text> : null}
      {[...current].sort(byEnd).map((policy) => <PolicyCard key={policy.id} onPress={() => setEditing({ policy })} policy={policy} today={today} />)}
      {expired.length ? <Text style={styles.section}>EXPIRED</Text> : null}
      {[...expired].sort(byEnd).reverse().map((policy) => <PolicyCard key={policy.id} onPress={() => setEditing({ policy })} policy={policy} today={today} />)}
      <Text style={styles.footer}>Everything here is typed in by you and stays on this phone. Nothing is sent to a server or read by AI.</Text>
      <PolicyEditor
        onCancel={() => setEditing(null)}
        onDelete={editing?.policy ? async () => { await insurance.deletePolicy(editing.policy.id); setEditing(null); } : null}
        onSave={async (draft) => { await insurance.savePolicy(draft); setEditing(null); }}
        policy={editing?.policy || null}
        visible={Boolean(editing)}
      />
    </MenuPage>
  );
}

const styles = StyleSheet.create({
  section: { color: colors.muted, fontSize: 11, fontWeight: '800', letterSpacing: 1, marginBottom: 9, marginTop: spacing.lg },
  card: { backgroundColor: colors.surface, borderColor: colors.line, borderRadius: radii.md, borderWidth: 1, marginBottom: 10, padding: 14 },
  cardCompact: { marginBottom: 8 },
  cardTop: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  type: { color: colors.cyan, fontSize: 10, fontWeight: '900', letterSpacing: 1.2 },
  status: { borderRadius: radii.pill, borderWidth: 1, paddingHorizontal: 9, paddingVertical: 3 },
  statusText: { fontSize: 11, fontWeight: '800' },
  provider: { color: colors.text, fontSize: 17, fontWeight: '800' },
  meta: { color: colors.muted, fontSize: 13, lineHeight: 19, marginTop: 2 },
  cardFoot: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 },
  docs: { color: colors.faint, fontSize: 12, fontWeight: '700' },
  call: { backgroundColor: 'rgba(112,226,163,0.12)', borderRadius: radii.pill, paddingHorizontal: 12, paddingVertical: 6 },
  callText: { color: colors.good, fontSize: 12, fontWeight: '800' },
  empty: { backgroundColor: colors.surface, borderColor: colors.line, borderRadius: radii.md, borderWidth: 1, marginTop: spacing.md, padding: spacing.md },
  emptyTitle: { color: colors.text, fontSize: 16, fontWeight: '800' },
  emptyBody: { color: colors.muted, fontSize: 13, lineHeight: 19, marginTop: 5 },
  footer: { color: colors.faint, fontSize: 11, lineHeight: 16, marginTop: spacing.md },
  pressed: { opacity: 0.8 },
});
