const { withDangerousMod, withInfoPlist } = require('expo/config-plugins');
const { execFileSync } = require('child_process');
const path = require('path');

const BT_USAGE =
  'DMZ Scuba connects to your dive computer over Bluetooth to download your dive log.';

/**
 * Config plugin for the vendored libdivecomputer native module.
 *
 * - Stages the submodule's C sources into the module (CocoaPods only compiles
 *   source_files inside the pod root). Runs before `pod install` during prebuild.
 * - Ensures the Bluetooth usage string is present in Info.plist.
 *
 * The Swift/JS bridge itself autolinks from modules/dive-computer-bridge/.
 */
function withLibDiveComputerStaging(config) {
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
}

function withBluetoothUsage(config) {
  return withInfoPlist(config, (config) => {
    if (!config.modResults.NSBluetoothAlwaysUsageDescription) {
      config.modResults.NSBluetoothAlwaysUsageDescription = BT_USAGE;
    }
    return config;
  });
}

module.exports = function withLibDiveComputer(config) {
  return withBluetoothUsage(withLibDiveComputerStaging(config));
};
