import { ScrollView, StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { ScreenHeader } from '../components/AppShell';
import { ScreenIntro, StatusBanner } from '../components/ScreenLayout';
import { PrimaryButton, SecondaryButton } from '../components/Ui';
import { colors, radii, spacing } from '../theme';

function ProfileIcon() {
  return (
    <Svg width={42} height={42} viewBox="0 0 24 24">
      <Path d="M12 12a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9Zm-8 9a8 8 0 0 1 16 0H4Z" fill={colors.cyan} />
    </Svg>
  );
}

export default function AccountScreen({ account, authStatus, onCreateAccount, onOpenScreen, onSignOut, profile }) {
  const displayName = [profile.firstName, profile.lastName].filter(Boolean).join(' ');
  const greetingName = profile.preferredName || profile.firstName;
  const signedIn = authStatus === 'signedIn';
  const restoring = authStatus === 'restoring';
  return (
    <View style={styles.screen}>
      <ScreenHeader eyebrow="DMZ SCUBA" title="Account" />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <ScreenIntro
          body="Keep contact details, certifications, app settings, and planning preferences together."
          eyebrow="YOUR DIVER PROFILE"
          title={signedIn && greetingName ? `Welcome back, ${greetingName}.` : 'Make the app yours.'}
        />

        <View style={styles.accountCard}>
          <View style={styles.iconShell}><ProfileIcon /></View>
          <Text style={styles.cardTitle}>{signedIn ? (displayName || 'Your DMZ Scuba account') : 'Your DMZ Scuba account'}</Text>
          <Text style={styles.cardBody}>{restoring ? 'Checking for a saved secure session…' : signedIn ? `${account?.profile?.email || profile.email}\nYour app settings are connected to this account.` : 'Sign in with the same account you use on DMZScuba.com.'}</Text>
          {signedIn ? (
            <>
              <PrimaryButton label="Edit diver profile" onPress={() => onOpenScreen('account-profile')} style={styles.primaryButton} />
              <SecondaryButton label="Sign out" onPress={onSignOut} style={styles.secondaryButton} />
            </>
          ) : (
            <>
              <PrimaryButton disabled={restoring} label={restoring ? 'Restoring session…' : 'Sign in'} onPress={() => onOpenScreen('account-login')} style={styles.primaryButton} />
              <SecondaryButton label="Create a DMZ Scuba account" onPress={onCreateAccount} style={styles.secondaryButton} />
            </>
          )}
        </View>

        <View style={styles.detailsCard}>
          <View style={styles.previewCopy}>
            <Text style={styles.previewLabel}>{signedIn ? 'PROFILE SYNC' : 'YOUR ACCOUNT'}</Text>
            <Text style={styles.previewTitle}>{signedIn ? 'Your diver details travel with you' : 'One profile across your devices'}</Text>
            <Text style={styles.previewBody}>{signedIn ? `${account?.certifications?.length || 0} certification${account?.certifications?.length === 1 ? '' : 's'} saved. Contact, emergency, experience, and calculator details are connected to your account.` : 'Create an account to save profile details, certifications, calculator defaults, and app settings securely.'}</Text>
          </View>
          {signedIn ? <SecondaryButton label="Manage profile and certifications" onPress={() => onOpenScreen('account-profile')} /> : null}
        </View>

        <StatusBanner
          body={signedIn ? 'Your secure session stays protected by this device. Passwords are never saved in the app.' : 'Sign in securely to carry supported settings and profile details between devices.'}
          label={signedIn ? 'SECURE SESSION' : 'PRIVATE BY DESIGN'}
          style={styles.securityBanner}
          tone={signedIn ? 'success' : 'info'}
        />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: colors.background, flex: 1 },
  content: { paddingBottom: spacing.lg, paddingHorizontal: spacing.md, paddingTop: spacing.lg },
  accountCard: { alignItems: 'center', backgroundColor: colors.surfaceGlass, borderColor: colors.lineStrong, borderRadius: radii.lg, borderWidth: 1, padding: spacing.lg },
  iconShell: { alignItems: 'center', backgroundColor: 'rgba(112,221,246,0.1)', borderColor: 'rgba(112,221,246,0.32)', borderRadius: 34, borderWidth: 1, height: 68, justifyContent: 'center', width: 68 },
  cardTitle: { color: colors.text, fontSize: 20, fontWeight: '900', marginTop: 13 },
  cardBody: { color: colors.muted, fontSize: 12, lineHeight: 18, marginBottom: 17, marginTop: 6, maxWidth: 330, textAlign: 'center' },
  primaryButton: { alignSelf: 'stretch' },
  secondaryButton: { alignSelf: 'stretch', marginTop: 9 },
  detailsCard: { backgroundColor: colors.surface, borderColor: colors.line, borderRadius: radii.lg, borderWidth: 1, marginTop: 13, padding: spacing.md },
  previewCopy: { marginBottom: 13 },
  previewLabel: { color: colors.cyan, fontSize: 9, fontWeight: '900', letterSpacing: 1.2 },
  previewTitle: { color: colors.text, fontSize: 15, fontWeight: '800', marginTop: 5 },
  previewBody: { color: colors.muted, fontSize: 12, lineHeight: 18, marginTop: 4 },
  securityBanner: { marginTop: 13 },
});
