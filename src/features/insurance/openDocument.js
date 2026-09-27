import { Alert, Linking } from 'react-native';

// Opens a saved document in the system viewer (Quick Look / share sheet), like gear documents.
export async function openDocument(document) {
  try {
    const Sharing = require('expo-sharing');
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(document.uri, { mimeType: document.mimeType || undefined, dialogTitle: document.name });
      return;
    }
    await Linking.openURL(document.uri);
  } catch {
    Alert.alert('Couldn’t open that document', 'It may have been removed from this phone.');
  }
}

export function callNumber(phone) {
  const digits = String(phone || '').replace(/[^+\d]/g, '');
  if (digits) Linking.openURL(`tel:${digits}`).catch(() => {});
}
