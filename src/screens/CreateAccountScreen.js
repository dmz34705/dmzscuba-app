import { useRef, useState } from 'react';
import { KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { FormError, FormField } from '../components/AccountForm';
import { ScreenHeader } from '../components/AppShell';
import TurnstileChallenge from '../components/TurnstileChallenge';
import { PrimaryButton, SecondaryButton } from '../components/Ui';
import { validateCreateAccount } from '../lib/accountProfile';
import { colors, radii, spacing } from '../theme';

export default function CreateAccountScreen({
  initialProfile,
  onBack,
  onCreateAccount,
  onSignIn,
  onVerified,
  onVerify,
}) {
  const [firstName, setFirstName] = useState(initialProfile.firstName);
  const [lastName, setLastName] = useState(initialProfile.lastName);
  const [email, setEmail] = useState(initialProfile.email);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [acceptedPrivacy, setAcceptedPrivacy] = useState(false);
  const [verificationCode, setVerificationCode] = useState('');
  const [step, setStep] = useState('details');
  const [phase, setPhase] = useState('idle');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const challengeRef = useRef(null);
  const pendingAccountRef = useRef(null);

  const beginCreation = () => {
    const values = { firstName, lastName, email, password, confirmPassword };
    const nextError = validateCreateAccount(values);
    if (nextError) {
      setError(nextError);
      return;
    }
    if (!acceptedPrivacy) {
      setError('Agree to the DMZ Scuba Privacy Policy to create your account.');
      return;
    }
    pendingAccountRef.current = {
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      email: email.trim().toLowerCase(),
      password,
    };
    setError('');
    setBusy(true);
    setPhase('verifying');
    challengeRef.current?.start();
  };

  const createVerifiedAccount = async (captchaToken) => {
    const pendingAccount = pendingAccountRef.current;
    if (!pendingAccount || !captchaToken) return;
    setPhase('creating');
    try {
      const result = await onCreateAccount({ ...pendingAccount, captchaToken });
      setPassword('');
      setConfirmPassword('');
      pendingAccountRef.current = null;
      if (result?.verificationRequired === false) {
        await onVerified();
        return;
      }
      setStep('verify');
      setError('');
      challengeRef.current?.reset();
    } catch (nextError) {
      pendingAccountRef.current = null;
      setError(nextError?.message || 'Account creation could not be completed. Please try again.');
      challengeRef.current?.reset();
    } finally {
      setBusy(false);
      setPhase('idle');
    }
  };

  const verifyEmail = async () => {
    const token = verificationCode.trim().replace(/\s+/g, '');
    if (!/^\d{6}$/.test(token)) {
      setError('Enter the six-digit verification code from your email.');
      return;
    }
    setBusy(true);
    setPhase('confirming');
    setError('');
    try {
      await onVerify({ email: email.trim().toLowerCase(), token });
      await onVerified();
    } catch (nextError) {
      setError(nextError?.message || 'The verification code is invalid or expired.');
    } finally {
      setBusy(false);
      setPhase('idle');
    }
  };

  const cancelChallenge = () => {
    pendingAccountRef.current = null;
    setBusy(false);
    setPhase('idle');
  };

  const failChallenge = (message) => {
    pendingAccountRef.current = null;
    setError(message);
    setBusy(false);
    setPhase('idle');
  };

  const handleBack = () => {
    if (step === 'verify') {
      setStep('details');
      setVerificationCode('');
      setError('');
      return;
    }
    onBack();
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.screen}>
      <ScreenHeader eyebrow="DMZ SCUBA ACCOUNT" title={step === 'verify' ? 'Verify Email' : 'Create Account'} onBack={handleBack} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        {step === 'details' ? (
          <>
            <Text style={styles.stepLabel}>STEP 1 OF 2</Text>
            <Text style={styles.title}>Create your diver account.</Text>
            <Text style={styles.subtitle}>Use an email address you can access. We will send a verification code before opening your account.</Text>
            <View style={styles.formCard}>
              <View style={styles.twoColumn}>
                <View style={styles.half}><FormField autoComplete="given-name" label="First name" maxLength={80} onChangeText={setFirstName} placeholder="First" textContentType="givenName" value={firstName} /></View>
                <View style={styles.half}><FormField autoComplete="family-name" label="Last name" maxLength={80} onChangeText={setLastName} placeholder="Last" textContentType="familyName" value={lastName} /></View>
              </View>
              <FormField autoCapitalize="none" autoComplete="email" keyboardType="email-address" label="Email" maxLength={180} onChangeText={setEmail} placeholder="you@example.com" textContentType="emailAddress" value={email} />
              <FormField autoCapitalize="none" autoComplete="new-password" helper="Use at least 12 characters." label="Password" maxLength={128} onChangeText={setPassword} placeholder="Create a secure password" secureTextEntry textContentType="newPassword" value={password} />
              <FormField autoCapitalize="none" autoComplete="new-password" label="Confirm password" maxLength={128} onChangeText={setConfirmPassword} placeholder="Re-enter password" secureTextEntry textContentType="newPassword" value={confirmPassword} />

              <Pressable
                accessibilityRole="checkbox"
                accessibilityState={{ checked: acceptedPrivacy }}
                onPress={() => setAcceptedPrivacy((current) => !current)}
                style={({ pressed }) => [styles.checkboxRow, pressed && styles.pressed]}
              >
                <View style={[styles.checkbox, acceptedPrivacy && styles.checkboxChecked]}>{acceptedPrivacy ? <Text style={styles.checkmark}>✓</Text> : null}</View>
                <Text style={styles.checkboxText}>I agree to the DMZ Scuba Privacy Policy.</Text>
              </Pressable>
              <Pressable accessibilityRole="link" onPress={() => Linking.openURL('https://www.dmzscuba.com/pages/privacy/')}>
                <Text style={styles.privacyLink}>Read the Privacy Policy</Text>
              </Pressable>

              <Text style={styles.securityLabel}>SECURITY CHECK</Text>
              <TurnstileChallenge
                action="mobile_signup"
                completeMessage="Creating your account now."
                idleMessage="Tap Create account securely to verify and continue."
                onCancel={cancelChallenge}
                onToken={createVerifiedAccount}
                onUnavailable={failChallenge}
                ref={challengeRef}
              />
              <FormError message={error} />
              <PrimaryButton
                disabled={busy}
                label={phase === 'verifying' ? 'Verifying securely…' : phase === 'creating' ? 'Creating account…' : 'Create account securely'}
                onPress={beginCreation}
              />
              <SecondaryButton label="I already have an account" onPress={onSignIn} style={styles.secondaryButton} />
            </View>
          </>
        ) : (
          <>
            <Text style={styles.stepLabel}>STEP 2 OF 2</Text>
            <Text style={styles.title}>Check your email.</Text>
            <Text style={styles.subtitle}>Enter the six-digit code sent to {email.trim().toLowerCase()} to finish creating your DMZ Scuba account.</Text>
            <View style={styles.formCard}>
              <FormField
                autoCapitalize="none"
                autoComplete="one-time-code"
                keyboardType="number-pad"
                label="Verification code"
                maxLength={6}
                onChangeText={setVerificationCode}
                placeholder="000000"
                textContentType="oneTimeCode"
                value={verificationCode}
              />
              <FormError message={error} />
              <PrimaryButton disabled={busy} label={busy ? 'Verifying email…' : 'Verify and open my account'} onPress={verifyEmail} />
              <SecondaryButton label="Use a different email" onPress={handleBack} style={styles.secondaryButton} />
              <Text style={styles.codeNote}>The code expires for security. If it has expired, return to the previous step and submit the account form again to request a new one.</Text>
            </View>
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: colors.background, flex: 1 },
  content: { padding: spacing.md, paddingBottom: spacing.xl },
  stepLabel: { color: colors.cyan, fontSize: 10, fontWeight: '900', letterSpacing: 1.15, marginTop: 6 },
  title: { color: colors.text, fontSize: 30, fontWeight: '900', letterSpacing: -0.7, marginTop: 5 },
  subtitle: { color: colors.muted, fontSize: 14, lineHeight: 21, marginBottom: 17, marginTop: 7 },
  formCard: { backgroundColor: colors.surfaceGlass, borderColor: colors.lineStrong, borderRadius: radii.lg, borderWidth: 1, padding: spacing.md },
  twoColumn: { flexDirection: 'row', gap: 9 },
  half: { flex: 1 },
  checkboxRow: { alignItems: 'center', flexDirection: 'row', gap: 10, marginBottom: 4 },
  checkbox: { alignItems: 'center', borderColor: colors.lineStrong, borderRadius: 5, borderWidth: 1, height: 23, justifyContent: 'center', width: 23 },
  checkboxChecked: { backgroundColor: colors.cyan, borderColor: colors.cyan },
  checkmark: { color: colors.background, fontSize: 15, fontWeight: '900' },
  checkboxText: { color: colors.text, flex: 1, fontSize: 12, fontWeight: '700', lineHeight: 18 },
  privacyLink: { color: colors.cyan, fontSize: 11, fontWeight: '700', marginBottom: 16, marginLeft: 33, textDecorationLine: 'underline' },
  securityLabel: { color: colors.muted, fontSize: 11, fontWeight: '800', letterSpacing: 0.45, marginBottom: 7, textTransform: 'uppercase' },
  secondaryButton: { marginTop: 9 },
  codeNote: { color: colors.faint, fontSize: 10, lineHeight: 16, marginTop: 13, textAlign: 'center' },
  pressed: { opacity: 0.72 },
});
