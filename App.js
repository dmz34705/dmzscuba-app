import { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import AppNavigator from './src/application/AppNavigator';
import NumberKeyboardAccessory from './src/components/NumberKeyboardAccessory';
import { usePortraitOrientation } from './src/lib/screenOrientation';
import { startDevAutoBackup } from './src/lib/devBackup';

export default function App() {
  usePortraitOrientation();
  // Development builds keep a copy of all app data on the Mac, through the Metro dev server.
  useEffect(() => startDevAutoBackup(), []);

  return (
    <SafeAreaProvider>
      <StatusBar style="light" translucent backgroundColor="transparent" />
      <AppNavigator />
      <NumberKeyboardAccessory />
    </SafeAreaProvider>
  );
}
