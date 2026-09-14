import { createNavigationContainerRef } from '@react-navigation/native';

export type RootStackParamList = {
  Login: undefined;
  Tabs: undefined;
  Device: { deviceId: string; name?: string };
};

export type TabParamList = {
  Fleet: undefined;
  Alerts: undefined;
  Settings: undefined;
};

export const navigationRef = createNavigationContainerRef<RootStackParamList>();

export function openDevice(deviceId: string) {
  if (navigationRef.isReady()) navigationRef.navigate('Device', { deviceId });
}
