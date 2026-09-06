import { useEffect, useReducer } from 'react';
import { BackHandler, StyleSheet, View } from 'react-native';

import { BottomTabBar } from '../components/AppShell';
import useAccountSession from '../features/account/useAccountSession';
import { getFeature } from '../features/catalog/featureCatalog';
import useAppSettings from '../features/settings/useAppSettings';
import { createAccount, verifySignup } from '../lib/accountApi';
import AccountScreen from '../screens/AccountScreen';
import CreateAccountScreen from '../screens/CreateAccountScreen';
import DiveCalculatorScreen from '../screens/DiveCalculatorScreen';
import DiveComputerSimulatorScreen from '../screens/DiveComputerSimulatorScreen';
import DiveLensScreen from '../screens/DiveLensScreen';
import DiveLogScreen from '../screens/DiveLogScreen';
import HomeScreen from '../screens/HomeScreen';
import LearnScreen from '../screens/LearnScreen';
import LoginScreen from '../screens/LoginScreen';
import ProfileScreen from '../screens/ProfileScreen';
import SettingsScreen from '../screens/SettingsScreen';
import MoreScreen from '../screens/MoreScreen';
import ToolsScreen from '../screens/ToolsScreen';
import WebDemoScreen, { DEMOS } from '../screens/WebDemoScreen';
import { colors } from '../theme';
import { ACCOUNT_ROUTES, APP_TABS, INITIAL_NAVIGATION, reduceNavigation } from './navigation';

export default function AppNavigator() {
  const [navigation, dispatch] = useReducer(reduceNavigation, INITIAL_NAVIGATION);
  const { activeTab, detailRoute, moreRoute, settingsSection } = navigation;
  const appSettings = useAppSettings();
  const accountSession = useAccountSession({
    appSettings: appSettings.settings,
    settingsLoaded: appSettings.loaded,
    onRemoteSettings: appSettings.replaceSettings,
  });

  const closeDetail = () => dispatch({ type: 'closeDetail' });
  const openDetail = (route) => dispatch({ type: 'open', route });
  const selectTab = (tab) => dispatch({ type: 'tab', tab });
  const openAccount = () => selectTab('account');
  const goBack = () => dispatch({ type: 'back' });

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (detailRoute || settingsSection || moreRoute || activeTab !== 'home') {
        goBack();
        return true;
      }
      return false;
    });
    return () => subscription.remove();
  }, [activeTab, detailRoute, moreRoute, settingsSection]);

  const feature = getFeature(detailRoute);
  if (feature?.routeType === 'web-demo') {
    return <WebDemoScreen demo={DEMOS[feature.id]} onBack={closeDetail} />;
  }
  if (feature?.routeType === 'calculator') {
    return <DiveCalculatorScreen appSettings={appSettings.settings} onBack={closeDetail} profileDefaults={accountSession.profile} />;
  }
  if (feature?.routeType === 'dive-computer-simulator') {
    return <DiveComputerSimulatorScreen appSettings={appSettings.settings} onBack={closeDetail} />;
  }
  if (feature?.routeType === 'lens') {
    return <DiveLensScreen onBack={closeDetail} />;
  }
  if (feature?.routeType === 'dive-log') {
    return <DiveLogScreen appSettings={appSettings.settings} onBack={closeDetail} onOpenSettings={() => selectTab('settings')} />;
  }

  if (detailRoute === ACCOUNT_ROUTES.login) {
    return (
      <LoginScreen
        initialEmail={accountSession.profile.email}
        onBack={closeDetail}
        onCreateAccount={() => openDetail(ACCOUNT_ROUTES.create)}
        onSignIn={async (credentials) => {
          await accountSession.signIn(credentials);
          openAccount();
        }}
      />
    );
  }
  if (detailRoute === ACCOUNT_ROUTES.create) {
    return (
      <CreateAccountScreen
        initialProfile={accountSession.profile}
        onBack={closeDetail}
        onCreateAccount={createAccount}
        onSignIn={() => openDetail(ACCOUNT_ROUTES.login)}
        onVerified={async () => {
          await accountSession.completeAccountVerification();
          openAccount();
        }}
        onVerify={verifySignup}
      />
    );
  }
  if (detailRoute === ACCOUNT_ROUTES.profile) {
    return (
      <ProfileScreen
        account={accountSession.account}
        onAddCertification={accountSession.addCertification}
        onBack={closeDetail}
        onDeleteCertification={accountSession.deleteCertification}
        onSave={accountSession.updateProfile}
        profile={accountSession.profile}
      />
    );
  }

  return (
    <View style={styles.shell}>
      <View style={styles.tabContent}>
        {activeTab === 'home' ? <HomeScreen onOpenTool={openDetail} onSelectTab={selectTab} /> : null}
        {activeTab === 'learn' ? <LearnScreen onOpenTool={openDetail} /> : null}
        {activeTab === 'tools' ? <ToolsScreen onOpenTool={openDetail} /> : null}
        {activeTab === 'logbook' ? <DiveLogScreen appSettings={appSettings.settings} onBack={() => selectTab('home')} onOpenSettings={() => selectTab('settings')} /> : null}
        {activeTab === 'more' && !moreRoute ? <MoreScreen onOpen={selectTab} /> : null}
        {activeTab === 'more' && moreRoute === 'account' ? (
          <AccountScreen
            onBack={goBack}
            onOpenSettings={() => selectTab('settings')}
            account={accountSession.account}
            authStatus={accountSession.authStatus}
            onCreateAccount={() => openDetail(ACCOUNT_ROUTES.create)}
            onOpenScreen={openDetail}
            onSignOut={accountSession.signOut}
            profile={accountSession.profile}
          />
        ) : null}
        {activeTab === 'more' && moreRoute === 'settings' ? (
          <SettingsScreen
            onBack={goBack}
            section={settingsSection}
            onOpenSection={(section) => dispatch({ type: 'section', section })}
            accountEmail={accountSession.account?.profile?.email || ''}
            authStatus={accountSession.authStatus}
            onChange={appSettings.setSettings}
            settings={appSettings.settings}
            syncStatus={accountSession.settingsSyncStatus}
          />
        ) : null}
      </View>
      <BottomTabBar activeTab={activeTab} items={APP_TABS} onSelect={selectTab} />
    </View>
  );
}

const styles = StyleSheet.create({
  shell: { backgroundColor: colors.background, flex: 1 },
  tabContent: { flex: 1 },
});
