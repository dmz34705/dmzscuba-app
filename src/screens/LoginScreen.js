import { useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';

import { FormError, FormField } from '../components/AccountForm';
import { ScreenHeader } from '../components/AppShell';
import TurnstileChallenge from '../components/TurnstileChallenge';
import { PrimaryButton, SecondaryButton } from '../components/Ui';
import { validateLogin } from '../lib/accountProfile';
import { colors, radii, spacing } from '../theme';

export default function LoginScreen({ onBack, onCreateAccount, onSignIn, initialEmail = '' }) {
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [challengeError, setChallengeError] = useState('');
  const [phase, setPhase] = useState('idle');
  const challengeRef = useRef(null);
  const pendingLoginRef = useRef(null);

  const submit = () => {
    const nextError = validateLogin({ email, password });
    setError(nextError);
    if (nextError) return;
    pendingLoginRef.current = { email, password };
    setChallengeError('');
    setBusy(true);
    setPhase('verifying');
    challengeRef.current?.start();
  };

  const completeSignIn = async (captchaToken) => {
    const pendingLogin = pendingLoginRef.current;
    if (!pendingLogin || !captchaToken) return;
    setPhase('signingIn');
    try {
      await onSignIn({ ...pendingLogin, captchaToken });
      setPassword('');
    } catch (nextErrorValue) {
      setError(nextErrorValue?.message || 'Sign in could not be completed. Please try again.');
      setChallengeError('');
      challengeRef.current?.reset();
    } finally {
      pendingLoginRef.current = null;
      setBusy(false);
      setPhase('idle');
    }
  };

  const cancelChallenge = () => {
    pendingLoginRef.current = null;
    setBusy(false);
    setPhase('idle');
  };

  const failChallenge = (message) => {
    pendingLoginRef.current = null;
    setChallengeError(message);
    setBusy(false);
    setPhase('idle');
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.screen}>
      <ScreenHeader eyebrow="DMZ SCUBA ACCOUNT" title="Sign In" onBack={onBack} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>Welcome back.</Text>
        <Text style={styles.subtitle}>Use the same email and password as your DMZScuba.com account.</Text>
        <View style={styles.formCard}>
          <FormField label="Email" value={email} onChangeText={setEmail} placeholder="you@example.com" keyboardType="email-address" autoCapitalize="none" />
          <FormField label="Password" value={password} onChangeText={setPassword} placeholder="Enter your password" secureTextEntry autoCapitalize="none" />
          <Text style={styles.securityLabel}>SECURITY CHECK</Text>
          <TurnstileChallenge
            ref={challengeRef}
            onToken={(token) => { setChallengeError(''); setError(''); completeSignIn(token); }}
            onUnavailable={failChallenge}
            onCancel={cancelChallenge}
          />
          {challengeError ? <Text accessibilityRole="alert" style={styles.challengeError}>{challengeError}</Text> : null}
          <FormError message={error} />
          <PrimaryButton
            disabled={busy}
            label={phase === 'signingIn' ? 'Signing in…' : phase === 'verifying' ? 'Verifying securely…' : 'Sign in securely'}
            onPress={submit}
          />
          <SecondaryButton label="Create a new account" onPress={onCreateAccount} style={styles.secondaryButton} />
          <Text style={styles.securityNote}>Your password is sent directly to the shared DMZ Scuba authentication service and is never stored by this app.</Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: colors.background, flex: 1 },
  content: { padding: spacing.md, paddingBottom: spacing.xl },
  title: { color: colors.text, fontSize: 30, fontWeight: '900', letterSpacing: -0.7, marginTop: 6 },
  subtitle: { color: colors.muted, fontSize: 14, lineHeight: 21, marginBottom: 17, marginTop: 7 },
  formCard: { backgroundColor: colors.surfaceGlass, borderColor: colors.lineStrong, borderRadius: radii.lg, borderWidth: 1, padding: spacing.md },
  securityLabel: { color: colors.muted, fontSize: 11, fontWeight: '800', letterSpacing: 0.45, marginBottom: 7, textTransform: 'uppercase' },
  challengeError: { color: colors.warning, fontSize: 11, lineHeight: 16, marginBottom: 8 },
  securityNote: { color: colors.faint, fontSize: 10, lineHeight: 15, marginTop: 12, textAlign: 'center' },
  secondaryButton: { marginTop: 9 },
});
