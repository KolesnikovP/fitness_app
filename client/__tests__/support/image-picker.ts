/** Stand-in for expo-image-picker: the photo library is native-only. */
type Pick = { uri: string; mimeType: string; fileName: string };

export const imagePicker = {
  /** What the next library pick returns; null means the user cancels. */
  nextPick: null as Pick | null,
};

export const imagePickerModule = {
  launchImageLibraryAsync: async () => {
    const pick = imagePicker.nextPick;
    imagePicker.nextPick = null;
    return pick ? { canceled: false, assets: [pick] } : { canceled: true, assets: null };
  },
};
