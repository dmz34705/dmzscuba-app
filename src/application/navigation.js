export const APP_TABS = Object.freeze([
  { key: 'home', label: 'Home', icon: 'home' },
  { key: 'learn', label: 'Learn', icon: 'learn' },
  { key: 'tools', label: 'Tools', icon: 'tools' },
  { key: 'account', label: 'Account', icon: 'account' },
  { key: 'settings', label: 'Settings', icon: 'settings' },
]);

export const ACCOUNT_ROUTES = Object.freeze({
  create: 'account-create',
  login: 'account-login',
  profile: 'account-profile',
});

export function isAppTab(value) {
  return APP_TABS.some((tab) => tab.key === value);
}
