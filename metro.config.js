// Expo's default Metro config, plus development backups: the dev server also answers /__dmz-backup
// requests, keeping copies of the app's data on this Mac (scripts/dev-backup/server.cjs).
const { getDefaultConfig } = require('expo/metro-config');
const { withDevBackups } = require('./scripts/dev-backup/server.cjs');

const config = getDefaultConfig(__dirname);
const enhance = config.server?.enhanceMiddleware;
config.server = {
  ...config.server,
  // Deprecated in Metro but still how Expo SDK 57 composes dev-server middleware (@expo/cli instantiateMetro).
  enhanceMiddleware: (middleware, server) => withDevBackups(enhance ? enhance(middleware, server) : middleware),
};

module.exports = config;
