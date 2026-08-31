import { requireOptionalNativeModule } from 'expo-modules-core';

// Optional: the native module only exists in a development/production build, not
// in Expo Go or on web. Callers must handle `null`.
export default requireOptionalNativeModule('DiveComputerBridgeModule');
