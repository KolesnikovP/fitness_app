import './__tests__/support/react-native-form-data';
import { fakeApi, server } from './__tests__/support/fake-api';
import { imagePicker } from './__tests__/support/image-picker';
import { secureStore } from './__tests__/support/secure-store';

// The device keychain isn't available in Jest; keep the token in memory.
jest.mock('expo-secure-store', () => require('./__tests__/support/secure-store').secureStoreModule);
// Neither is the photo library; tests choose what the next pick returns.
jest.mock('expo-image-picker', () => require('./__tests__/support/image-picker').imagePickerModule);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  server.resetHandlers();
  fakeApi.reset();
  secureStore.clear();
  imagePicker.nextPick = null;
});
afterAll(() => server.close());
