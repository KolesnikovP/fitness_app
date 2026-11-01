// PROTOTYPE (branch prototype/palette): three ways to use one palette across the whole app.
// Question: what should the app look like with gold #DFA05D, brick #AC5045, sage #658761, charcoal #1C1C1C?
// Switch: tap ‹ › on the pink badge at the top of the app. The choice is kept on the device and read here,
// once, before any StyleSheet is built; switching reloads the app so every screen picks it up.
import * as SecureStore from 'expo-secure-store';

export const PALETTE_STORAGE_KEY = 'prototype-palette';

const GOLD = '#DFA05D';
const BRICK = '#AC5045';
const SAGE = '#658761';
const CHARCOAL = '#1C1C1C';

type Palette = {
  name: string;
  dark: boolean;
  background: string;
  text: string;
  muted: string;
  border: string;
  /** Fills (buttons, active states) and accent text such as links. */
  primary: string;
  /** Text and icons sitting on a primary fill. */
  primaryText: string;
  /** Selected or pressed rows and options: the old four light blues. */
  primarySubtle: string;
  danger: string;
  /** Done: a logged set and its tick. */
  success: string;
  successSubtle: string;
  /** Text on a success fill. */
  successText: string;
  /** Behind exercise pictures that haven't loaded or don't exist. */
  placeholder: string;
  /** The filter cards: the app's one bold surface. */
  feature: string;
  featureText: string;
  featureMuted: string;
};

const palettes = {
  // A: dark. Charcoal is the room, gold is the light in it.
  A: {
    name: 'Charcoal night',
    dark: true,
    background: CHARCOAL,
    text: '#F2ECE3',
    muted: '#9C958B',
    border: '#3A3734',
    primary: GOLD,
    primaryText: CHARCOAL,
    primarySubtle: '#3A2E21',
    danger: '#C9675B', // brick lifted so it reads on charcoal; #AC5045 is 2.9:1 here
    success: SAGE,
    successSubtle: '#263027',
    successText: '#F2ECE3',
    placeholder: '#2A2826',
    feature: BRICK,
    featureText: '#FFF6EC',
    featureMuted: '#F0CFC8',
  },
  // B: light and warm. Cream paper, gold as the action, charcoal for the bold cards.
  B: {
    name: 'Warm paper',
    dark: false,
    background: '#F7F2EA',
    text: CHARCOAL,
    muted: '#6E675E',
    border: '#E0D6C7',
    primary: GOLD,
    primaryText: CHARCOAL,
    primarySubtle: '#F3E3CE',
    danger: BRICK,
    success: SAGE,
    successSubtle: '#E3EBE0',
    successText: '#FFFFFF',
    placeholder: '#ECE3D5',
    feature: CHARCOAL,
    featureText: '#F7F2EA',
    featureMuted: GOLD,
  },
  // C: charcoal does the work. Black buttons, gold only marks what's selected, brick cards.
  C: {
    name: 'Ink & gold',
    dark: false,
    background: '#FBFAF7',
    text: CHARCOAL,
    muted: '#6B6862',
    border: '#DEDAD3',
    primary: CHARCOAL,
    primaryText: '#FBFAF7',
    primarySubtle: '#F6E7D3',
    danger: BRICK,
    success: SAGE,
    successSubtle: '#E5ECE2',
    successText: '#FFFFFF',
    placeholder: '#EEEAE3',
    feature: BRICK,
    featureText: '#FFF6EC',
    featureMuted: '#F3D6CF',
  },
} satisfies Record<string, Palette>;

export type PaletteKey = keyof typeof palettes;

export const PALETTE_KEYS = Object.keys(palettes) as PaletteKey[];

function storedPalette(): PaletteKey {
  try {
    const stored = SecureStore.getItem?.(PALETTE_STORAGE_KEY);
    if (stored && stored in palettes) return stored as PaletteKey;
  } catch {}
  return 'A';
}

export const PALETTE: PaletteKey = storedPalette();

export const colors: Palette = palettes[PALETTE];

export const spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 };
