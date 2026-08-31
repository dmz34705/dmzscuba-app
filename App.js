import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import AppNavigator from './src/application/AppNavigator';
import NumberKeyboardAccessory from './src/components/NumberKeyboardAccessory';

export default function App() {
  return (
    <SafeAreaProvider>
      <StatusBar style="light" translucent backgroundColor="transparent" />
      <AppNavigator />
      <NumberKeyboardAccessory />
    </SafeAreaProvider>
  );
}
