// The app's two palettes, built from gold #DFA05D, brick #AC5045, sage #658761 and charcoal #1C1C1C.
// Chosen by prototype (branch prototype/palette): its variant C is the light theme, A the dark one.
const GOLD = '#DFA05D';
const BRICK = '#AC5045';
const SAGE = '#658761';
const CHARCOAL = '#1C1C1C';

export type Colors = {
  background: string;
  text: string;
  muted: string;
  border: string;
  /** Fills (buttons, active states) and accent text such as links. */
  primary: string;
  /** Text and icons sitting on a primary fill. */
  primaryText: string;
  /** Selected or pressed rows and options. */
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
  /** Dims the screen behind a sheet. */
  backdrop: string;
};

/** Ink & gold: charcoal does the work, gold only marks what's selected. */
export const lightColors: Colors = {
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
  backdrop: 'rgba(0, 0, 0, 0.3)',
};

/** Charcoal night: charcoal is the room, gold is the light in it. */
export const darkColors: Colors = {
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
  backdrop: 'rgba(0, 0, 0, 0.6)',
};

export const spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 };
