import { requireNativeViewManager, requireOptionalNativeModule } from 'expo-modules-core';
import { PermissionsAndroid, Platform } from 'react-native';

const module = requireOptionalNativeModule('ColorLossCamera');
export const CameraPreview = module ? requireNativeViewManager('ColorLossCamera') : null;
export async function requestCameraPermission() {
  if (!module) return false;
  if (Platform.OS === 'android') {
    return (await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.CAMERA)) === PermissionsAndroid.RESULTS.GRANTED;
  }
  return module.requestPermission();
}
