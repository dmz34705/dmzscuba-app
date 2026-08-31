import { useCallback, useEffect, useRef, useState } from 'react';

import { DEFAULT_PROFILE } from '../../lib/accountProfile';
import { sanitizeAppSettings } from '../../lib/appSettings';
import {
  addCustomerCertification,
  fetchAccount,
  linkExistingCustomerRecords,
  removeCustomerCertification,
  restoreSession,
  saveAccountSettings,
  saveCustomerProfile,
  signIn,
  signOut,
} from '../../lib/accountApi';

export function profileFromAccount(profile = {}, current = DEFAULT_PROFILE) {
  return {
    ...current,
    email: String(profile.email ?? current.email ?? ''),
    firstName: String(profile.firstName ?? current.firstName ?? ''),
    lastName: String(profile.lastName ?? current.lastName ?? ''),
    preferredName: String(profile.preferredName ?? current.preferredName ?? ''),
    phone: String(profile.phone ?? current.phone ?? ''),
    location: String(profile.location ?? current.location ?? ''),
    emergencyContactName: String(profile.emergencyContactName ?? current.emergencyContactName ?? ''),
    emergencyContactPhone: String(profile.emergencyContactPhone ?? current.emergencyContactPhone ?? ''),
    loggedDives: String(profile.loggedDives ?? current.loggedDives ?? '0'),
    defaultPpO2: String(profile.defaultPpO2 ?? current.defaultPpO2 ?? '1.4'),
    defaultRmv: String(profile.defaultRmv ?? current.defaultRmv ?? '18'),
  };
}

export default function useAccountSession({ appSettings, settingsLoaded, onRemoteSettings }) {
  const [account, setAccount] = useState(null);
  const [authStatus, setAuthStatus] = useState('restoring');
  const [profile, setProfile] = useState(DEFAULT_PROFILE);
  const [settingsSyncReady, setSettingsSyncReady] = useState(false);
  const [settingsSyncStatus, setSettingsSyncStatus] = useState('local');
  const appSettingsRef = useRef(appSettings);
  const onRemoteSettingsRef = useRef(onRemoteSettings);
  appSettingsRef.current = appSettings;
  onRemoteSettingsRef.current = onRemoteSettings;

  const resetSessionState = useCallback(() => {
    setAccount(null);
    setAuthStatus('signedOut');
    setSettingsSyncReady(false);
    setSettingsSyncStatus('local');
  }, []);

  const applyAccount = useCallback(async (accountData) => {
    setAccount(accountData);
    setProfile((current) => profileFromAccount(accountData?.profile, current));
    if (accountData?.appSettings) {
      onRemoteSettingsRef.current(sanitizeAppSettings(accountData.appSettings));
    } else {
      await saveAccountSettings(appSettingsRef.current);
    }
    setSettingsSyncReady(true);
    setSettingsSyncStatus('synced');
    setAuthStatus('signedIn');
    return accountData;
  }, []);

  useEffect(() => {
    if (!settingsLoaded) return undefined;
    let active = true;
    restoreSession()
      .then((session) => (session ? fetchAccount() : null))
      .then(async (accountData) => {
        if (!active) return;
        if (!accountData) {
          setAuthStatus('signedOut');
          setSettingsSyncStatus('local');
          return;
        }
        await applyAccount(accountData);
      })
      .catch(() => {
        if (active) resetSessionState();
      });
    return () => { active = false; };
  }, [applyAccount, resetSessionState, settingsLoaded]);

  useEffect(() => {
    if (!settingsLoaded || authStatus !== 'signedIn' || !settingsSyncReady) return undefined;
    setSettingsSyncStatus('saving');
    const timeoutId = setTimeout(() => {
      saveAccountSettings(appSettings)
        .then(() => setSettingsSyncStatus('synced'))
        .catch((error) => {
          if (error?.code === 'AUTH_REQUIRED') {
            resetSessionState();
            return;
          }
          setSettingsSyncStatus('error');
        });
    }, 650);
    return () => clearTimeout(timeoutId);
  }, [appSettings, authStatus, resetSessionState, settingsLoaded, settingsSyncReady]);

  const completeSignIn = useCallback(async (credentials) => {
    await signIn(credentials);
    try {
      return await applyAccount(await fetchAccount());
    } catch (error) {
      await signOut();
      resetSessionState();
      throw error;
    }
  }, [applyAccount, resetSessionState]);

  const completeSignOut = useCallback(async () => {
    await signOut();
    resetSessionState();
  }, [resetSessionState]);

  const completeAccountVerification = useCallback(async () => {
    await linkExistingCustomerRecords().catch(() => null);
    return applyAccount(await fetchAccount());
  }, [applyAccount]);

  const updateProfile = useCallback(async (nextProfile) => applyAccount(await saveCustomerProfile(nextProfile)), [applyAccount]);
  const addCertification = useCallback(async (certification) => applyAccount(await addCustomerCertification(certification)), [applyAccount]);
  const deleteCertification = useCallback(async (certificationId) => applyAccount(await removeCustomerCertification(certificationId)), [applyAccount]);

  return {
    account,
    addCertification,
    authStatus,
    completeAccountVerification,
    deleteCertification,
    profile,
    settingsSyncStatus,
    signIn: completeSignIn,
    signOut: completeSignOut,
    updateProfile,
  };
}
