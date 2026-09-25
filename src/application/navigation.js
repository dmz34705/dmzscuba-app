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

export const INITIAL_NAVIGATION = Object.freeze({ activeTab: 'home', detailRoute: null, moreRoute: null, settingsSection: null, logbookIntent: null, atlasFocus: null, plannerFocus: null });

// Shortcuts that open the logbook straight into a task (Home's "Log a dive" / "Download").
export const LOGBOOK_INTENTS = Object.freeze({ 'dive-log:new': 'new', 'dive-log:download': 'download' });

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
    if (action.route === 'dive-log') return { ...INITIAL_NAVIGATION, activeTab: 'logbook' };
    // Open the logbook on one dive computer's folder (from that computer's page in the gear locker).
    if (action.route === 'dive-log:folder' && action.folder) return { ...INITIAL_NAVIGATION, activeTab: 'logbook', logbookIntent: { action: 'folder', folder: action.folder, at: action.at ?? 0 } };
    if (LOGBOOK_INTENTS[action.route]) return { ...INITIAL_NAVIGATION, activeTab: 'logbook', logbookIntent: { action: LOGBOOK_INTENTS[action.route], at: action.at ?? 0 } };
    // Open the atlas on a place and species (Home's in-season cards).
    if (action.route === 'ocean-atlas' && action.focus) return { ...state, detailRoute: 'ocean-atlas', atlasFocus: { ...action.focus, at: action.at ?? 0 } };
    // Open the planner on one plan (Home's "Up next" card).
    if (action.route === 'dive-planner') return { ...state, detailRoute: 'dive-planner', atlasFocus: null, plannerFocus: action.focus?.planId ? { planId: action.focus.planId, at: action.at ?? 0 } : null };
    return { ...state, detailRoute: action.route, atlasFocus: null, plannerFocus: null };
  }
  if (action.type === 'section') {
    return Object.hasOwn(SETTINGS_SECTIONS, action.section)
      ? { ...state, activeTab: 'more', moreRoute: 'settings', settingsSection: action.section }
      : state;
  }
  if (action.type === 'closeDetail') return { ...state, detailRoute: null, atlasFocus: null, plannerFocus: null };
  if (action.type === 'back') {
    if (state.detailRoute) return { ...state, detailRoute: null, atlasFocus: null, plannerFocus: null };
    if (state.settingsSection) return { ...state, settingsSection: null };
    if (state.moreRoute) return { ...state, moreRoute: null };
    return INITIAL_NAVIGATION;
  }
  return state;
}
