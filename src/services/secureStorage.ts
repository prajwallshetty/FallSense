// Token storage. Native builds use the OS keystore through expo-secure-store. Web has no equivalent,
// so it falls back to AsyncStorage; web exists for development only.

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const useKeystore = Platform.OS === 'ios' || Platform.OS === 'android';

export const secureStorage = {
  get: (key: string) => (useKeystore ? SecureStore.getItemAsync(key) : AsyncStorage.getItem(key)),
  set: (key: string, value: string) => (useKeystore ? SecureStore.setItemAsync(key, value) : AsyncStorage.setItem(key, value)),
  remove: (key: string) => (useKeystore ? SecureStore.deleteItemAsync(key) : AsyncStorage.removeItem(key)),
};
