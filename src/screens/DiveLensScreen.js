import { useState } from 'react';
import { ActivityIndicator, Alert, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ScreenHeader, SectionLabel } from '../components/AppShell';
import { Card, PrimaryButton, SecondaryButton } from '../components/Ui';
import { identifyPhoto } from '../lib/lensApi';
import { colors, radii, shadow, spacing } from '../theme';

const CONFIDENCE_LABEL = { high: 'High confidence', medium: 'Medium confidence', low: 'Low confidence' };
const CATEGORY_LABEL = { marine_life: 'MARINE LIFE', gear: 'DIVE GEAR', unclear: 'UNIDENTIFIED' };

function PickerOption({ icon, title, body, onPress }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={title} onPress={onPress} style={({ pressed }) => [styles.pickerOption, pressed && styles.pressed]}>
      <Text style={styles.pickerIcon}>{icon}</Text>
      <View style={styles.pickerCopy}>
        <Text style={styles.pickerTitle}>{title}</Text>
        <Text style={styles.pickerBody}>{body}</Text>
      </View>
    </Pressable>
  );
}

export default function DiveLensScreen({ onBack }) {
  const insets = useSafeAreaInsets();
  const [photo, setPhoto] = useState(null);
  const [status, setStatus] = useState('idle');
  const [result, setResult] = useState(null);
  const [errorMessage, setErrorMessage] = useState('');

  const runIdentify = async (asset) => {
    setPhoto(asset);
    setResult(null);
    setErrorMessage('');
    setStatus('loading');
    try {
      const identified = await identifyPhoto({ base64: asset.base64, mimeType: asset.mimeType || 'image/jpeg' });
      setResult(identified);
      setStatus('result');
    } catch (error) {
      setErrorMessage(error?.message || 'That photo could not be analyzed. Try a clearer, closer shot.');
      setStatus('error');
    }
  };

  const takePhoto = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Camera access needed', 'Enable camera access for DMZ Scuba in your device settings to use Dive Lens.');
      return;
    }
    const capture = await ImagePicker.launchCameraAsync({ base64: true, quality: 0.5, allowsEditing: true });
    if (capture.canceled || !capture.assets?.[0]) return;
    await runIdentify(capture.assets[0]);
  };

  const pickPhoto = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Photo access needed', 'Enable photo library access for DMZ Scuba in your device settings to use Dive Lens.');
      return;
    }
    const picked = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], base64: true, quality: 0.5, allowsEditing: true });
    if (picked.canceled || !picked.assets?.[0]) return;
    await runIdentify(picked.assets[0]);
  };

  const reset = () => {
    setPhoto(null);
    setResult(null);
    setErrorMessage('');
    setStatus('idle');
  };

  return (
    <View style={styles.screen}>
      <ScreenHeader title="Dive Lens" onBack={onBack} />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]} showsVerticalScrollIndicator={false}>
        {status === 'idle' && (
          <>
            <SectionLabel>AI PHOTO ID</SectionLabel>
            <Text style={styles.title}>What am I looking at?</Text>
            <Text style={styles.subtitle}>Snap or upload a photo of a sea creature or piece of dive gear and Dive Lens will identify it for you.</Text>

            <PickerOption icon="📷" title="Take a photo" body="Use your camera to capture a creature or gear now." onPress={takePhoto} />
            <PickerOption icon="🖼️" title="Choose from library" body="Analyze a photo you already have saved." onPress={pickPhoto} />

            <Card style={styles.tipCard}>
              <Text style={styles.tipTitle}>Tips for a good ID</Text>
              <Text style={styles.tipBody}>Fill the frame with the subject, keep it in focus, and avoid strong backlight. One clear subject works better than a wide scene.</Text>
            </Card>
            <Text style={styles.disclaimer}>AI identification is for educational purposes only. Never touch unfamiliar marine life—verify anything safety-critical, like a possible venomous or hazardous species, with your instructor or dive guide.</Text>
          </>
        )}

        {status !== 'idle' && photo && (
          <View style={styles.previewShell}>
            <Image source={{ uri: photo.uri }} style={styles.previewImage} resizeMode="cover" />
            {status === 'loading' && (
              <View style={styles.previewOverlay}>
                <ActivityIndicator color={colors.cyan} size="large" />
                <Text style={styles.previewOverlayText}>Identifying…</Text>
              </View>
            )}
          </View>
        )}

        {status === 'error' && (
          <Card style={styles.errorCard}>
            <Text style={styles.errorTitle}>Couldn’t identify that photo</Text>
            <Text style={styles.errorBody}>{errorMessage}</Text>
            <View style={styles.resultActions}>
              <SecondaryButton label="Try again" onPress={reset} style={styles.resultButton} />
            </View>
          </Card>
        )}

        {status === 'result' && result && (
          <>
            <Card style={styles.resultCard}>
              <View style={styles.resultBadgeRow}>
                <View style={styles.categoryBadge}><Text style={styles.categoryBadgeText}>{CATEGORY_LABEL[result.category]}</Text></View>
                <Text style={styles.confidenceText}>{CONFIDENCE_LABEL[result.confidence]}</Text>
              </View>
              <Text style={styles.resultName}>{result.commonName}</Text>
              {result.scientificName && <Text style={styles.resultScientific}>{result.scientificName}</Text>}
              {result.description ? <Text style={styles.resultDescription}>{result.description}</Text> : null}
            </Card>

            {result.safetyNote && (
              <Card style={styles.safetyCard}>
                <Text style={styles.safetyLabel}>⚠ SAFETY NOTE</Text>
                <Text style={styles.safetyBody}>{result.safetyNote}</Text>
              </Card>
            )}

            {result.funFact && (
              <Card style={styles.factCard}>
                <Text style={styles.factLabel}>DID YOU KNOW</Text>
                <Text style={styles.factBody}>{result.funFact}</Text>
              </Card>
            )}

            <View style={styles.resultActions}>
              <PrimaryButton label="Scan another" onPress={reset} style={styles.resultButtonFlex} />
            </View>
            <Text style={styles.disclaimer}>AI identification is for educational purposes only and can be wrong—verify anything safety-critical with your instructor or dive guide.</Text>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: colors.background, flex: 1 },
  content: { paddingHorizontal: spacing.md, paddingTop: spacing.lg },
  title: { color: colors.text, fontSize: 29, fontWeight: '900', letterSpacing: -0.7, lineHeight: 34 },
  subtitle: { color: colors.muted, fontSize: 14, lineHeight: 21, marginBottom: spacing.lg, marginTop: 8 },
  pickerOption: { alignItems: 'center', backgroundColor: colors.surface, borderColor: colors.line, borderRadius: radii.lg, borderWidth: 1, flexDirection: 'row', marginBottom: 12, minHeight: 84, padding: 16, ...shadow },
  pickerIcon: { fontSize: 30, marginRight: 14, width: 36 },
  pickerCopy: { flex: 1 },
  pickerTitle: { color: colors.text, fontSize: 16, fontWeight: '800' },
  pickerBody: { color: colors.muted, fontSize: 12, lineHeight: 17, marginTop: 3 },
  pressed: { opacity: 0.8, transform: [{ scale: 0.99 }] },
  tipCard: { backgroundColor: '#0B2838', borderColor: 'rgba(112,221,246,.34)', marginTop: 4 },
  tipTitle: { color: colors.cyan, fontSize: 12, fontWeight: '900', letterSpacing: 0.6 },
  tipBody: { color: colors.text, fontSize: 13, lineHeight: 19, marginTop: 6 },
  disclaimer: { color: colors.faint, fontSize: 11, lineHeight: 17, marginHorizontal: 4, marginTop: 16, textAlign: 'center' },
  previewShell: { borderColor: colors.lineStrong, borderRadius: radii.lg, borderWidth: 1, marginBottom: 12, overflow: 'hidden', ...shadow },
  previewImage: { backgroundColor: colors.surface, height: 280, width: '100%' },
  previewOverlay: { alignItems: 'center', backgroundColor: 'rgba(2,10,18,0.68)', bottom: 0, justifyContent: 'center', left: 0, position: 'absolute', right: 0, top: 0 },
  previewOverlayText: { color: colors.text, fontSize: 13, fontWeight: '800', marginTop: 10 },
  errorCard: { borderColor: 'rgba(255,127,127,0.4)' },
  errorTitle: { color: colors.danger, fontSize: 16, fontWeight: '800' },
  errorBody: { color: colors.muted, fontSize: 13, lineHeight: 19, marginTop: 6 },
  resultCard: {},
  resultBadgeRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  categoryBadge: { backgroundColor: 'rgba(112,221,246,0.12)', borderColor: colors.cyan, borderRadius: radii.pill, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 5 },
  categoryBadgeText: { color: colors.cyan, fontSize: 10, fontWeight: '900', letterSpacing: 1 },
  confidenceText: { color: colors.muted, fontSize: 11, fontWeight: '700' },
  resultName: { color: colors.text, fontSize: 24, fontWeight: '900', letterSpacing: -0.4, marginTop: 12 },
  resultScientific: { color: colors.muted, fontSize: 14, fontStyle: 'italic', marginTop: 2 },
  resultDescription: { color: colors.text, fontSize: 14, lineHeight: 21, marginTop: 12 },
  safetyCard: { backgroundColor: 'rgba(255,127,127,0.08)', borderColor: 'rgba(255,127,127,0.4)' },
  safetyLabel: { color: colors.danger, fontSize: 11, fontWeight: '900', letterSpacing: 1 },
  safetyBody: { color: colors.text, fontSize: 13, lineHeight: 19, marginTop: 6 },
  factCard: { backgroundColor: '#0B2838', borderColor: 'rgba(112,221,246,.34)' },
  factLabel: { color: colors.cyan, fontSize: 10, fontWeight: '900', letterSpacing: 1.2 },
  factBody: { color: colors.text, fontSize: 13, lineHeight: 19, marginTop: 6 },
  resultActions: { flexDirection: 'row', gap: 9, marginTop: 4 },
  resultButton: { flex: 1 },
  resultButtonFlex: { flex: 1 },
});
