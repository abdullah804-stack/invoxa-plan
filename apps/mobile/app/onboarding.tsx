import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { BrandPreview } from '../src/components/BrandPreview';
import { Button } from '../src/components/Button';
import { Card } from '../src/components/Card';
import { ErrorState } from '../src/components/States';
import { Screen } from '../src/components/Screen';
import { TextField } from '../src/components/TextField';
import { useProfile, useRemoveLogo, useUpdateProfile, useUploadLogo } from '../src/api/hooks';
import { errorMessage } from '../src/lib/errors';
import { pickLogoDataUrl } from '../src/lib/logo';
import {
  BRAND_SWATCHES,
  DEFAULT_BRAND_COLOR,
  radius,
  readableOn,
  spacing,
  typeScale,
} from '../src/theme/tokens';
import { useTheme } from '../src/theme/ThemeProvider';

const STEP_TITLES = ['Your business', 'Your brand', 'Ready to send'] as const;

export default function OnboardingScreen() {
  const { colors } = useTheme();
  const router = useRouter();

  const profile = useProfile();
  const updateProfile = useUpdateProfile();
  const uploadLogo = useUploadLogo();
  const removeLogoAsset = useRemoveLogo();

  const [step, setStep] = useState(0);
  const [hydrated, setHydrated] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [color, setColor] = useState(DEFAULT_BRAND_COLOR);
  const [hexInput, setHexInput] = useState(DEFAULT_BRAND_COLOR);
  const [logoDataUrl, setLogoDataUrl] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [logoError, setLogoError] = useState<string | null>(null);

  useEffect(() => {
    if (!profile.data || hydrated) return;
    const business = profile.data.business;
    setName(business.name);
    setEmail(business.email ?? '');
    setPhone(business.phone ?? '');
    setAddress(business.address ?? '');
    setColor(business.branding.color || DEFAULT_BRAND_COLOR);
    setHexInput(business.branding.color || DEFAULT_BRAND_COLOR);
    setLogoDataUrl(profile.data.logo?.dataUrl ?? null);
    setHydrated(true);
  }, [profile.data, hydrated]);

  const busy = updateProfile.isPending || uploadLogo.isPending || removeLogoAsset.isPending;

  const close = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  };

  const applyColor = (value: string) => {
    setColor(value);
    setHexInput(value);
  };

  // The preview only ever shows a logo the server has accepted, so a failed
  // upload can never look saved. The previous logo stays until its replacement
  // has actually been stored.
  const chooseLogo = async () => {
    setLogoError(null);
    try {
      const dataUrl = await pickLogoDataUrl();
      if (!dataUrl) return;
      const result = await uploadLogo.mutateAsync(dataUrl);
      setLogoDataUrl(result.logo.dataUrl);
    } catch (error) {
      setLogoError(errorMessage(error));
    }
  };

  const clearLogo = async () => {
    setLogoError(null);
    try {
      await removeLogoAsset.mutateAsync();
      setLogoDataUrl(null);
    } catch (error) {
      setLogoError(errorMessage(error));
    }
  };

  const saveDetails = async (): Promise<boolean> => {
    if (!name.trim()) {
      setErrors({ name: 'Add a business name' });
      return false;
    }
    setErrors({});
    await updateProfile.mutateAsync({
      name: name.trim(),
      email: email.trim(),
      phone: phone.trim(),
      address: address.trim(),
    });
    return true;
  };

  const next = async () => {
    setFormError(null);
    try {
      if (step === 0) {
        const saved = await saveDetails();
        if (!saved) return;
      }
      if (step === 1) {
        await updateProfile.mutateAsync({ branding: { color } });
      }
      if (step === 2) {
        close();
        return;
      }
      setStep((current) => current + 1);
    } catch (error) {
      setFormError(errorMessage(error));
    }
  };

  const back = () => {
    setFormError(null);
    setStep((current) => Math.max(0, current - 1));
  };

  if (profile.isLoading && !hydrated) {
    return (
      <Screen edges={['top', 'bottom', 'left', 'right']}>
        <View style={styles.centered}>
          <ActivityIndicator color={colors.accent} />
          <Text style={[styles.loadingText, { color: colors.textMuted }]}>
            Loading your business…
          </Text>
        </View>
      </Screen>
    );
  }

  if (profile.isError && !hydrated) {
    return (
      <Screen edges={['top', 'bottom', 'left', 'right']}>
        <View style={styles.centered}>
          <ErrorState
            message={errorMessage(profile.error)}
            onRetry={() => void profile.refetch()}
          />
        </View>
      </Screen>
    );
  }

  return (
    <Screen edges={['top', 'bottom', 'left', 'right']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.topBar}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close"
              onPress={close}
              hitSlop={12}
              style={styles.closeButton}
            >
              <Ionicons name="close" size={24} color={colors.text} />
            </Pressable>
            <View style={[styles.dots, { backgroundColor: colors.surfaceMuted }]}>
              {STEP_TITLES.map((title, index) => (
                <View
                  key={title}
                  style={[
                    styles.dot,
                    {
                      backgroundColor: index === step ? colors.accent : colors.border,
                      width: index === step ? 22 : 8,
                    },
                  ]}
                />
              ))}
            </View>
            <View style={styles.closeButton} />
          </View>

          <View style={styles.header}>
            <Text style={[styles.eyebrow, { color: colors.textMuted }]}>Step {step + 1} of 3</Text>
            <Text style={[styles.title, { color: colors.text }]}>{STEP_TITLES[step]}</Text>
            <Text style={[styles.subtitle, { color: colors.textMuted }]}>
              {step === 0
                ? 'This is what your clients see at the top of every invoice.'
                : step === 1
                  ? 'Pick a colour and add your logo. Keep it simple and readable.'
                  : 'Everything is saved. You can change it any time in settings.'}
            </Text>
          </View>

          {step === 0 ? (
            <View style={styles.form}>
              <TextField
                label="Business name"
                value={name}
                onChangeText={setName}
                placeholder="Amina Design Studio"
                error={errors['name']}
                autoCapitalize="words"
              />
              <TextField
                label="Email"
                value={email}
                onChangeText={setEmail}
                placeholder="hello@studio.com"
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
                autoCorrect={false}
              />
              <TextField
                label="Phone"
                value={phone}
                onChangeText={setPhone}
                placeholder="+1 555 0100"
                keyboardType="phone-pad"
                autoComplete="tel"
              />
              <TextField
                label="Address"
                value={address}
                onChangeText={setAddress}
                placeholder="Street, city, country"
                multiline
              />
            </View>
          ) : null}

          {step === 1 ? (
            <View style={styles.form}>
              <Card style={styles.brandCard}>
                <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>Brand colour</Text>
                <View style={styles.swatches}>
                  {BRAND_SWATCHES.map((swatch) => (
                    <Pressable
                      key={swatch}
                      accessibilityRole="button"
                      accessibilityLabel={`Use colour ${swatch}`}
                      accessibilityState={{
                        selected: swatch.toLowerCase() === color.toLowerCase(),
                      }}
                      onPress={() => applyColor(swatch)}
                      style={[
                        styles.swatch,
                        {
                          backgroundColor: swatch,
                          borderColor:
                            swatch.toLowerCase() === color.toLowerCase()
                              ? colors.text
                              : 'transparent',
                        },
                      ]}
                    >
                      {swatch.toLowerCase() === color.toLowerCase() ? (
                        <Ionicons name="checkmark" size={18} color={readableOn(swatch)} />
                      ) : null}
                    </Pressable>
                  ))}
                </View>
                <TextField
                  label="Or type a hex colour"
                  value={hexInput}
                  onChangeText={(value) => {
                    setHexInput(value);
                    if (/^#[0-9a-fA-F]{6}$/.test(value)) setColor(value);
                  }}
                  placeholder="#1F5F4A"
                  autoCapitalize="none"
                  autoCorrect={false}
                  error={
                    hexInput.length === 7 && !/^#[0-9a-fA-F]{6}$/.test(hexInput)
                      ? 'Use a 6-digit hex colour such as #1F5F4A'
                      : undefined
                  }
                />
              </Card>

              <Card style={styles.brandCard}>
                <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>Logo</Text>
                <View style={styles.logoRow}>
                  <View
                    style={[
                      styles.logoBox,
                      { backgroundColor: colors.surfaceMuted, borderColor: colors.border },
                    ]}
                  >
                    {logoDataUrl ? (
                      <Image
                        source={{ uri: logoDataUrl }}
                        style={styles.logoImage}
                        resizeMode="contain"
                      />
                    ) : (
                      <Ionicons name="image-outline" size={26} color={colors.textMuted} />
                    )}
                  </View>
                  <View style={styles.logoActions}>
                    <Button
                      title={logoDataUrl ? 'Change logo' : 'Choose logo'}
                      variant="secondary"
                      onPress={() => void chooseLogo()}
                      loading={uploadLogo.isPending}
                    />
                    {logoDataUrl ? (
                      <Button
                        title="Remove"
                        variant="ghost"
                        onPress={() => void clearLogo()}
                        loading={removeLogoAsset.isPending}
                      />
                    ) : null}
                  </View>
                </View>
                <Text style={[styles.hint, { color: colors.textMuted }]}>
                  PNG or JPEG. Resized to 600 px wide and kept under 300 KB.
                </Text>
                {logoError ? (
                  <Text style={[styles.hint, { color: colors.danger }]}>{logoError}</Text>
                ) : null}
              </Card>
            </View>
          ) : null}

          {step > 0 ? (
            <View style={styles.previewBlock}>
              <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>Live preview</Text>
              <BrandPreview
                businessName={name}
                color={color}
                logoDataUrl={logoDataUrl}
                email={email}
                phone={phone}
                address={address}
              />
            </View>
          ) : null}

          {formError ? (
            <Text style={[styles.formError, { color: colors.danger }]}>{formError}</Text>
          ) : null}

          <View style={styles.footer}>
            {step > 0 ? (
              <Button title="Back" variant="ghost" onPress={back} style={styles.backButton} />
            ) : null}
            <Button
              title={step === 2 ? 'Start invoicing' : 'Continue'}
              onPress={() => void next()}
              loading={busy}
              style={styles.nextButton}
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  content: {
    padding: spacing.xl,
    gap: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    gap: spacing.md,
  },
  loadingText: {
    ...typeScale.small,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  closeButton: {
    width: 32,
    alignItems: 'flex-start',
  },
  dots: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: radius.pill,
  },
  dot: {
    height: 8,
    borderRadius: radius.pill,
  },
  header: {
    gap: spacing.xs,
  },
  eyebrow: {
    ...typeScale.small,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  title: {
    ...typeScale.display,
  },
  subtitle: {
    ...typeScale.body,
  },
  form: {
    gap: spacing.md,
  },
  brandCard: {
    gap: spacing.md,
  },
  fieldLabel: {
    ...typeScale.small,
  },
  swatches: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  swatch: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoRow: {
    flexDirection: 'row',
    gap: spacing.md,
    alignItems: 'center',
  },
  logoBox: {
    width: 76,
    height: 76,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  logoImage: {
    width: '100%',
    height: '100%',
  },
  logoActions: {
    flex: 1,
    gap: spacing.xs,
  },
  hint: {
    ...typeScale.small,
  },
  previewBlock: {
    gap: spacing.sm,
  },
  formError: {
    ...typeScale.small,
  },
  footer: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'center',
  },
  backButton: {
    flex: 1,
  },
  nextButton: {
    flex: 2,
  },
});
