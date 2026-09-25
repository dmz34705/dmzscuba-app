import { useEffect, useState } from 'react';
import { Alert, Linking, StyleSheet, Text, View } from 'react-native';
import { getDataSyncStatus, subscribeDataSync, syncAccountData, nextSyncConflict, resolveSyncConflict } from '../lib/accountDataSync';
import MenuPage from '../components/MenuPage';
import { GroupedSection, NavigationRow } from '../components/Ui';
import { colors, spacing } from '../theme';

export default function AccountScreen({ account, authStatus, onCreateAccount, onOpenScreen, onSignOut, profile, onBack, onOpenSettings }) {
  const displayName = [profile.firstName, profile.lastName].filter(Boolean).join(' ');
  const signedIn = authStatus === 'signedIn';
  const restoring = authStatus === 'restoring';
  const certifications = account?.certifications?.length || 0;
  const [sync, setSync] = useState(getDataSyncStatus);
  useEffect(() => subscribeDataSync(setSync), []);
  const reviewConflict = async () => {
    const conflict = await nextSyncConflict();
    if (!conflict) return;
    const data = conflict.local?.data || conflict.remote?.data || {};
    Alert.alert('Choose the version to keep', `${data.name || data.site?.name || conflict.key}\nThis record changed on both devices. The original versions remain in a local recovery copy.`, [
      { text: 'Later', style: 'cancel' },
      { text: 'Use account version', onPress: () => resolveSyncConflict(conflict.key, 'cloud').catch((e) => Alert.alert('Sync', e.message)) },
      { text: 'Use this device', onPress: () => resolveSyncConflict(conflict.key, 'local').catch((e) => Alert.alert('Sync', e.message)) },
    ]);
  };
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
          <NavigationRow title="Profile & certifications" body={`${certifications} ${certifications === 1 ? 'certification' : 'certifications'} saved · Contact and emergency details`} onPress={() => onOpenScreen('account-profile')} />
          <NavigationRow title="App settings" body="Units, appearance, and planning preferences" onPress={onOpenSettings} last />
        </> : <>
          <NavigationRow disabled={restoring} title={restoring ? 'Restoring session…' : 'Sign in'} body="Connect your profile and supported app settings" onPress={() => onOpenScreen('account-login')} />
          <NavigationRow disabled={restoring} title="Create an account" body="Save your diver profile and certifications" onPress={onCreateAccount} last />
        </>}
      </GroupedSection>
      {signedIn ? <GroupedSection title="Logbook & gear sync">
        <NavigationRow title={sync.state === 'syncing' ? 'Syncing…' : 'Sync now'} body={sync.message} disabled={sync.state === 'syncing'} onPress={syncAccountData} />
        {sync.conflicts ? <NavigationRow title="Review changed records" body={`${sync.conflicts} records need your choice`} onPress={reviewConflict} /> : null}
        <NavigationRow title="Open my web logbook" body="Development website · Same DMZ Scuba account" onPress={() => Linking.openURL('https://dmzscuba-com.pages.dev/pages/account/#logbook')} last />
      </GroupedSection> : null}
      {signedIn ? <GroupedSection title="Session">
        <NavigationRow title="Sign out" onPress={onSignOut} accent={colors.danger} last />
      </GroupedSection> : null}
      <Text style={styles.footer}>{signedIn ? 'Logbook, computer profiles, gear, and setups sync while the app is open and connected. Offline changes stay on this device until sync succeeds. Photos and documents remain on this device for now.' : 'Use the app offline without an account. Sign in to sync your logbook and gear locker to the development website.'}</Text>
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
