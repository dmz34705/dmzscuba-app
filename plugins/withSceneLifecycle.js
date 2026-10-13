const { withAppDelegate, withInfoPlist } = require('expo/config-plugins');

/**
 * Config plugin: adopt the UIScene life cycle, which iOS 27 requires. An app that still
 * creates its window in the app delegate is stopped at launch with
 * `UIApplicationEvaluateRuntimeIssueForNoSceneLifecycleAdoption`.
 *
 * Expo SDK 57 ships the scene delegate (`ExpoAppSceneDelegate`, Objective-C name
 * `EXExpoAppSceneDelegate`) but its prebuild template still starts React Native from
 * `AppDelegate`. This plugin:
 *  - registers that scene delegate in Info.plist, and
 *  - makes `AppDelegate` an `ExpoReactNativeFactoryProvider` that only builds the React
 *    Native factory; the scene delegate creates the window and starts React Native in it.
 * URL, universal-link and life-cycle events still reach `AppDelegate`: the scene delegate
 * forwards them.
 */
const SCENE_DELEGATE = 'EXExpoAppSceneDelegate';

const SCENE_MANIFEST = {
  UIApplicationSupportsMultipleScenes: false,
  UISceneConfigurations: {
    UIWindowSceneSessionRoleApplication: [{
      UISceneConfigurationName: 'Default Configuration',
      UISceneDelegateClassName: SCENE_DELEGATE,
    }],
  },
};

function withSceneManifest(config) {
  return withInfoPlist(config, (config) => {
    config.modResults.UIApplicationSceneManifest = SCENE_MANIFEST;
    return config;
  });
}

const CLASS_LINE = 'class AppDelegate: ExpoAppDelegate {';
const PROVIDER_LINE = 'class AppDelegate: ExpoAppDelegate, ExpoReactNativeFactoryProvider {';
// The template's window setup, from `#if os(iOS) || os(tvOS)` through its `#endif`.
const WINDOW_BLOCK = /\n#if os\(iOS\) \|\| os\(tvOS\)\n\s*window = UIWindow\(frame: UIScreen\.main\.bounds\)\n\s*factory\.startReactNative\([^)]*\)\n#endif\n/;
const SCENE_NOTE = '\n    // The window and React Native start in the scene delegate (see plugins/withSceneLifecycle.js).\n';

function patchAppDelegate(source) {
  if (source.includes(PROVIDER_LINE)) return source;
  if (!source.includes(CLASS_LINE) || !WINDOW_BLOCK.test(source)) {
    // Fail loudly: a silently skipped edit would bring back the iOS 27 launch crash.
    throw new Error('withSceneLifecycle: AppDelegate.swift no longer matches the Expo template it patches. Update the plugin for the new template.');
  }
  return source.replace(CLASS_LINE, PROVIDER_LINE).replace(WINDOW_BLOCK, SCENE_NOTE);
}

function withSceneAppDelegate(config) {
  return withAppDelegate(config, (config) => {
    if (config.modResults.language !== 'swift') throw new Error('withSceneLifecycle expects a Swift AppDelegate.');
    config.modResults.contents = patchAppDelegate(config.modResults.contents);
    return config;
  });
}

module.exports = function withSceneLifecycle(config) {
  return withSceneAppDelegate(withSceneManifest(config));
};
// Exposed so an existing ios/ folder can be patched without a full prebuild.
module.exports.patchAppDelegate = patchAppDelegate;
module.exports.SCENE_MANIFEST = SCENE_MANIFEST;
