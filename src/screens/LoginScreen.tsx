import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { DevicePairingPrompt } from '../api/deviceAuth';
import { useAuth } from '../auth/AuthContext';
import { FocusablePressable } from '../components/FocusablePressable';
import { ArrowRightIcon, LogoMarkIcon } from '../components/icons';
import { QrCode } from '../components/QrCode';
import { colors } from '../theme/colors';
import { createLogger } from '../utils/logger';

const log = createLogger('login');

/** "ABCD2345" as "ABCD-2345", easier to read off a TV across the room. */
function formatUserCode(code: string): string {
  return code.length === 8 ? `${code.slice(0, 4)}-${code.slice(4)}` : code;
}

export function LoginScreen() {
  const { pairDevice } = useAuth();
  const [serverUrl, setServerUrl] = useState('');
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
      <View style={styles.glowAccent} pointerEvents="none" />
      <View style={styles.glowSoft} pointerEvents="none" />

      <View style={styles.brand}>
        <View style={styles.logoBadge}>
          <LogoMarkIcon color={colors.textPrimary} size={20} />
        </View>
        <Text style={styles.brandText}>RommStream</Text>
      </View>

      <View style={styles.centerWrap}>
        {prompt ? (
          <View
            style={[styles.card, styles.pairingCard]}
            testID="pairing-prompt"
          >
            <Text style={styles.title}>Approve this device</Text>
            <Text style={styles.subtitle}>
              Scan the code with your phone, or open the link on any device
              signed in to RomM, and approve RommStream there.
            </Text>

            <View style={styles.pairingRow}>
              <View style={styles.qrWrap}>
                <QrCode
                  value={prompt.verificationUrl}
                  size={168}
                  testID="pairing-qr"
                />
              </View>
              <View style={styles.pairingDetails}>
                <Text style={styles.label}>Code</Text>
                <Text
                  style={styles.userCode}
                  numberOfLines={1}
                  testID="pairing-user-code"
                >
                  {formatUserCode(prompt.userCode)}
                </Text>
                <Text style={styles.label}>Link</Text>
                <Text style={styles.verificationUrl} testID="pairing-url">
                  {prompt.verificationUrl}
                </Text>
              </View>
            </View>

            <View style={styles.waitingRow}>
              <ActivityIndicator color={colors.accent} />
              <Text style={styles.waitingText}>Waiting for approval…</Text>
            </View>

            <FocusablePressable
              style={styles.secondaryButton}
              onPress={cancelPairing}
              hasTVPreferredFocus
              testID="pairing-cancel"
            >
              <Text style={styles.secondaryButtonText}>Cancel</Text>
            </FocusablePressable>
          </View>
        ) : (
          <View style={styles.card}>
            <Text style={styles.title}>Sign in</Text>
            <Text style={styles.subtitle}>
              Pair this device with your RomM server
            </Text>

            <Text style={styles.label}>Server address</Text>
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
              hasTVPreferredFocus
              testID="login-server-url"
            />

            {error && (
              <Text style={styles.error} testID="login-error">
                {error}
              </Text>
            )}

            <FocusablePressable
              style={[styles.button, !canSubmit && styles.buttonDisabled]}
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
                  <ArrowRightIcon color={colors.background} size={18} />
                </>
              )}
            </FocusablePressable>
          </View>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    padding: 40,
    overflow: 'hidden',
  },
  glowAccent: {
    position: 'absolute',
    top: -140,
    left: -140,
    width: 420,
    height: 420,
    borderRadius: 210,
    backgroundColor: colors.glowAccent,
  },
  glowSoft: {
    position: 'absolute',
    top: 40,
    left: 180,
    width: 520,
    height: 520,
    borderRadius: 260,
    backgroundColor: colors.glowAccentSoft,
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
  brandText: { color: colors.textPrimary, fontSize: 20, fontWeight: '700' },
  centerWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  card: {
    width: '100%',
    maxWidth: 480,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 20,
    padding: 32,
  },
  title: {
    fontSize: 30,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  subtitle: {
    fontSize: 14,
    color: colors.textSecondary,
    marginTop: 8,
    marginBottom: 28,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.borderInput,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: colors.textPrimary,
    fontSize: 15,
    backgroundColor: colors.surfaceSolid,
    marginBottom: 20,
  },
  pairingCard: { maxWidth: 620 },
  pairingRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 24,
    alignItems: 'center',
  },
  qrWrap: {
    padding: 8,
    borderRadius: 12,
    backgroundColor: '#ffffff',
  },
  pairingDetails: { flex: 1, minWidth: 180 },
  userCode: {
    color: colors.textPrimary,
    fontSize: 34,
    fontWeight: '800',
    letterSpacing: 3,
    marginBottom: 16,
  },
  verificationUrl: {
    color: colors.textSecondary,
    fontSize: 13,
  },
  waitingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 24,
  },
  waitingText: { color: colors.textSecondary, fontSize: 14 },
  error: {
    color: colors.danger,
    marginBottom: 16,
    textAlign: 'center',
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    borderRadius: 12,
    backgroundColor: colors.accent,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    color: colors.background,
    fontSize: 16,
    fontWeight: '700',
  },
  secondaryButton: {
    alignItems: 'center',
    marginTop: 12,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  secondaryButtonText: {
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: '600',
  },
});
