import { useEffect, useState } from 'react';
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
import HomeScreen from '../screens/HomeScreen';
import LearnScreen from '../screens/LearnScreen';
import LoginScreen from '../screens/LoginScreen';
import ProfileScreen from '../screens/ProfileScreen';
import SettingsScreen from '../screens/SettingsScreen';
import ToolsScreen from '../screens/ToolsScreen';
import WebDemoScreen, { DEMOS } from '../screens/WebDemoScreen';
import { colors } from '../theme';
import { ACCOUNT_ROUTES, APP_TABS, isAppTab } from './navigation';

export default function AppNavigator() {
  const [activeTab, setActiveTab] = useState('home');
  const [detailRoute, setDetailRoute] = useState(null);
  const appSettings = useAppSettings();
  const accountSession = useAccountSession({
    appSettings: appSettings.settings,
    settingsLoaded: appSettings.loaded,
    onRemoteSettings: appSettings.replaceSettings,
  });

  const closeDetail = () => setDetailRoute(null);
  const openDetail = (route) => setDetailRoute(route);
  const selectTab = (tab) => {
    if (!isAppTab(tab)) return;
    setDetailRoute(null);
    setActiveTab(tab);
  };
  const openAccount = () => {
    setDetailRoute(null);
    setActiveTab('account');
  };

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (detailRoute) {
        closeDetail();
        return true;
      }
      if (activeTab !== 'home') {
        setActiveTab('home');
        return true;
      }
      return false;
    });
    return () => subscription.remove();
  }, [activeTab, detailRoute]);

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
        {activeTab === 'account' ? (
          <AccountScreen
            account={accountSession.account}
            authStatus={accountSession.authStatus}
            onCreateAccount={() => openDetail(ACCOUNT_ROUTES.create)}
            onOpenScreen={openDetail}
            onSignOut={accountSession.signOut}
            profile={accountSession.profile}
          />
        ) : null}
        {activeTab === 'settings' ? (
          <SettingsScreen
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
