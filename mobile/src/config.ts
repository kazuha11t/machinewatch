import Constants from 'expo-constants';
import { Platform } from 'react-native';

interface Extra {
  apiUrl?: string;
  eas?: { projectId?: string };
}

const extra = (Constants.expoConfig?.extra ?? {}) as Extra;

const trimSlash = (url: string) => url.replace(/\/+$/, '');

/**
 * Where the backend lives, in order of precedence:
 * 1. EXPO_PUBLIC_API_URL (set this for production builds)
 * 2. app.json → expo.extra.apiUrl
 * 3. In development, the computer running Metro (the phone reaches it over the LAN)
 * 4. Emulator/simulator loopback
 */
function resolveApiUrl(): string {
  if (process.env.EXPO_PUBLIC_API_URL) return trimSlash(process.env.EXPO_PUBLIC_API_URL);
  if (extra.apiUrl) return trimSlash(extra.apiUrl);
  const devHost = Constants.expoConfig?.hostUri?.split(':')[0];
  if (devHost) return `http://${devHost}:4000`;
  return Platform.OS === 'android' ? 'http://10.0.2.2:4000' : 'http://localhost:4000';
}

export const API_URL = resolveApiUrl();

export const EAS_PROJECT_ID: string | undefined = extra.eas?.projectId || Constants.easConfig?.projectId || undefined;
