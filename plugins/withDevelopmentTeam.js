const { withXcodeProject } = require('expo/config-plugins');

/**
 * Config plugin: pin the Apple development team + automatic signing on the app
 * target so `expo prebuild` / `expo run:ios --device` can auto-provision without
 * an interactive team prompt each run.
 *
 * 859MGAS385 = "Zach Lisowski (Personal Team)" (free provisioning, 7-day
 * profiles). Override with EXPO_APPLE_TEAM_ID when building under another account.
 */
const DEFAULT_TEAM_ID = '859MGAS385';

module.exports = function withDevelopmentTeam(config) {
  return withXcodeProject(config, (config) => {
    const teamId = process.env.EXPO_APPLE_TEAM_ID || DEFAULT_TEAM_ID;
    const project = config.modResults;
    const configs = project.pbxXCBuildConfigurationSection();

    for (const key of Object.keys(configs)) {
      const buildConfig = configs[key];
      if (typeof buildConfig !== 'object' || !buildConfig.buildSettings) continue;
      const settings = buildConfig.buildSettings;
      // Only the app target carries the Info.plist / entitlements settings.
      if (settings.INFOPLIST_FILE && String(settings.PRODUCT_BUNDLE_IDENTIFIER || '').includes('com.dmzscuba.app')) {
        settings.DEVELOPMENT_TEAM = teamId;
        settings.CODE_SIGN_STYLE = 'Automatic';
      }
    }
    return config;
  });
};
