import { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { FocusablePressable } from '../components/FocusablePressable';
import { RootStackParamList } from '../navigation/types';
import {
  DEFAULT_LOGIN_PATH,
  getLoginPath,
  setLoginPath,
} from '../settings/settingsStore';
import { colors } from '../theme/colors';
import { DesktopSettingsSection } from './DesktopSettingsSection';

type Props = NativeStackScreenProps<RootStackParamList, 'Settings'>;

export function SettingsScreen({ navigation }: Props) {
  const [loginPath, setLoginPathInput] = useState(DEFAULT_LOGIN_PATH);

  useEffect(() => {
    getLoginPath().then(setLoginPathInput);
  }, []);

  const handleSave = async () => {
    await setLoginPath(loginPath.trim() || DEFAULT_LOGIN_PATH);
    navigation.goBack();
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Settings</Text>

      <Text style={styles.label}>Login path</Text>
      <Text style={styles.help}>
        Endpoint the web player signs in against (HTTP Basic) to pick up its
        session cookie. Only change this if the game screen reports the login
        endpoint was not found.
      </Text>
      <TextInput
        style={styles.input}
        value={loginPath}
        onChangeText={setLoginPathInput}
        autoCapitalize="none"
        autoCorrect={false}
        testID="settings-login-path"
      />

      <FocusablePressable
        style={styles.button}
        onPress={handleSave}
        testID="settings-save"
      >
        <Text style={styles.buttonText}>Save</Text>
      </FocusablePressable>

      <DesktopSettingsSection />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, padding: 32 },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 24,
  },
  label: { color: colors.textPrimary, fontSize: 16, marginBottom: 6 },
  help: {
    color: colors.textMuted,
    fontSize: 13,
    marginBottom: 12,
    maxWidth: 520,
  },
  input: {
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: colors.textPrimary,
    fontSize: 16,
    maxWidth: 520,
  },
  button: {
    marginTop: 24,
    paddingHorizontal: 24,
    paddingVertical: 12,
    alignSelf: 'flex-start',
  },
  buttonText: { color: colors.textPrimary, fontWeight: '600' },
});
