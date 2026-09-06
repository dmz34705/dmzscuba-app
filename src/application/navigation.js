export const APP_TABS = Object.freeze([
  { key: 'home', label: 'Home', icon: 'home' },
  { key: 'learn', label: 'Learn', icon: 'learn' },
  { key: 'tools', label: 'Tools', icon: 'tools' },
  { key: 'logbook', label: 'Logbook', icon: 'logbook' },
  { key: 'more', label: 'More', icon: 'more' },
]);

export const ACCOUNT_ROUTES = Object.freeze({
  create: 'account-create',
  login: 'account-login',
  profile: 'account-profile',
});

export function isAppTab(value) {
  return APP_TABS.some((tab) => tab.key === value);
}

export const SETTINGS_SECTIONS = Object.freeze({
  units: 'Units', calculator: 'Calculator preferences', graph: 'Dive profile graph',
  location: 'Location', backup: 'Export & backup',
});

export const INITIAL_NAVIGATION = Object.freeze({ activeTab: 'home', detailRoute: null, moreRoute: null, settingsSection: null });

// All entry points (Home, catalog, tabs, and feature shortcuts) share a
// destination, so Back returns through the menu that actually opened it.
export function reduceNavigation(state, action) {
  if (action.type === 'tab') {
    if (action.tab === 'account' || action.tab === 'settings') {
      return { ...INITIAL_NAVIGATION, activeTab: 'more', moreRoute: action.tab };
    }
    return isAppTab(action.tab) ? { ...INITIAL_NAVIGATION, activeTab: action.tab } : state;
  }
  if (action.type === 'open') {
    return action.route === 'dive-log'
      ? { ...INITIAL_NAVIGATION, activeTab: 'logbook' }
      : { ...state, detailRoute: action.route };
  }
  if (action.type === 'section') {
    return Object.hasOwn(SETTINGS_SECTIONS, action.section)
      ? { ...state, activeTab: 'more', moreRoute: 'settings', settingsSection: action.section }
      : state;
  }
  if (action.type === 'closeDetail') return { ...state, detailRoute: null };
  if (action.type === 'back') {
    if (state.detailRoute) return { ...state, detailRoute: null };
    if (state.settingsSection) return { ...state, settingsSection: null };
    if (state.moreRoute) return { ...state, moreRoute: null };
    return INITIAL_NAVIGATION;
  }
  return state;
}
