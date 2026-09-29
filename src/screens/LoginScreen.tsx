import React, { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { FocusablePressable } from '../components/FocusablePressable';
import { ArrowRightIcon, LogoMarkIcon } from '../components/icons';
import { colors } from '../theme/colors';
import { createLogger } from '../utils/logger';

const log = createLogger('login');

export function LoginScreen() {
  const { signIn } = useAuth();
  const [serverUrl, setServerUrl] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const canSubmit =
    serverUrl.trim().length > 0 &&
    username.trim().length > 0 &&
    password.length > 0;

  const handleSubmit = async () => {
    if (!canSubmit || submitting) {
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await signIn(serverUrl, username, password);
    } catch (e) {
      log.error(`sign-in failed for ${serverUrl}`, e);
      setError(e instanceof Error ? e.message : 'Unable to sign in');
    } finally {
      setSubmitting(false);
    }
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
        <View style={styles.card}>
          <Text style={styles.title}>Sign in</Text>
          <Text style={styles.subtitle}>
            Connect to your RomM server to browse your library.
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
            hasTVPreferredFocus
            testID="login-server-url"
          />

          <Text style={styles.label}>Username</Text>
          <TextInput
            style={styles.input}
            placeholder="Your username"
            placeholderTextColor={colors.textFaint}
            autoCapitalize="none"
            autoCorrect={false}
            value={username}
            onChangeText={setUsername}
            testID="login-username"
          />

          <Text style={styles.label}>Password</Text>
          <TextInput
            style={styles.input}
            placeholderTextColor={colors.textFaint}
            autoCapitalize="none"
            autoCorrect={false}
            secureTextEntry
            value={password}
            onChangeText={setPassword}
            onSubmitEditing={handleSubmit}
            testID="login-password"
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
                <Text style={styles.buttonText}>Connect</Text>
                <ArrowRightIcon color={colors.background} size={18} />
              </>
            )}
          </FocusablePressable>
        </View>
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
});
