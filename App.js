import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import AppNavigator from './src/application/AppNavigator';
import NumberKeyboardAccessory from './src/components/NumberKeyboardAccessory';
import { usePortraitOrientation } from './src/lib/screenOrientation';

export default function App() {
  usePortraitOrientation();

  return (
    <SafeAreaProvider>
      <StatusBar style="light" translucent backgroundColor="transparent" />
      <AppNavigator />
      <NumberKeyboardAccessory />
    </SafeAreaProvider>
  );
}
