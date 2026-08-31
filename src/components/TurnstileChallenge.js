import { forwardRef, useCallback, useImperativeHandle, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';

import { ACCOUNT_CHALLENGE_URL } from '../lib/accountApi';
import { colors, radii } from '../theme';

WebBrowser.maybeCompleteAuthSession();

const TurnstileChallenge = forwardRef(function TurnstileChallenge({
  action = 'mobile_login',
  completeMessage = 'Signing you in now.',
  idleMessage = 'Tap Sign in securely to verify and continue.',
  onToken,
  onUnavailable,
  onCancel,
}, ref) {
  const [status, setStatus] = useState('idle');
  const inFlightRef = useRef(false);

  const reset = useCallback(() => {
    inFlightRef.current = false;
    setStatus('idle');
  }, []);

  const openChallenge = useCallback(async () => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    setStatus('opening');

    const callbackUrl = Linking.createURL('account/challenge');
    const state = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
    const challengeUrl = `${ACCOUNT_CHALLENGE_URL}?callback=${encodeURIComponent(callbackUrl)}&state=${encodeURIComponent(state)}&action=${encodeURIComponent(action)}`;
    let completed = false;

    const acceptCallback = (url) => {
      if (!url || completed) return false;
      const parsed = Linking.parse(url);
      const returnedState = String(parsed.queryParams?.state || '');
      const token = String(parsed.queryParams?.captchaToken || '');
      if (!token || returnedState !== state) return false;
      completed = true;
      inFlightRef.current = false;
      setStatus('complete');
      try {
        WebBrowser.dismissAuthSession();
      } catch {
        // A successful native auth session may already be closing itself.
      }
      onToken(token);
      return true;
    };

    const linkSubscription = Linking.addEventListener('url', ({ url }) => {
      acceptCallback(url);
    });

    try {
      const result = await WebBrowser.openAuthSessionAsync(challengeUrl, callbackUrl);
      if (completed) return;
      if (result.type === 'success' && acceptCallback(result.url)) return;
      if (result.type === 'cancel' || result.type === 'dismiss') {
        inFlightRef.current = false;
        setStatus('idle');
        onCancel?.();
        return;
      }
      throw new Error('The security browser did not return a verification result.');
    } catch (error) {
      if (completed) return;
      inFlightRef.current = false;
      setStatus('error');
      onUnavailable(error?.message || 'The security check could not be completed. Please try again.');
    } finally {
      linkSubscription.remove();
    }
  }, [action, onCancel, onToken, onUnavailable]);

  useImperativeHandle(ref, () => ({ start: openChallenge, reset }), [openChallenge, reset]);

  const title = status === 'opening'
    ? 'Complete the check in your browser'
    : status === 'complete'
      ? 'Security check complete'
      : status === 'error'
        ? 'Security check needs another try'
        : 'Security check ready';
  const body = status === 'opening'
    ? 'This screen will resume automatically after verification.'
    : status === 'complete'
      ? completeMessage
      : idleMessage;

  return (
    <View style={styles.shell}>
      <View style={styles.copy}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.body}>{body}</Text>
      </View>
      {status === 'opening' ? <ActivityIndicator color={colors.cyan} /> : <View style={[styles.statusDot, status === 'complete' && styles.statusDotComplete]} />}
    </View>
  );
});

export default TurnstileChallenge;

const styles = StyleSheet.create({
  shell: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.lineStrong,
    borderRadius: radii.md,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
    marginBottom: 13,
    minHeight: 78,
    padding: 12,
  },
  copy: { flex: 1 },
  title: { color: colors.text, fontSize: 13, fontWeight: '800' },
  body: { color: colors.muted, fontSize: 10, lineHeight: 15, marginTop: 3 },
  statusDot: { backgroundColor: colors.faint, borderRadius: 999, height: 10, width: 10 },
  statusDotComplete: { backgroundColor: colors.cyan },
});
