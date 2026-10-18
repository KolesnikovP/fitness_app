/** In-memory stand-in for the device keychain used by expo-secure-store. */
export const secureStore = new Map<string, string>();

export const secureStoreModule = {
  getItemAsync: async (key: string) => secureStore.get(key) ?? null,
  setItemAsync: async (key: string, value: string) => {
    secureStore.set(key, value);
  },
  deleteItemAsync: async (key: string) => {
    secureStore.delete(key);
  },
};
