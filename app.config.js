const { expo } = require('./app.json');
module.exports = {
  ...expo,
  name: 'DMZ Origins', slug: 'dmz-scuba-origins', scheme: 'dmzorigins',
  icon: './assets/history-icon.png',
  ios: { ...expo.ios, bundleIdentifier: 'com.dmzscuba.app.origins' },
  android: { ...expo.android, package: 'com.dmzscuba.app.origins' },
  plugins: [...expo.plugins, './plugins/withDevelopmentTeam', './plugins/withSceneLifecycle'],
};
