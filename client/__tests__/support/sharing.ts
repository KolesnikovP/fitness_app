/**
 * Stand-ins for the native modules a Carousel is saved with: capturing a view
 * as an image (react-native-view-shot), the photo library
 * (expo-media-library) and the clipboard (expo-clipboard). None runs in Jest;
 * tests read what was captured, saved and copied here.
 */
export const sharing = {
  /** Every view captured, in order, as the file it became. */
  captured: [] as string[],
  /** Every file saved to Photos, in order. */
  savedToPhotos: [] as string[],
  /** What the clipboard holds. */
  clipboard: '',
  /** Whether the next Photos permission request is granted. */
  grantPhotos: true,

  reset() {
    this.captured = [];
    this.savedToPhotos = [];
    this.clipboard = '';
    this.grantPhotos = true;
  },
};

export const viewShotModule = {
  captureRef: async (_view: unknown, _options: unknown) => {
    const file = `file:///tmp/capture-${sharing.captured.length + 1}.png`;
    sharing.captured.push(file);
    return file;
  },
};

export const mediaLibraryModule = {
  requestPermissionsAsync: async () => ({
    status: sharing.grantPhotos ? 'granted' : 'denied',
    granted: sharing.grantPhotos,
  }),
  Asset: {
    create: async (file: string) => {
      sharing.savedToPhotos.push(file);
      return { id: `asset-${sharing.savedToPhotos.length}` };
    },
  },
};

export const clipboardModule = {
  setStringAsync: async (text: string) => {
    sharing.clipboard = text;
    return true;
  },
};
