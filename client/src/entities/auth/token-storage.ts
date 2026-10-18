import * as SecureStore from 'expo-secure-store';

// Stored in the iOS Keychain / Android Keystore, not plain AsyncStorage.
const TOKEN_KEY = 'auth-token';

export const tokenStorage = {
  get: () => SecureStore.getItemAsync(TOKEN_KEY),
  set: (token: string) => SecureStore.setItemAsync(TOKEN_KEY, token),
  clear: () => SecureStore.deleteItemAsync(TOKEN_KEY),
};
