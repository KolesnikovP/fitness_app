/**
 * Stand-in for the phone's light or dark mode. Under jest-expo, useColorScheme is a jest.fn
 * that always says light; tests point it at useFakeColorScheme so the mode can change.
 */
import { useSyncExternalStore } from 'react';

type Scheme = 'light' | 'dark';

const listeners = new Set<() => void>();
let scheme: Scheme = 'light';

export const phone = {
  /** The phone switching mode, as iOS does at sunset. */
  setScheme(next: Scheme) {
    scheme = next;
    listeners.forEach((listener) => listener());
  },
};

export function useFakeColorScheme(): Scheme {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => scheme,
  );
}
