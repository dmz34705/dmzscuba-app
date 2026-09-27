import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { smartImportFlights } from '../../../lib/flightImportApi';
import { colors, radii } from '../../../theme';
import { EditorSheet } from '../fields';
import { todayString } from '../model';
import { readConfirmation } from './readConfirmation';

const MAX_PDF_BYTES = 6 * 1024 * 1024;

async function pickConfirmationFile() {
  let DocumentPicker, FileSystem;
  try {
    DocumentPicker = require('expo-document-picker');
    FileSystem = require('expo-file-system');
  } catch {
    throw new Error('Choosing a file needs the full app build.');
  }
  const result = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
  if (result.canceled) return null;
  const asset = result.assets[0];
  const file = new FileSystem.File(asset.uri);
  const pdf = /pdf/i.test(asset.mimeType || '') || /\.pdf$/i.test(asset.name || '');
  if (pdf) {
    if (asset.size && asset.size > MAX_PDF_BYTES) throw new Error('That PDF is too large. Try the confirmation email instead.');
    return { name: asset.name || 'Receipt.pdf', pdfBase64: await file.base64() };
  }
  return { name: asset.name || 'Email', raw: await file.text() };
}

// Paste an airline confirmation or choose the saved email / PDF; `onResult` gets the flights to
// review in the flight editor.
export default function ImportFlightsSheet({ visible, signedIn, onCancel, onResult }) {
  const [text, setText] = useState('');
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { if (visible) { setText(''); setFile(null); setError(''); setBusy(false); } }, [visible]);

  const choose = async () => {
    setError('');
    try { const picked = await pickConfirmationFile(); if (picked) setFile(picked); } catch (nextError) { setError(nextError?.message || 'That file could not be opened.'); }
  };
  const read = async () => {
    setBusy(true); setError('');
    try {
      const result = await readConfirmation({
        raw: file?.raw || text, pdfBase64: file?.pdfBase64 || '', signedIn, today: todayString(), smartImport: smartImportFlights,
      });
      onResult(result);
    } catch (nextError) {
      setError(nextError?.message || 'That email could not be read.');
    } finally {
      setBusy(false);
    }
  };
  const ready = Boolean(file || text.trim()) && !busy;

  return (
    <EditorSheet eyebrow="FLIGHTS" onCancel={onCancel} onSave={read} saveDisabled={!ready} saveLabel="Read" title="Import from email" visible={visible}>
      <Text style={styles.lead}>Paste your airline’s confirmation email, or choose the saved email or PDF receipt. You’ll check every flight before it’s added.</Text>
      {file ? (
        <View style={styles.file}>
          <Text numberOfLines={1} style={styles.fileName}>{file.pdfBase64 ? 'PDF · ' : 'Email · '}{file.name}</Text>
          <Pressable accessibilityRole="button" hitSlop={10} onPress={() => setFile(null)}><Text style={styles.link}>Remove</Text></Pressable>
        </View>
      ) : (
        <TextInput
          accessibilityLabel="Confirmation email"
          autoCapitalize="none"
          autoCorrect={false}
          multiline
          onChangeText={setText}
          placeholder="Paste the confirmation email here…"
          placeholderTextColor={colors.faint}
          style={styles.paste}
          textAlignVertical="top"
          value={text}
        />
      )}
      {!file ? (
        <Pressable accessibilityRole="button" onPress={choose} style={({ pressed }) => [styles.choose, pressed && styles.pressed]}>
          <Text style={styles.link}>Choose a file (.eml or PDF)</Text>
        </Pressable>
      ) : null}
      {busy ? <View style={styles.busy}><ActivityIndicator color={colors.cyan} /><Text style={styles.busyText}>Reading your confirmation…</Text></View> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Text style={styles.tip}>In Mail, press and hold the message text, tap Select All, then Copy. Forwarded emails work too.</Text>
      <Text style={styles.privacy}>
        Emails are read on this phone first. {signedIn
          ? 'If it can’t fill in every flight — or you choose a PDF — smart import sends the email to DMZ Scuba’s server, which uses Google Gemini to read it. Nothing is kept.'
          : 'Sign in to your DMZ account to turn on smart import for emails this phone can’t read, and for PDFs.'}
      </Text>
    </EditorSheet>
  );
}

const styles = StyleSheet.create({
  lead: { color: colors.muted, fontSize: 14, lineHeight: 20, marginBottom: 14 },
  paste: { backgroundColor: colors.backgroundRaised, borderColor: colors.lineStrong, borderRadius: radii.md, borderWidth: 1, color: colors.text, fontSize: 13, lineHeight: 18, minHeight: 200, padding: 12 },
  choose: { alignItems: 'center', justifyContent: 'center', minHeight: 48, marginTop: 6 },
  file: { alignItems: 'center', backgroundColor: colors.surface, borderColor: colors.lineStrong, borderRadius: radii.md, borderWidth: 1, flexDirection: 'row', gap: 12, minHeight: 56, paddingHorizontal: 14 },
  fileName: { color: colors.text, flex: 1, fontSize: 15, fontWeight: '700' },
  link: { color: colors.cyan, fontSize: 14, fontWeight: '800' },
  busy: { alignItems: 'center', flexDirection: 'row', gap: 10, marginTop: 12 },
  busyText: { color: colors.muted, fontSize: 13, fontWeight: '700' },
  error: { color: colors.danger, fontSize: 13, lineHeight: 19, marginTop: 12 },
  tip: { color: colors.faint, fontSize: 12, lineHeight: 17, marginTop: 14 },
  privacy: { color: colors.faint, fontSize: 11, lineHeight: 16, marginTop: 8 },
  pressed: { opacity: 0.74 },
});
