import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PinModal } from '@/components/pin-modal';
import { HueWheel } from '@/components/hue-wheel';
import { PromptModal } from '@/components/prompt-modal';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useAppLock } from '@/context/app-lock-context';
import { useAuth } from '@/context/auth-context';
import { type ThemePreference, useThemePreference } from '@/context/theme-context';
import { useTheme } from '@/hooks/use-theme';
import { clearPin, getBiometricStatus, isPinSet, setPin, type BiometricStatus } from '@/lib/security';

export default function SettingsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { user, signOut, linkPartner, updateName, deleteAccount } = useAuth();
  const { preference, setPreference, accentHue, setAccentHue } = useThemePreference();
  const { enabled: appLockEnabled, setEnabled: setAppLockEnabled } = useAppLock();

  const [pinSet, setPinSet] = useState(false);
  const [biometric, setBiometric] = useState<BiometricStatus | null>(null);
  const [showPinModal, setShowPinModal] = useState(false);

  const [showLinkModal, setShowLinkModal] = useState(false);
  const [partnerEmail, setPartnerEmail] = useState('');
  const [linkError, setLinkError] = useState<string | null>(null);
  const [linking, setLinking] = useState(false);

  const [showNameModal, setShowNameModal] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [nameError, setNameError] = useState<string | null>(null);
  const [savingName, setSavingName] = useState(false);

  // Deleting an account is irreversible and sits two taps from "Sign out", so it
  // asks the user to type the word rather than tap a second button.
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState('');
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    isPinSet().then(setPinSet);
    getBiometricStatus().then(setBiometric);
  }, []);

  async function handleLinkPartner() {
    setLinkError(null);
    setLinking(true);
    try {
      await linkPartner(partnerEmail);
      setShowLinkModal(false);
      setPartnerEmail('');
    } catch (e) {
      setLinkError(e instanceof Error ? e.message : 'Could not link that account.');
    } finally {
      setLinking(false);
    }
  }

  function openNameModal() {
    setNameInput(user?.name ?? '');
    setNameError(null);
    setShowNameModal(true);
  }

  async function handleSaveName() {
    setNameError(null);
    setSavingName(true);
    try {
      await updateName(nameInput);
      setShowNameModal(false);
    } catch (e) {
      setNameError(e instanceof Error ? e.message : 'Could not update your name.');
    } finally {
      setSavingName(false);
    }
  }

  function openDeleteModal() {
    setDeleteConfirm('');
    setDeleteError(null);
    setShowDeleteModal(true);
  }

  async function handleDeleteAccount() {
    if (deleteConfirm.trim().toUpperCase() !== 'DELETE') {
      setDeleteError('Type DELETE to confirm.');
      return;
    }
    setDeleteError(null);
    setDeleting(true);
    try {
      await deleteAccount();
      // Succeeded: the session is gone, so the app drops to the sign-in screen
      // and this screen unmounts. Nothing to reset.
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : 'Could not delete your account.');
      setDeleting(false);
    }
  }

  async function handleSetPin(pin: string) {
    await setPin(pin);
    setPinSet(true);
    setShowPinModal(false);
    return true;
  }

  // "Face ID or your PIN" / "Face ID" / "your PIN" depending on what's set up.
  const bioReady = biometric?.available && biometric?.enrolled ? biometric.label : null;
  const appLockUnlockLabel =
    bioReady && pinSet ? `${bioReady} or your PIN` : (bioReady ?? (pinSet ? 'your PIN' : 'a PIN'));

  function toggleAppLock(next: boolean) {
    if (next && !pinSet && !biometric?.available) {
      Alert.alert(
        'Set a PIN first',
        'App Lock needs a PIN or biometrics. Set a PIN below, then turn App Lock on.',
      );
      return;
    }
    setAppLockEnabled(next);
  }

  function confirmRemovePin() {
    Alert.alert('Remove PIN?', 'PIN-locked notes will no longer be protected on this device.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          await clearPin();
          setPinSet(false);
        },
      },
    ]);
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.titleRow}>
            <Image source={require('@/assets/images/icon.png')} style={styles.brandMark} />
            <ThemedText type="subtitle" style={styles.title}>
              Settings
            </ThemedText>
          </View>

          <Section title="Account">
            <Pressable onPress={openNameModal}>
              <Row icon="person-circle-outline" label={user?.name ?? '—'} value={user?.email} chevron />
            </Pressable>
          </Section>

          <Section title="Partner">
            {user?.partnerId ? (
              <Row icon="heart" label="Linked with your partner" value="Shared notes will sync" />
            ) : (
              <Pressable onPress={() => setShowLinkModal(true)}>
                <Row
                  icon="person-add-outline"
                  label="Link your partner"
                  value="Connect by their email to share notes"
                  chevron
                />
              </Pressable>
            )}
          </Section>

          <Section title="Appearance">
            <View style={styles.segment}>
              {THEME_OPTIONS.map((opt) => {
                const active = preference === opt.key;
                return (
                  <Pressable
                    key={opt.key}
                    onPress={() => setPreference(opt.key)}
                    style={[styles.segmentItem, active && { backgroundColor: theme.background }]}>
                    <Ionicons
                      name={opt.icon}
                      size={18}
                      color={active ? theme.text : theme.textSecondary}
                    />
                    <ThemedText
                      type="small"
                      style={{ color: active ? theme.text : theme.textSecondary, fontWeight: active ? '700' : '500' }}>
                      {opt.label}
                    </ThemedText>
                  </Pressable>
                );
              })}
            </View>
            <View style={[styles.swatchDivider, { backgroundColor: theme.background }]} />
            <HueWheel hue={accentHue} onChange={setAccentHue} />
          </Section>

          <Section title="Security">
            <Pressable onPress={() => setShowPinModal(true)}>
              <Row
                icon="keypad-outline"
                label={pinSet ? 'Change PIN' : 'Set a PIN'}
                value={pinSet ? 'PIN is set' : 'Not set'}
                chevron
              />
            </Pressable>
            {pinSet && (
              <Pressable onPress={confirmRemovePin}>
                <Row icon="trash-outline" label="Remove PIN" danger chevron />
              </Pressable>
            )}
            <Row
              icon="finger-print-outline"
              label={biometric?.label ?? 'Biometrics'}
              value={
                !biometric
                  ? 'Checking…'
                  : !biometric.available
                    ? 'Not available on this device'
                    : biometric.enrolled
                      ? 'Ready to use'
                      : 'Not set up in system settings'
              }
            />
            <View style={styles.row}>
              <Ionicons name="lock-closed-outline" size={22} color={theme.text} />
              <View style={styles.rowText}>
                <ThemedText>App Lock</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {`Require ${appLockUnlockLabel} to open DuoNotes`}
                </ThemedText>
              </View>
              <Switch
                value={appLockEnabled}
                onValueChange={toggleAppLock}
                trackColor={{ true: theme.accent }}
              />
            </View>
          </Section>

          <Section title="Updates">
            <Pressable onPress={() => router.push('/updates')}>
              <Row
                icon="sparkles-outline"
                label="What's new"
                value="Everything added and fixed, newest first"
                chevron
              />
            </Pressable>
          </Section>

          <Section title="About">
            <ThemedText type="small" themeColor="textSecondary" style={styles.about}>
              Notes sync securely between you and your linked partner via Supabase. Your PIN and
              biometrics stay on this device. At-rest encryption of locked notes is still on the
              roadmap (see the project README).
            </ThemedText>
          </Section>

          <Section title="Danger zone">
            <Pressable onPress={openDeleteModal}>
              <Row
                icon="trash-outline"
                label="Delete account"
                value="Erases your account and every note you own, on all devices"
                danger
                chevron
              />
            </Pressable>
          </Section>

          <Pressable
            onPress={() => signOut()}
            style={({ pressed }) => [
              styles.signOut,
              { backgroundColor: theme.backgroundElement, opacity: pressed ? 0.7 : 1 },
            ]}>
            <ThemedText style={{ color: '#E5484D', fontWeight: '600' }}>Sign out</ThemedText>
          </Pressable>
        </ScrollView>
      </SafeAreaView>

      <PinModal
        visible={showPinModal}
        mode="set"
        title="Set your PIN"
        onSubmit={handleSetPin}
        onCancel={() => setShowPinModal(false)}
      />

      <PromptModal
        visible={showLinkModal}
        icon="heart"
        title="Link your partner"
        subtitle="Enter the email your partner signed up with. Once linked, notes either of you shares will appear for both."
        value={partnerEmail}
        onChangeValue={setPartnerEmail}
        placeholder="partner@example.com"
        keyboardType="email-address"
        autoCapitalize="none"
        error={linkError}
        submitLabel="Link partner"
        savingLabel="Linking…"
        submitting={linking}
        onSubmit={handleLinkPartner}
        onCancel={() => setShowLinkModal(false)}
      />

      <PromptModal
        visible={showDeleteModal}
        icon="trash-outline"
        title="Delete your account?"
        subtitle="This erases your account and every note you own, on all your devices, and cannot be undone. Your partner keeps their own notes, and will simply be unlinked. Type DELETE to confirm."
        value={deleteConfirm}
        onChangeValue={setDeleteConfirm}
        placeholder="DELETE"
        autoCapitalize="characters"
        error={deleteError}
        submitLabel="Delete for ever"
        savingLabel="Deleting…"
        submitting={deleting}
        onSubmit={handleDeleteAccount}
        onCancel={() => setShowDeleteModal(false)}
      />

      <PromptModal
        visible={showNameModal}
        icon="person-circle-outline"
        title="Your name"
        subtitle="Shown on shared notes and in greetings on the home tab."
        value={nameInput}
        onChangeValue={setNameInput}
        placeholder="Your name"
        autoCapitalize="words"
        error={nameError}
        submitLabel="Save"
        savingLabel="Saving…"
        submitting={savingName}
        onSubmit={handleSaveName}
        onCancel={() => setShowNameModal(false)}
      />
    </ThemedView>
  );

  function Section({ title, children }: { title: string; children: React.ReactNode }) {
    return (
      <View style={styles.section}>
        <ThemedText type="smallBold" themeColor="textSecondary" style={styles.sectionTitle}>
          {title.toUpperCase()}
        </ThemedText>
        <ThemedView type="backgroundElement" style={styles.card}>
          {children}
        </ThemedView>
      </View>
    );
  }

  function Row({
    icon,
    label,
    value,
    chevron,
    danger,
  }: {
    icon: keyof typeof Ionicons.glyphMap;
    label: string;
    value?: string;
    chevron?: boolean;
    danger?: boolean;
  }) {
    return (
      <View style={styles.row}>
        <Ionicons name={icon} size={22} color={danger ? '#E5484D' : theme.text} />
        <View style={styles.rowText}>
          <ThemedText style={danger ? { color: '#E5484D' } : undefined}>{label}</ThemedText>
          {value && (
            <ThemedText type="small" themeColor="textSecondary">
              {value}
            </ThemedText>
          )}
        </View>
        {chevron && <Ionicons name="chevron-forward" size={18} color={theme.textSecondary} />}
      </View>
    );
  }
}

const THEME_OPTIONS: { key: ThemePreference; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'light', label: 'Light', icon: 'sunny-outline' },
  { key: 'dark', label: 'Dark', icon: 'moon-outline' },
  { key: 'system', label: 'System', icon: 'phone-portrait-outline' },
];

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1 },
  segment: { flexDirection: 'row', padding: Spacing.one, gap: Spacing.one },
  segmentItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.one,
    paddingVertical: Spacing.two,
    borderRadius: Spacing.two,
  },
  swatchDivider: { height: StyleSheet.hairlineWidth, marginHorizontal: Spacing.three },
  swatchRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.two,
  },
  swatchWrap: { alignItems: 'center', gap: Spacing.one },
  swatch: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2.5,
  },
  content: { padding: Spacing.four, gap: Spacing.four, paddingBottom: Spacing.six },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, marginBottom: Spacing.one },
  brandMark: { width: 36, height: 36, borderRadius: Spacing.two },
  title: {},
  section: { gap: Spacing.two },
  sectionTitle: { marginLeft: Spacing.two, letterSpacing: 0.5 },
  card: { borderRadius: Spacing.three, overflow: 'hidden' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
  },
  rowText: { flex: 1, gap: 2 },
  about: { paddingHorizontal: Spacing.one },
  signOut: {
    marginTop: Spacing.two,
    paddingVertical: Spacing.three,
    borderRadius: Spacing.three,
    alignItems: 'center',
  },
});
