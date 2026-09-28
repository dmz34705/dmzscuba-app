import { useEffect, useReducer, useState } from 'react';
import { BackHandler, StyleSheet, View } from 'react-native';

import { BottomTabBar } from '../components/AppShell';
import { PageTransition } from '../components/Motion';
import useAccountSession from '../features/account/useAccountSession';
import { getFeature } from '../features/catalog/featureCatalog';
import useAppSettings from '../features/settings/useAppSettings';
import { createAccount, verifySignup } from '../lib/accountApi';
import { ensureLocationTracking } from '../lib/locationLog/locationTrackingService';
import AccountScreen from '../screens/AccountScreen';
import BoylesLawScreen from '../screens/BoylesLawScreen';
import ColorLossScreen from '../screens/ColorLossScreen';
import CreateAccountScreen from '../screens/CreateAccountScreen';
import DiveCalculatorScreen from '../screens/DiveCalculatorScreen';
import DiveComputerSimulatorScreen from '../screens/DiveComputerSimulatorScreen';
import DiveLensScreen from '../screens/DiveLensScreen';
import ComingSoonScreen from '../screens/ComingSoonScreen';
import CompassNavScreen from '../screens/CompassNavScreen';
import DiveLogScreen from '../screens/DiveLogScreen';
import OceanAtlasScreen from '../screens/OceanAtlasScreen';
import PlannerScreen from '../screens/PlannerScreen';
import GearSetupScreen from '../screens/GearSetupScreen';
import GearChecklistScreen from '../screens/GearChecklistScreen';
import HomeScreen from '../screens/HomeScreen';
import LearnScreen from '../screens/LearnScreen';
import LoginScreen from '../screens/LoginScreen';
import InsuranceScreen from '../screens/InsuranceScreen';
import ProfileScreen from '../screens/ProfileScreen';
import SettingsScreen from '../screens/SettingsScreen';
import MoreScreen from '../screens/MoreScreen';
import ToolsScreen from '../screens/ToolsScreen';
import WebDemoScreen, { DEMOS } from '../screens/WebDemoScreen';
import { colors } from '../theme';
import { ACCOUNT_ROUTES, APP_TABS, INITIAL_NAVIGATION, reduceNavigation } from './navigation';

// The "Build a Scuba Unit" lab is complete but held back pending finished
// illustrations. Flip to true to re-enable GearSetupScreen; nothing else about
// the feature has been removed.
const GEAR_SETUP_ENABLED = false;

export default function AppNavigator() {
  const [navigation, dispatch] = useReducer(reduceNavigation, INITIAL_NAVIGATION);
  const [transitionKind, setTransitionKind] = useState('none');
  const { activeTab, detailRoute, moreRoute, settingsSection, logbookIntent, atlasFocus, plannerFocus } = navigation;
  const appSettings = useAppSettings();
  const accountSession = useAccountSession({
    appSettings: appSettings.settings,
    settingsLoaded: appSettings.loaded,
    onRemoteSettings: appSettings.applyAccountSettings,
  });

  // Rebuilding/reinstalling a development client can clear the native task
  // registration while preserving the user's saved opt-in and iOS permission.
  // Reconcile the real task with that setting on every app launch.
  useEffect(() => {
    if (!appSettings.loaded || !appSettings.settings.locationLoggingEnabled) return;
    ensureLocationTracking().catch(() => {});
  }, [appSettings.loaded, appSettings.settings.locationLoggingEnabled]);

  const navigate = (action, kind) => {
    setTransitionKind(kind);
    dispatch(action);
  };
  const closeDetail = () => navigate({ type: 'closeDetail' }, 'back');
  const openDetail = (route, options = {}) => navigate({ type: 'open', route, focus: options.focus, at: Date.now() }, 'forward');
  const selectTab = (tab) => navigate({ type: 'tab', tab }, 'tab');
  const openAccount = () => selectTab('account');
  const goBack = () => navigate({ type: 'back' }, 'back');

  const transitionKey = detailRoute
    ? `detail:${detailRoute}:${atlasFocus?.at || plannerFocus?.at || ''}`
    : `tab:${activeTab}:${moreRoute || ''}:${settingsSection || ''}:${logbookIntent?.at || ''}`;
  const renderScreen = (screen) => (
    <PageTransition kind={transitionKind} transitionKey={transitionKey}>
      {screen}
    </PageTransition>
  );

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
  if (feature?.routeType === 'ocean-atlas') {
    return renderScreen(<OceanAtlasScreen appSettings={appSettings.settings} focus={atlasFocus} onBack={closeDetail} onOpenSettings={() => selectTab('settings')} />);
  }
  if (feature?.routeType === 'planner') {
    return renderScreen(<PlannerScreen account={accountSession.account} focusPlanId={plannerFocus?.planId || null} key={plannerFocus?.at || 'planner'} onBack={closeDetail} onOpenTool={openDetail} signedIn={accountSession.authStatus === 'signedIn'} />);
  }
  if (feature?.routeType === 'color-loss') {
    return renderScreen(<ColorLossScreen appSettings={appSettings.settings} onBack={closeDetail} />);
  }
  if (feature?.routeType === 'boyles-law') {
    return renderScreen(<BoylesLawScreen appSettings={appSettings.settings} onBack={closeDetail} />);
  }
  if (feature?.routeType === 'gear-setup') {
    return renderScreen(GEAR_SETUP_ENABLED
      ? <GearSetupScreen onBack={closeDetail} />
      : (
        <ComingSoonScreen
          eyebrow="INTERACTIVE LAB"
          title={feature.title}
          note="Build a Scuba Unit is getting a full illustration pass. It’ll unlock in an upcoming update."
          onBack={closeDetail}
        />
      ));
  }
  if (feature?.routeType === 'compass-nav') {
    return renderScreen(<CompassNavScreen onBack={closeDetail} />);
  }
  if (feature?.routeType === 'web-demo') {
    return renderScreen(<WebDemoScreen demo={DEMOS[feature.id]} onBack={closeDetail} />);
  }
  if (feature?.routeType === 'calculator') {
    return renderScreen(<DiveCalculatorScreen appSettings={appSettings.settings} onBack={closeDetail} profileDefaults={accountSession.profile} />);
  }
  if (feature?.routeType === 'gear-checklist') {
    return renderScreen(<GearChecklistScreen appSettings={appSettings.settings} onBack={closeDetail} onOpenComputerDives={(deviceKey) => navigate({ type: 'open', route: 'dive-log:folder', folder: deviceKey, at: Date.now() }, 'tab')} />);
  }
  if (feature?.routeType === 'dive-computer-simulator') {
    return renderScreen(<DiveComputerSimulatorScreen appSettings={appSettings.settings} onBack={closeDetail} />);
  }
  if (feature?.routeType === 'lens') {
    return renderScreen(<DiveLensScreen onBack={closeDetail} />);
  }
  if (feature?.routeType === 'dive-log') {
    return renderScreen(<DiveLogScreen appSettings={appSettings.settings} onBack={closeDetail} onOpenSettings={() => selectTab('settings')} />);
  }

  if (detailRoute === ACCOUNT_ROUTES.login) {
    return renderScreen(
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
    return renderScreen(
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
  if (detailRoute === ACCOUNT_ROUTES.insurance) {
    return renderScreen(<InsuranceScreen onBack={closeDetail} />);
  }
  if (detailRoute === ACCOUNT_ROUTES.profile) {
    return renderScreen(
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

  return renderScreen(
    <View style={styles.shell}>
      <View style={styles.tabContent}>
        {activeTab === 'home' ? <HomeScreen appSettings={appSettings.settings} certifications={accountSession.authStatus === 'signedIn' && Array.isArray(accountSession.account?.certifications) ? accountSession.account.certifications : null} onOpenTool={openDetail} onSelectTab={selectTab} profile={accountSession.profile} signedIn={accountSession.authStatus === 'signedIn'} /> : null}
        {activeTab === 'learn' ? <LearnScreen onOpenTool={openDetail} /> : null}
        {activeTab === 'tools' ? <ToolsScreen onOpenTool={openDetail} /> : null}
        {activeTab === 'logbook' ? <DiveLogScreen key={logbookIntent?.at || 'logbook'} appSettings={appSettings.settings} initialAction={logbookIntent?.action || null} initialFolder={logbookIntent?.folder || null} onBack={() => selectTab('home')} onOpenSettings={() => selectTab('settings')} /> : null}
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
            onOpenSection={(section) => navigate({ type: 'section', section }, 'forward')}
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
