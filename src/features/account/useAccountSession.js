import { useCallback, useEffect, useRef, useState } from 'react';

import { DEFAULT_PROFILE } from '../../lib/accountProfile';
import { prepareAccountData, startAccountDataSync, stopAccountDataSync } from '../../lib/accountDataSync';
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
  const preparedOwnerRef = useRef(null);
  const retryRestoreRef = useRef(false);
  appSettingsRef.current = appSettings;
  onRemoteSettingsRef.current = onRemoteSettings;

  const resetSessionState = useCallback(() => {
    stopAccountDataSync();
    preparedOwnerRef.current = null;
    setAccount(null);
    setAuthStatus('signedOut');
    setSettingsSyncReady(false);
    setSettingsSyncStatus('local');
  }, []);

  const applyAccount = useCallback(async (accountData) => {
    if (preparedOwnerRef.current !== accountData?.profile?.userId) {
      await prepareAccountData(accountData?.profile?.userId);
      preparedOwnerRef.current = accountData?.profile?.userId;
    }
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
    if (authStatus !== 'signedIn') return undefined;
    return startAccountDataSync();
  }, [authStatus]);

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
        if (active) { retryRestoreRef.current = true; resetSessionState(); }
      });
    return () => { active = false; };
  }, [applyAccount, resetSessionState, settingsLoaded]);

  useEffect(() => {
    if (authStatus !== 'signedOut') return undefined;
    let active = true, busy = false;
    const timer = setInterval(async () => {
      if (!retryRestoreRef.current || busy) return;
      busy = true;
      try {
        const session = await restoreSession();
        const data = session ? await fetchAccount() : null;
        if (!active || !retryRestoreRef.current) return;
        if (data) await applyAccount(data);
        retryRestoreRef.current = false;
      } catch { /* A temporary network failure can recover without another sign-in. */ }
      finally { busy = false; }
    }, 30000);
    return () => { active = false; clearInterval(timer); };
  }, [authStatus, applyAccount]);

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
    retryRestoreRef.current = false;
    stopAccountDataSync();
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
