const { withDangerousMod } = require('expo/config-plugins');
const { execFileSync } = require('child_process');
const path = require('path');

/**
 * Config plugin for the vendored libdivecomputer native module.
 *
 * Stages the submodule's C sources into modules/dive-computer-bridge/ios/
 * before `pod install` runs during prebuild — CocoaPods only compiles
 * source_files that live inside the pod root. The Swift/JS bridge itself
 * autolinks from modules/dive-computer-bridge/.
 *
 * The Bluetooth Info.plist / manifest permissions are handled by the
 * react-native-ble-plx config plugin.
 */
module.exports = function withLibDiveComputer(config) {
  return withDangerousMod(config, [
    'ios',
    (config) => {
      const script = path.join(
        config.modRequest.projectRoot,
        'modules',
        'dive-computer-bridge',
        'scripts',
        'stage-libdivecomputer.js',
      );
      execFileSync('node', [script], { stdio: 'inherit' });
      return config;
    },
  ]);
};
