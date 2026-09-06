import { StyleSheet, Text, View } from 'react-native';
import MenuPage from '../components/MenuPage';
import { GroupedSection, NavigationRow } from '../components/Ui';
import { colors, spacing } from '../theme';

export default function AccountScreen({ account, authStatus, onCreateAccount, onOpenScreen, onSignOut, profile, onBack, onOpenSettings }) {
  const displayName = [profile.firstName, profile.lastName].filter(Boolean).join(' ');
  const signedIn = authStatus === 'signedIn';
  const restoring = authStatus === 'restoring';
  const certifications = account?.certifications?.length || 0;
  return (
    <MenuPage title="Account" onBack={onBack} backLabel="More">
      <View style={styles.identity}>
        <View style={styles.avatar}><Text style={styles.initial}>{(profile.preferredName || profile.firstName || 'D').slice(0, 1).toUpperCase()}</Text></View>
        <View style={styles.identityCopy}>
          <Text style={styles.name}>{signedIn ? displayName || 'Your account' : 'Your DMZ Scuba account'}</Text>
          <Text style={styles.body}>{restoring ? 'Restoring your session…' : signedIn ? account?.profile?.email || profile.email : 'Use your DMZScuba.com sign-in.'}</Text>
        </View>
      </View>
      <GroupedSection title={signedIn ? 'Diver profile' : 'Get connected'}>
        {signedIn ? <>
          <NavigationRow title="Profile & certifications" body={`${certifications} ${certifications === 1 ? 'certification' : 'certifications'} saved · Contact, emergency, and diving details`} onPress={() => onOpenScreen('account-profile')} />
          <NavigationRow title="App settings" body="Units, appearance, and planning preferences" onPress={onOpenSettings} last />
        </> : <>
          <NavigationRow disabled={restoring} title={restoring ? 'Restoring session…' : 'Sign in'} body="Connect your profile and supported app settings" onPress={() => onOpenScreen('account-login')} />
          <NavigationRow disabled={restoring} title="Create an account" body="Save your diver profile and certifications" onPress={onCreateAccount} last />
        </>}
      </GroupedSection>
      {signedIn ? <GroupedSection title="Session">
        <NavigationRow title="Sign out" onPress={onSignOut} accent={colors.danger} last />
      </GroupedSection> : null}
      <Text style={styles.footer}>{signedIn ? 'Your profile and supported settings are connected to your account. Your logbook is stored on this device; save a backup from Settings.' : 'An account carries supported settings and profile details between devices.'}</Text>
    </MenuPage>
  );
}

const styles = StyleSheet.create({
  identity: { flexDirection: 'row', gap: 14, alignItems: 'center', paddingVertical: spacing.md, marginBottom: spacing.lg },
  avatar: { backgroundColor: colors.surfaceSoft, width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  initial: { color: colors.cyan, fontSize: 24, fontWeight: '700' },
  identityCopy: { flex: 1 },
  name: { color: colors.text, fontSize: 18, fontWeight: '700' },
  body: { color: colors.muted, fontSize: 13, lineHeight: 19, marginTop: 5 },
  footer: { color: colors.muted, fontSize: 12, lineHeight: 19 },
});
