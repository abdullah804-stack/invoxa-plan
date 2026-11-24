import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold } from '@expo-google-fonts/inter';
import {
  Manrope_500Medium,
  Manrope_600SemiBold,
  Manrope_700Bold,
} from '@expo-google-fonts/manrope';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useFonts } from 'expo-font';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { SessionProvider, useSession } from '../src/auth/SessionProvider';
import { ThemeProvider, useTheme } from '../src/theme/ThemeProvider';

void SplashScreen.preventAutoHideAsync().catch(() => {
  // The splash screen may already be hidden during fast refresh.
});

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 15_000,
      refetchOnWindowFocus: false,
    },
    mutations: { retry: 0 },
  },
});

const AUTH_ROUTES = new Set(['welcome', 'login', 'register']);

function RootNavigator({ fontsReady }: { fontsReady: boolean }) {
  const { status } = useSession();
  const { colors, theme } = useTheme();
  const segments = useSegments();
  const router = useRouter();

  // The auth gate: signed-out users only see welcome, login and register;
  // signed-in users are never left on an auth screen.
  useEffect(() => {
    if (status === 'loading') return;
    const root = segments[0];
    const inAuth = typeof root === 'string' && AUTH_ROUTES.has(root);

    if (status === 'signedOut' && !inAuth) {
      router.replace('/welcome');
    } else if (status === 'signedIn' && inAuth) {
      router.replace('/');
    }
  }, [status, segments, router]);

  useEffect(() => {
    if (fontsReady && status !== 'loading') {
      void SplashScreen.hideAsync().catch(() => {
        // Hiding twice is harmless.
      });
    }
  }, [fontsReady, status]);

  if (!fontsReady || status === 'loading') {
    return <View style={[styles.blank, { backgroundColor: colors.background }]} />;
  }

  return (
    <>
      <StatusBar style={theme === 'dark' ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.background },
        }}
      >
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="document/new" />
        <Stack.Screen name="document/ai" />
        <Stack.Screen name="recurring/index" />
        <Stack.Screen name="recurring/new" />
        <Stack.Screen name="document/preview" />
        <Stack.Screen name="document/[id]" />
        <Stack.Screen name="client/[id]" />
        <Stack.Screen name="client/new" options={{ presentation: 'modal' }} />
        <Stack.Screen name="onboarding" options={{ presentation: 'modal' }} />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Manrope_500Medium,
    Manrope_600SemiBold,
    Manrope_700Bold,
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
  });

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <SessionProvider>
          <RootNavigator fontsReady={fontsLoaded || Boolean(fontError)} />
        </SessionProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

const styles = StyleSheet.create({
  blank: {
    flex: 1,
  },
});
