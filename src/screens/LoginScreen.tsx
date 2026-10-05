import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { DevicePairingPrompt } from '../api/deviceAuth';
import { useAuth } from '../auth/AuthContext';
import { FocusablePressable } from '../components/FocusablePressable';
import {
  ArrowRightIcon,
  BackIcon,
  LogoMarkIcon,
  ServerIcon,
} from '../components/icons';
import { LoginCoverWall } from '../components/LoginCoverWall';
import { QrCode } from '../components/QrCode';
import { colors } from '../theme/colors';
import { createLogger } from '../utils/logger';

const log = createLogger('login');

/** "ABCD2345" as "ABCD-2345", easier to read off a TV across the room. */
function formatUserCode(code: string): string {
  return code.length === 8 ? `${code.slice(0, 4)}-${code.slice(4)}` : code;
}

/** "https://romm.home.local/pair?user_code=…" as "romm.home.local/pair". */
function displayUrl(url: string): string {
  return url.replace(/^[a-z]+:\/\//i, '').replace(/[?#].*$/, '');
}

/** Below this width the cover wall is dropped and the pairing card stacks. */
const WIDE_LAYOUT = 760;

const MONOSPACE = Platform.select({
  ios: 'Menlo',
  default: 'monospace',
});

function StepIndicator({ step }: { step: 1 | 2 }) {
  return (
    <View style={styles.steps}>
      <View style={[styles.stepBar, step === 1 && styles.stepBarActive]} />
      <View style={[styles.stepBar, step === 2 && styles.stepBarActive]} />
      <Text style={styles.stepText}>STEP {step} OF 2</Text>
    </View>
  );
}

function Instruction({
  index,
  children,
}: {
  index: number;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.instruction}>
      <View style={styles.instructionIndex}>
        <Text style={styles.instructionIndexText}>{index}</Text>
      </View>
      <Text style={styles.instructionText}>{children}</Text>
    </View>
  );
}

/** "Expires in m:ss", counting down from when the code was shown. */
function ExpiryCountdown({ seconds }: { seconds: number }) {
  const [remaining, setRemaining] = useState(seconds);

  useEffect(() => {
    const expiresAt = Date.now() + seconds * 1000;
    setRemaining(seconds);
    const timer = setInterval(() => {
      setRemaining(Math.max(0, Math.round((expiresAt - Date.now()) / 1000)));
    }, 1000);
    return () => clearInterval(timer);
  }, [seconds]);

  const minutes = Math.floor(remaining / 60);
  const secs = String(remaining % 60).padStart(2, '0');
  return (
    <View style={styles.expiry}>
      <Text style={styles.expiryText} testID="pairing-expiry">
        {remaining > 0 ? `Expires in ${minutes}:${secs}` : 'Expired'}
      </Text>
    </View>
  );
}

/** A softly pulsing dot, so the waiting state reads as alive. */
function PulsingDot() {
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const useNativeDriver = Platform.OS !== 'web';
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 0.35,
          duration: 800,
          useNativeDriver,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 800,
          useNativeDriver,
        }),
      ]),
    );
    pulse.start();
    return () => pulse.stop();
  }, [opacity]);

  return (
    <View style={styles.dotHalo}>
      <Animated.View style={[styles.dot, { opacity }]} />
    </View>
  );
}

export function LoginScreen() {
  const { pairDevice } = useAuth();
  const { width } = useWindowDimensions();
  const wide = width >= WIDE_LAYOUT;
  const [serverUrl, setServerUrl] = useState('');
  const [inputFocused, setInputFocused] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // The code RomM is waiting for someone to approve, while pairing.
  const [prompt, setPrompt] = useState<DevicePairingPrompt | null>(null);
  const pairingAbort = useRef<AbortController | null>(null);

  // Leaving the screen stops polling RomM for an approval.
  useEffect(() => () => pairingAbort.current?.abort(), []);

  const canSubmit = serverUrl.trim().length > 0;

  const handleSubmit = async () => {
    if (!canSubmit || submitting) {
      return;
    }
    setSubmitting(true);
    setError(null);
    const controller = new AbortController();
    pairingAbort.current = controller;
    try {
      await pairDevice(serverUrl, {
        onPrompt: setPrompt,
        signal: controller.signal,
      });
    } catch (e) {
      if (controller.signal.aborted) {
        return;
      }
      log.error(`sign-in failed for ${serverUrl}`, e);
      setError(e instanceof Error ? e.message : 'Unable to sign in');
    } finally {
      if (!controller.signal.aborted) {
        setSubmitting(false);
        setPrompt(null);
      }
    }
  };

  const cancelPairing = () => {
    pairingAbort.current?.abort();
    setSubmitting(false);
    setPrompt(null);
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {wide && !prompt && <LoginCoverWall />}

      <View style={styles.brand}>
        <View style={styles.logoBadge}>
          <LogoMarkIcon color={colors.textPrimary} size={20} />
        </View>
        <Text style={styles.brandText}>
          Romm<Text style={styles.brandAccent}>Stream</Text>
        </Text>
      </View>

      {prompt ? (
        <View
          style={[styles.content, wide ? styles.row : styles.stacked]}
          testID="pairing-prompt"
        >
          <View style={styles.column}>
            <StepIndicator step={2} />
            <Text style={styles.title}>Approve on your phone</Text>

            <View style={styles.instructions}>
              <Instruction index={1}>
                Scan the QR code, or open the link on any device signed in to
                RomM.
              </Instruction>
              <Instruction index={2}>
                Approve RommStream. Keep{' '}
                <Text style={styles.scope}>roms.user.write</Text> selected,
                since streaming needs it.
              </Instruction>
            </View>

            <View style={styles.waitingRow}>
              <PulsingDot />
              <Text style={styles.waitingText}>Waiting for approval</Text>
              <FocusablePressable
                style={styles.secondaryButton}
                focusedStyle={styles.secondaryButtonFocused}
                onPress={cancelPairing}
                hasTVPreferredFocus
                testID="pairing-cancel"
              >
                <BackIcon color={colors.textPrimary} size={18} />
                <Text style={styles.secondaryButtonText}>Cancel</Text>
              </FocusablePressable>
            </View>
          </View>

          <View style={styles.pairingCard}>
            <View style={styles.pairingCardHeader}>
              <Text style={styles.pairingCardTitle}>Scan to approve</Text>
              <ExpiryCountdown seconds={prompt.expiresInSeconds} />
            </View>

            <View style={styles.qrWrap}>
              <QrCode
                value={prompt.verificationUrl}
                size={176}
                testID="pairing-qr"
              />
            </View>

            <View style={styles.divider} />

            <Text style={styles.codeLabel}>OR ENTER THIS CODE</Text>
            <Text
              style={styles.userCode}
              numberOfLines={1}
              adjustsFontSizeToFit
              testID="pairing-user-code"
            >
              {formatUserCode(prompt.userCode)}
            </Text>
            <Text style={styles.codeAt}>
              at{' '}
              <Text style={styles.link} testID="pairing-url">
                {displayUrl(prompt.verificationUrl)}
              </Text>
            </Text>
          </View>
        </View>
      ) : (
        <View style={styles.content}>
          <View style={[styles.column, styles.formColumn]}>
            <StepIndicator step={1} />
            <Text style={styles.title}>Sign in</Text>

            <Text style={styles.label}>Server address</Text>
            <View
              style={[
                styles.inputRing,
                inputFocused && styles.inputRingFocused,
              ]}
            >
              <View
                style={[
                  styles.inputBox,
                  inputFocused && styles.inputBoxFocused,
                ]}
              >
                <ServerIcon
                  color={inputFocused ? colors.textPrimary : colors.textMuted}
                  size={20}
                />
                <TextInput
                  style={styles.input}
                  placeholder="https://romm.home.local"
                  placeholderTextColor={colors.textFaint}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="url"
                  value={serverUrl}
                  onChangeText={setServerUrl}
                  onSubmitEditing={handleSubmit}
                  onFocus={() => setInputFocused(true)}
                  onBlur={() => setInputFocused(false)}
                  hasTVPreferredFocus
                  testID="login-server-url"
                />
              </View>
            </View>

            {error && (
              <Text style={styles.error} testID="login-error">
                {error}
              </Text>
            )}

            <FocusablePressable
              style={[styles.button, !canSubmit && styles.buttonDisabled]}
              focusedStyle={styles.buttonFocused}
              onPress={handleSubmit}
              disabled={!canSubmit || submitting}
              testID="login-submit"
            >
              {submitting ? (
                <ActivityIndicator
                  color={colors.background}
                  testID="login-spinner"
                />
              ) : (
                <>
                  <Text style={styles.buttonText}>Get pairing code</Text>
                  <ArrowRightIcon color={colors.background} size={20} />
                </>
              )}
            </FocusablePressable>
          </View>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    paddingVertical: 32,
    paddingHorizontal: 60,
    overflow: 'hidden',
  },
  brand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  logoBadge: {
    width: 40,
    height: 40,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceSolid,
  },
  brandText: { color: colors.textPrimary, fontSize: 24, fontWeight: '800' },
  brandAccent: { color: colors.highlight },
  content: { flex: 1, justifyContent: 'center' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 48,
  },
  stacked: { gap: 32, paddingVertical: 24 },
  column: { flexShrink: 1, maxWidth: 440 },
  formColumn: { width: '45%', minWidth: 300 },
  steps: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 14,
  },
  stepBar: {
    width: 28,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.borderStrong,
  },
  stepBarActive: { backgroundColor: colors.accentLight },
  stepText: {
    marginLeft: 8,
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 2.5,
  },
  title: {
    fontSize: 44,
    lineHeight: 50,
    fontWeight: '800',
    color: colors.textPrimary,
    marginBottom: 24,
  },
  label: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 8,
  },
  inputRing: {
    borderWidth: 4,
    borderColor: 'transparent',
    borderRadius: 18,
    margin: -4,
    marginBottom: 14,
  },
  inputRingFocused: { borderColor: colors.accentLightGlow },
  inputBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    borderWidth: 1.5,
    borderColor: colors.borderInput,
    borderRadius: 14,
    backgroundColor: colors.surfaceSolid,
  },
  inputBoxFocused: { borderColor: colors.accentLight },
  input: {
    flex: 1,
    paddingVertical: 14,
    color: colors.textPrimary,
    fontSize: 17,
  },
  error: {
    color: colors.danger,
    marginBottom: 14,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 14,
    borderRadius: 16,
    backgroundColor: colors.accentLight,
  },
  buttonFocused: { borderColor: colors.textPrimary },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    color: colors.background,
    fontSize: 18,
    fontWeight: '800',
  },
  instructions: { gap: 18, marginBottom: 32 },
  instruction: { flexDirection: 'row', alignItems: 'flex-start', gap: 14 },
  instructionIndex: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: colors.accentLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  instructionIndexText: {
    color: colors.accentLight,
    fontSize: 13,
    fontWeight: '800',
  },
  instructionText: {
    flex: 1,
    color: colors.textSecondary,
    fontSize: 16,
    lineHeight: 22,
  },
  scope: { color: colors.highlight, fontWeight: '700' },
  waitingRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 12,
  },
  dotHalo: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.accentLight,
  },
  waitingText: {
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: '700',
    marginRight: 6,
  },
  secondaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 14,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surfaceSolid,
  },
  secondaryButtonFocused: { borderColor: colors.accentLight },
  secondaryButtonText: {
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: '700',
  },
  pairingCard: {
    width: 340,
    flexShrink: 0,
    alignSelf: 'center',
    alignItems: 'center',
    padding: 22,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceSolid,
  },
  pairingCardHeader: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  pairingCardTitle: {
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: '700',
  },
  expiry: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  expiryText: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '700',
  },
  qrWrap: {
    padding: 10,
    borderRadius: 16,
    backgroundColor: '#ffffff',
  },
  divider: {
    alignSelf: 'stretch',
    height: 1,
    backgroundColor: colors.border,
    marginVertical: 16,
  },
  codeLabel: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 2.5,
    marginBottom: 6,
  },
  userCode: {
    color: colors.highlight,
    fontFamily: MONOSPACE,
    fontSize: 38,
    fontWeight: '800',
    letterSpacing: 4,
    marginBottom: 6,
  },
  codeAt: { color: colors.textSecondary, fontSize: 14 },
  link: { color: colors.accentLight, fontWeight: '600' },
});
