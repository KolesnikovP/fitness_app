import { fakeApi, server } from './__tests__/support/fake-api';
import { secureStore } from './__tests__/support/secure-store';

// The device keychain isn't available in Jest; keep the token in memory.
jest.mock('expo-secure-store', () => require('./__tests__/support/secure-store').secureStoreModule);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  server.resetHandlers();
  fakeApi.reset();
  secureStore.clear();
});
afterAll(() => server.close());
