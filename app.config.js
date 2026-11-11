const { expo } = require('./app.json');
module.exports = {
  ...expo,
  name: 'DMZ Logbook', slug: 'dmz-scuba-logbook', scheme: 'dmzlogbook',
  icon: './assets/history-icon.png',
  ios: { ...expo.ios, bundleIdentifier: 'com.dmzscuba.app.logbook' },
  android: { ...expo.android, package: 'com.dmzscuba.app.logbook' },
  plugins: [...expo.plugins, './plugins/withSceneLifecycle'],
};
