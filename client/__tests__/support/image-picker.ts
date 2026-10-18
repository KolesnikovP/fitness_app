/** Stand-in for expo-image-picker: the photo library is native-only. */
type Pick = { uri: string; mimeType: string; fileName: string };

export const imagePicker = {
  /** What the next library pick returns; null means the user cancels. */
  nextPick: null as Pick | null,
  /** The options of the last library launch. */
  lastOptions: null as Record<string, unknown> | null,
};

export const imagePickerModule = {
  UIImagePickerPreferredAssetRepresentationMode: { Automatic: 'automatic', Compatible: 'compatible', Current: 'current' },
  launchImageLibraryAsync: async (options: Record<string, unknown>) => {
    imagePicker.lastOptions = options;
    const pick = imagePicker.nextPick;
    imagePicker.nextPick = null;
    return pick ? { canceled: false, assets: [pick] } : { canceled: true, assets: null };
  },
};
