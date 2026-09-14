import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { EAS_PROJECT_ID } from './config';

/** Must match the channelId the backend puts on push messages. */
export const ALERT_CHANNEL_ID = 'alerts';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export async function prepareNotifications(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(ALERT_CHANNEL_ID, {
      name: 'Machine alerts',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#F87171',
    });
  }
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  const requested = await Notifications.requestPermissionsAsync();
  return requested.granted;
}

/**
 * Remote push needs a physical device, an EAS project id and a development or store build:
 * Expo Go on Android no longer receives remote notifications (SDK 53+).
 */
export function supportsRemotePush(): boolean {
  const inExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
  return Platform.OS !== 'web' && Device.isDevice && !inExpoGo && Boolean(EAS_PROJECT_ID);
}

export async function getExpoPushToken(): Promise<string | null> {
  if (!supportsRemotePush()) return null;
  try {
    const { data } = await Notifications.getExpoPushTokenAsync({ projectId: EAS_PROJECT_ID });
    return data;
  } catch (err) {
    console.warn('[push] could not obtain an Expo push token', err);
    return null;
  }
}

/** Fallback used when remote push is unavailable: raise the alert locally from the live socket feed. */
export async function showLocalNotification(title: string, body: string, data: Record<string, unknown>): Promise<void> {
  if (Platform.OS === 'web') return;
  await Notifications.scheduleNotificationAsync({
    content: { title, body, data, sound: true },
    trigger: Platform.OS === 'android' ? { channelId: ALERT_CHANNEL_ID } : null,
  });
}

export function onNotificationTap(handler: (deviceId: string) => void): () => void {
  const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
    const deviceId = response.notification.request.content.data?.deviceId;
    if (typeof deviceId === 'string') handler(deviceId);
  });
  return () => subscription.remove();
}
