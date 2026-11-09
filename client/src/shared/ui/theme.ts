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
  /**
   * The app has two tones: background, and card a step off it (lighter in the dark, darker in the
   * light). Anything set into a card, such as an input or a picture, takes the background tone.
   */
  card: string;
  /** Outlines inputs, pickers, secondary buttons and a set being edited. */
  fieldBorder: string;
  /** Text-only actions such as "Add set note". */
  link: string;
  /** Fills (buttons, active states) and accent text such as links. */
  primary: string;
  /** Text and icons sitting on a primary fill. */
  primaryText: string;
  /** Selected or pressed rows and options. */
  primarySubtle: string;
  danger: string;
  /** The D that marks a drop Set; W and F take link and danger. */
  dropSet: string;
  /** Done: a logged set and its tick. */
  success: string;
  successSubtle: string;
  /** Text on a success fill. */
  successText: string;
  /** A logged set's Record tier (gold, silver, bronze): the row's fill and the text on it. */
  gold: string;
  goldText: string;
  silver: string;
  silverText: string;
  bronze: string;
  bronzeText: string;
  /** The filter cards: the app's one bold surface. */
  feature: string;
  featureText: string;
  featureMuted: string;
  /** Dims the screen behind a sheet. */
  backdrop: string;
  /** The open tab in the tab bar. */
  tabActive: string;
};

/** Ink & gold: charcoal does the work, gold only marks what's selected. */
export const lightColors: Colors = {
  background: '#FBFAF7',
  text: CHARCOAL,
  muted: '#6B6862',
  border: '#DEDAD3',
  card: '#F2EFE9',
  fieldBorder: '#CBC5BB',
  link: '#8F6127', // gold darkened to read as text on light (6.7:1); #DFA05D is ~2:1
  primary: CHARCOAL,
  primaryText: '#FBFAF7',
  primarySubtle: '#F6E7D3',
  danger: BRICK,
  dropSet: '#3F6E9E',
  success: SAGE,
  successSubtle: '#E5ECE2',
  successText: '#FFFFFF',
  // Each fill against its text is at least 6.9:1.
  gold: '#F2D3A6',
  goldText: '#5C3D12',
  silver: '#E2E3E5',
  silverText: '#383B40',
  bronze: '#EBCBB3',
  bronzeText: '#5E3519',
  feature: BRICK,
  featureText: '#FFF6EC',
  featureMuted: '#FAEAE5', // 4.5:1 on brick; any darker and it reads poorly
  backdrop: 'rgba(0, 0, 0, 0.3)',
  tabActive: CHARCOAL,
};

/** Charcoal night: charcoal is the room, gold is the light in it. */
export const darkColors: Colors = {
  background: CHARCOAL,
  text: '#F2ECE3',
  muted: '#9C958B',
  border: '#3A3734',
  card: '#262422',
  fieldBorder: '#4D4944',
  link: GOLD,
  primary: GOLD,
  primaryText: CHARCOAL,
  primarySubtle: '#3A2E21',
  danger: '#C9675B', // brick lifted so it reads on charcoal; #AC5045 is 2.9:1 here
  dropSet: '#8FB3D9',
  success: SAGE,
  successSubtle: '#263027',
  successText: '#F2ECE3',
  // Deep fills that stay apart from the charcoal; each against its text is at least 7.2:1.
  gold: '#5A4220',
  goldText: '#F7DDB8',
  silver: '#3D4045',
  silverText: '#E4E6EA',
  bronze: '#523426',
  bronzeText: '#F2CFB6',
  feature: BRICK,
  featureText: '#FFF6EC',
  featureMuted: '#FAEAE5', // 4.5:1 on brick, as in the light theme
  backdrop: 'rgba(0, 0, 0, 0.6)',
  tabActive: GOLD,
};

export const spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 };
