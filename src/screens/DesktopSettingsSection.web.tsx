import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { FocusablePressable } from '../components/FocusablePressable';
import { Toggle } from '../components/Toggle';
import { DesktopPreferences, getDesktopBridge } from '../desktop/bridge';
import { colors } from '../theme/colors';

/**
 * Desktop-only settings. Unlike the rest of the Settings screen these apply
 * as soon as they're toggled: they belong to the Electron main process
 * (electron/preferences.ts), which needs them before the app has loaded.
 */

function serverHost(serverUrl: string): string | null {
  try {
    return new URL(serverUrl).host;
  } catch {
    return null;
  }
}

interface RowProps {
  label: string;
  help: string;
  value: boolean;
  onToggle(): void;
  testID: string;
}

function ToggleRow({ label, help, value, onToggle, testID }: RowProps) {
  return (
    <View style={styles.row}>
      <View style={styles.textWrap}>
        <Text style={styles.label}>{label}</Text>
        <Text style={styles.help}>{help}</Text>
      </View>
      <Toggle value={value} onValueChange={onToggle} testID={testID} />
    </View>
  );
}

export function DesktopSettingsSection() {
  const { serverUrl } = useAuth();
  const bridge = getDesktopBridge();
  const [prefs, setPrefs] = useState<DesktopPreferences | null>(null);

  useEffect(() => {
    bridge?.getPreferences().then(setPrefs);
  }, [bridge]);

  if (!bridge || !prefs) {
    return null;
  }

  const update = (changes: Partial<DesktopPreferences>) =>
    bridge.setPreferences(changes).then(setPrefs);

  const host = serverHost(serverUrl);
  const trusted = !!host && prefs.trustedCertificateHosts.includes(host);

  return (
    <View style={styles.section} testID="desktop-settings">
      <Text style={styles.heading}>Desktop</Text>
      <ToggleRow
        label="Start fullscreen"
        help="Open RommStream fullscreen, for a TV or monitor. F11 switches in and out at any time."
        value={prefs.fullscreen}
        onToggle={() => update({ fullscreen: !prefs.fullscreen })}
        testID="settings-fullscreen"
      />
      <ToggleRow
        label="Start when I sign in"
        help="Launch RommStream automatically when you sign in to this computer."
        value={prefs.launchAtLogin}
        onToggle={() => update({ launchAtLogin: !prefs.launchAtLogin })}
        testID="settings-launch-at-login"
      />
      {host && serverUrl.startsWith('https:') && (
        <ToggleRow
          label="Trust this server's certificate"
          help={`Accept ${host}'s HTTPS certificate even if it's self-signed. Only turn this on for a server you run yourself.`}
          value={trusted}
          onToggle={() =>
            update({
              trustedCertificateHosts: trusted
                ? prefs.trustedCertificateHosts.filter(h => h !== host)
                : [...prefs.trustedCertificateHosts, host],
            })
          }
          testID="settings-trust-certificate"
        />
      )}
      <FocusablePressable
        style={styles.button}
        onPress={() => bridge.quit()}
        testID="settings-quit"
      >
        <Text style={styles.buttonText}>Quit RommStream</Text>
      </FocusablePressable>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginTop: 32, maxWidth: 620 },
  heading: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 16,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 20,
    marginBottom: 16,
  },
  textWrap: { flex: 1 },
  label: { color: colors.textPrimary, fontSize: 16, marginBottom: 6 },
  help: { color: colors.textMuted, fontSize: 13 },
  button: {
    marginTop: 8,
    paddingHorizontal: 24,
    paddingVertical: 12,
    alignSelf: 'flex-start',
  },
  buttonText: { color: colors.textPrimary, fontWeight: '600' },
});
