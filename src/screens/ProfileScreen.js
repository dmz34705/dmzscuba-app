import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useState } from 'react';

import { FormError, FormField } from '../components/AccountForm';
import { ScreenHeader } from '../components/AppShell';
import { Card, PrimaryButton, SecondaryButton } from '../components/Ui';
import { validateProfile } from '../lib/accountProfile';
import { colors, radii, spacing } from '../theme';

const EMPTY_CERTIFICATION = {
  agency: '',
  certificationName: '',
  certificationNumber: '',
  issuedOn: '',
  expiresOn: '',
};

export default function ProfileScreen({ account, onAddCertification, onBack, onDeleteCertification, onSave, profile }) {
  const [draft, setDraft] = useState(profile);
  const [certificationDraft, setCertificationDraft] = useState(EMPTY_CERTIFICATION);
  const [section, setSection] = useState('personal');
  const [busyAction, setBusyAction] = useState('');
  const [error, setError] = useState('');
  const [certificationError, setCertificationError] = useState('');
  const [saved, setSaved] = useState(false);
  const certifications = Array.isArray(account?.certifications) ? account.certifications : [];

  const update = (key, value) => {
    setSaved(false);
    setDraft((current) => ({ ...current, [key]: value }));
  };

  const updateCertification = (key, value) => {
    setCertificationError('');
    setCertificationDraft((current) => ({ ...current, [key]: value }));
  };

  const saveProfile = async () => {
    const nextError = validateProfile(draft);
    setError(nextError);
    if (nextError) return;
    setBusyAction('profile');
    try {
      await onSave(draft);
      setSaved(true);
    } catch (nextErrorValue) {
      setError(nextErrorValue?.message || 'Your profile could not be saved. Please try again.');
    } finally {
      setBusyAction('');
    }
  };

  const addCertification = async () => {
    if (!certificationDraft.agency.trim() || !certificationDraft.certificationName.trim()) {
      setCertificationError('Enter the training agency and certification name.');
      return;
    }
    setBusyAction('certification');
    setCertificationError('');
    try {
      await onAddCertification(certificationDraft);
      setCertificationDraft(EMPTY_CERTIFICATION);
    } catch (nextErrorValue) {
      setCertificationError(nextErrorValue?.message || 'The certification could not be added. Please try again.');
    } finally {
      setBusyAction('');
    }
  };

  const confirmDeleteCertification = (certification) => {
    Alert.alert(
      'Remove certification?',
      `${certification.agency} ${certification.certificationName} will be removed from your account.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            setBusyAction(`delete-${certification.id}`);
            setCertificationError('');
            try {
              await onDeleteCertification(certification.id);
            } catch (nextErrorValue) {
              setCertificationError(nextErrorValue?.message || 'The certification could not be removed.');
            } finally {
              setBusyAction('');
            }
          },
        },
      ]
    );
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.screen}>
      <ScreenHeader eyebrow="DIVER ACCOUNT" title="Edit Profile" onBack={onBack} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>Your diver profile</Text>
        <Text style={styles.subtitle}>Keep your contact, emergency, experience, and certification information connected to your DMZ Scuba account.</Text>

        <View style={styles.syncNotice}>
          <Text style={styles.syncLabel}>ACCOUNT SYNC ACTIVE</Text>
          <Text style={styles.syncText}>Saved changes are available when you sign in on another device.</Text>
        </View>

        <View style={styles.tabs}>
          <SecondaryButton label="Personal" onPress={() => setSection('personal')} selected={section === 'personal'} style={styles.tab} />
          <SecondaryButton label="Diving" onPress={() => setSection('diving')} selected={section === 'diving'} style={styles.tab} />
        </View>

        {section === 'personal' ? (
          <>
            <Card style={styles.card}>
              <Text style={styles.cardTitle}>Basic information</Text>
              <Text style={styles.cardSubtitle}>Contact details associated with your verified account.</Text>
              <View style={styles.twoColumn}>
                <View style={styles.half}><FormField label="First name" maxLength={80} onChangeText={(value) => update('firstName', value)} value={draft.firstName} /></View>
                <View style={styles.half}><FormField label="Last name" maxLength={80} onChangeText={(value) => update('lastName', value)} value={draft.lastName} /></View>
              </View>
              <FormField label="Preferred name" maxLength={80} onChangeText={(value) => update('preferredName', value)} placeholder="Optional" value={draft.preferredName} />
              <FormField editable={false} helper="Change your verified email through account security on DMZScuba.com." keyboardType="email-address" label="Verified email" value={draft.email} />
              <FormField autoComplete="tel" keyboardType="phone-pad" label="Phone" maxLength={40} onChangeText={(value) => update('phone', value)} placeholder="Optional" textContentType="telephoneNumber" value={draft.phone} />
              <FormField label="Home location" maxLength={120} onChangeText={(value) => update('location', value)} placeholder="City, state, or region" value={draft.location} />
            </Card>
            <Card style={styles.card}>
              <Text style={styles.cardTitle}>Emergency contact</Text>
              <Text style={styles.cardSubtitle}>A quick reference for classes, dive travel, and activity planning.</Text>
              <FormField label="Contact name" maxLength={120} onChangeText={(value) => update('emergencyContactName', value)} placeholder="Optional" value={draft.emergencyContactName} />
              <FormField autoComplete="tel" keyboardType="phone-pad" label="Contact phone" maxLength={40} onChangeText={(value) => update('emergencyContactPhone', value)} placeholder="Optional" textContentType="telephoneNumber" value={draft.emergencyContactPhone} />
            </Card>
          </>
        ) : (
          <>
            <Card style={styles.card}>
              <Text style={styles.cardTitle}>Experience and planning</Text>
              <Text style={styles.cardSubtitle}>These defaults personalize planning tools and never replace training or conservative dive planning.</Text>
              <FormField keyboardType="number-pad" label="Logged dives" maxLength={6} onChangeText={(value) => update('loggedDives', value)} placeholder="0" value={String(draft.loggedDives ?? '')} />
              <View style={styles.twoColumn}>
                <View style={styles.half}><FormField helper="Common default: 1.4 ATA" keyboardType="decimal-pad" label="Working ppO₂" maxLength={4} onChangeText={(value) => update('defaultPpO2', value)} value={String(draft.defaultPpO2 ?? '')} /></View>
                <View style={styles.half}><FormField helper="Stored in L/min" keyboardType="decimal-pad" label="Planning RMV" maxLength={6} onChangeText={(value) => update('defaultRmv', value)} value={String(draft.defaultRmv ?? '')} /></View>
              </View>
            </Card>

            <Card style={styles.card}>
              <Text style={styles.cardTitle}>Certifications</Text>
              <Text style={styles.cardSubtitle}>Certification details are self-reported and remain pending until DMZ Scuba verifies them.</Text>
              {certifications.length ? certifications.map((certification) => (
                <View key={certification.id} style={styles.certificationCard}>
                  <View style={styles.certificationCopy}>
                    <Text style={styles.certificationTitle}>{certification.certificationName}</Text>
                    <Text style={styles.certificationMeta}>{certification.agency}{certification.certificationNumber ? ` · ${certification.certificationNumber}` : ''}</Text>
                    <Text style={styles.certificationStatus}>{String(certification.verificationStatus || 'pending').toUpperCase()}</Text>
                  </View>
                  <SecondaryButton
                    label={busyAction === `delete-${certification.id}` ? 'Removing…' : 'Remove'}
                    onPress={() => confirmDeleteCertification(certification)}
                    style={styles.removeButton}
                  />
                </View>
              )) : <Text style={styles.emptyText}>No certifications have been added yet.</Text>}

              <View style={styles.divider} />
              <Text style={styles.addTitle}>Add a certification</Text>
              <View style={styles.twoColumn}>
                <View style={styles.half}><FormField autoCapitalize="characters" label="Agency" maxLength={80} onChangeText={(value) => updateCertification('agency', value)} placeholder="SDI, PADI, SSI…" value={certificationDraft.agency} /></View>
                <View style={styles.half}><FormField label="Certification" maxLength={120} onChangeText={(value) => updateCertification('certificationName', value)} placeholder="Open Water" value={certificationDraft.certificationName} /></View>
              </View>
              <FormField autoCapitalize="characters" label="Certification number" maxLength={120} onChangeText={(value) => updateCertification('certificationNumber', value)} placeholder="Optional" value={certificationDraft.certificationNumber} />
              <View style={styles.twoColumn}>
                <View style={styles.half}><FormField autoCapitalize="none" label="Issue date" maxLength={10} onChangeText={(value) => updateCertification('issuedOn', value)} placeholder="YYYY-MM-DD" value={certificationDraft.issuedOn} /></View>
                <View style={styles.half}><FormField autoCapitalize="none" label="Expiration date" maxLength={10} onChangeText={(value) => updateCertification('expiresOn', value)} placeholder="Optional" value={certificationDraft.expiresOn} /></View>
              </View>
              <FormError message={certificationError} />
              <SecondaryButton label={busyAction === 'certification' ? 'Adding…' : 'Add certification'} onPress={addCertification} />
            </Card>
          </>
        )}

        <FormError message={error} />
        {saved ? <Text accessibilityRole="alert" style={styles.saved}>Your profile was saved to your DMZ Scuba account.</Text> : null}
        <PrimaryButton disabled={Boolean(busyAction)} label={busyAction === 'profile' ? 'Saving profile…' : 'Save profile'} onPress={saveProfile} />
        <Text style={styles.footer}>Certification details are self-reported and must never replace checking a diver’s physical certification credentials.</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: colors.background, flex: 1 },
  content: { padding: spacing.md, paddingBottom: spacing.xl },
  title: { color: colors.text, fontSize: 29, fontWeight: '900', letterSpacing: -0.7, lineHeight: 34, marginTop: 4 },
  subtitle: { color: colors.muted, fontSize: 14, lineHeight: 21, marginBottom: 14, marginTop: 7 },
  syncNotice: { backgroundColor: 'rgba(112,226,163,0.08)', borderColor: 'rgba(112,226,163,0.28)', borderRadius: radii.md, borderWidth: 1, marginBottom: 14, padding: 12 },
  syncLabel: { color: colors.good, fontSize: 9, fontWeight: '900', letterSpacing: 1.15 },
  syncText: { color: colors.muted, fontSize: 11, lineHeight: 17, marginTop: 4 },
  tabs: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  tab: { flex: 1 },
  card: { padding: spacing.md },
  cardTitle: { color: colors.text, fontSize: 17, fontWeight: '900' },
  cardSubtitle: { color: colors.muted, fontSize: 11, lineHeight: 17, marginBottom: 15, marginTop: 4 },
  twoColumn: { flexDirection: 'row', gap: 9 },
  half: { flex: 1 },
  certificationCard: { alignItems: 'center', backgroundColor: colors.backgroundRaised, borderColor: colors.line, borderRadius: radii.md, borderWidth: 1, flexDirection: 'row', gap: 10, marginBottom: 9, padding: 11 },
  certificationCopy: { flex: 1 },
  certificationTitle: { color: colors.text, fontSize: 13, fontWeight: '800' },
  certificationMeta: { color: colors.muted, fontSize: 10, lineHeight: 15, marginTop: 2 },
  certificationStatus: { color: colors.cyan, fontSize: 8, fontWeight: '900', letterSpacing: 0.8, marginTop: 5 },
  removeButton: { minHeight: 38, paddingHorizontal: 10, paddingVertical: 7 },
  emptyText: { color: colors.faint, fontSize: 11, lineHeight: 17, marginBottom: 4 },
  divider: { backgroundColor: colors.line, height: 1, marginVertical: 16 },
  addTitle: { color: colors.text, fontSize: 14, fontWeight: '900', marginBottom: 13 },
  saved: { backgroundColor: 'rgba(112,226,163,0.1)', color: colors.good, fontSize: 12, fontWeight: '700', lineHeight: 18, marginBottom: 12, padding: 10, textAlign: 'center' },
  footer: { color: colors.faint, fontSize: 10, lineHeight: 16, marginHorizontal: 8, marginTop: 14, textAlign: 'center' },
});
