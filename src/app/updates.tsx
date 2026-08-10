import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import * as Updates from 'expo-updates';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { CHANGELOG, type ChangelogEntry } from '@/constants/changelog';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/**
 * Settings → What's New. A plain reverse-chronological log of what each update
 * added or fixed, plus which build is actually running.
 *
 * The running-build line matters more here than it looks: updates arrive over
 * the air, so the JavaScript running on the phone can be newer than the
 * installed app. Showing whether an update has been applied is what makes "did
 * my fix reach the phone?" answerable without a cable.
 */
export default function UpdatesScreen() {
  const theme = useTheme();
  const router = useRouter();

  return (
    <ThemedView style={styles.flex}>
      <SafeAreaView style={styles.flex} edges={['top', 'left', 'right']}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} hitSlop={10} style={styles.headerLeft}>
            <Ionicons name="chevron-back" size={26} color={theme.text} />
          </Pressable>
          <ThemedText type="smallBold" themeColor="textSecondary">
            WHAT&apos;S NEW
          </ThemedText>
          {/* Balances the back chevron so the title stays centred. */}
          <View style={styles.headerLeft} />
        </View>

        <ScrollView
          contentContainerStyle={styles.body}
          showsVerticalScrollIndicator={false}>
          {CHANGELOG.map((entry) => (
            <Entry key={entry.date} entry={entry} />
          ))}

          <RunningBuild />
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );

  function Entry({ entry }: { entry: ChangelogEntry }) {
    return (
      <View style={styles.entry}>
        <View style={styles.entryHead}>
          <ThemedText type="subtitle">{formatDate(entry.date)}</ThemedText>
          {entry.version && (
            <ThemedView
              type="backgroundElement"
              style={[styles.versionChip, { borderColor: theme.accent }]}>
              <ThemedText type="small" themeColor="textSecondary">
                v{entry.version}
              </ThemedText>
            </ThemedView>
          )}
        </View>

        {entry.added && <Group label="New" icon="sparkles" items={entry.added} />}
        {entry.fixed && <Group label="Fixed" icon="build" items={entry.fixed} />}
      </View>
    );
  }

  function Group({
    label,
    icon,
    items,
  }: {
    label: string;
    icon: keyof typeof Ionicons.glyphMap;
    items: string[];
  }) {
    return (
      <View style={styles.group}>
        <View style={styles.groupHead}>
          <Ionicons name={icon} size={14} color={theme.accent} />
          <ThemedText type="smallBold" themeColor="textSecondary">
            {label.toUpperCase()}
          </ThemedText>
        </View>
        <ThemedView type="backgroundElement" style={styles.card}>
          {items.map((item, i) => (
            <View key={item} style={[styles.bullet, i > 0 && styles.bulletSpaced]}>
              <View style={[styles.dot, { backgroundColor: theme.accent }]} />
              <ThemedText type="small" style={styles.bulletText}>
                {item}
              </ThemedText>
            </View>
          ))}
        </ThemedView>
      </View>
    );
  }

  /**
   * `Updates.isEmbeddedLaunch` is true when the app booted from the bundle that
   * shipped inside the installed build, and false once an over-the-air update
   * has been applied — which is the distinction worth surfacing.
   */
  function RunningBuild() {
    const version = Constants.expoConfig?.version;
    const applied = !Updates.isEmbeddedLaunch && Updates.createdAt;

    return (
      <View style={styles.group}>
        <ThemedText type="smallBold" themeColor="textSecondary" style={styles.groupHead}>
          THIS DEVICE
        </ThemedText>
        <ThemedView type="backgroundElement" style={styles.card}>
          {version && (
            <ThemedText type="small" themeColor="textSecondary">
              App version {version}
            </ThemedText>
          )}
          <ThemedText type="small" themeColor="textSecondary" style={styles.buildLine}>
            {applied
              ? `Running an update downloaded ${formatDate(toDateKey(Updates.createdAt as Date))}`
              : 'Running the version that came with the installed app'}
          </ThemedText>
        </ThemedView>
      </View>
    );
  }
}

/** '2026-08-08' → 'August 8, 2026'. Parsed as local noon so the displayed day
 *  cannot slip by one in timezones behind UTC. */
function formatDate(key: string): string {
  const [y, m, d] = key.split('-').map(Number);
  if (!y || !m || !d) return key;
  return new Date(y, m - 1, d, 12).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function toDateKey(date: Date): string {
  const m = `${date.getMonth() + 1}`.padStart(2, '0');
  const d = `${date.getDate()}`.padStart(2, '0');
  return `${date.getFullYear()}-${m}-${d}`;
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.three,
    paddingBottom: Spacing.two,
  },
  headerLeft: { width: 32 },
  body: {
    paddingHorizontal: Spacing.three,
    paddingBottom: Spacing.six,
    gap: Spacing.four,
  },
  entry: { gap: Spacing.three },
  entryHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  versionChip: {
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.half,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
  },
  group: { gap: Spacing.two },
  groupHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one },
  card: { borderRadius: 12, padding: Spacing.three },
  bullet: { flexDirection: 'row', gap: Spacing.two },
  bulletSpaced: { marginTop: Spacing.three },
  dot: { width: 5, height: 5, borderRadius: 999, marginTop: 6 },
  bulletText: { flex: 1, lineHeight: 20 },
  buildLine: { marginTop: Spacing.one },
});
