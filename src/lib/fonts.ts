// The fonts bundled in the app (see scripts/gen-fonts.mjs and src/styles/fonts.css). No DOM at import time.
export type Script = 'ar' | 'en';
export interface FontDef { name: string; script: Script; weight: 400 | 700 }

export const FONT_DEFS: FontDef[] = [
  { name: 'Cairo', script: 'ar', weight: 700 }, { name: 'Tajawal', script: 'ar', weight: 700 }, { name: 'Almarai', script: 'ar', weight: 700 },
  { name: 'Amiri', script: 'ar', weight: 700 }, { name: 'Noto Kufi Arabic', script: 'ar', weight: 700 }, { name: 'Reem Kufi', script: 'ar', weight: 700 },
  { name: 'El Messiri', script: 'ar', weight: 700 }, { name: 'Changa', script: 'ar', weight: 700 }, { name: 'Noto Naskh Arabic', script: 'ar', weight: 700 },
  { name: 'IBM Plex Sans Arabic', script: 'ar', weight: 700 }, { name: 'Vazirmatn', script: 'ar', weight: 700 }, { name: 'Markazi Text', script: 'ar', weight: 700 },
  { name: 'Aref Ruqaa', script: 'ar', weight: 700 }, { name: 'Lateef', script: 'ar', weight: 700 }, { name: 'Lalezar', script: 'ar', weight: 400 }, { name: 'Rakkas', script: 'ar', weight: 400 },
  { name: 'Roboto', script: 'en', weight: 700 }, { name: 'Montserrat', script: 'en', weight: 700 }, { name: 'Poppins', script: 'en', weight: 700 },
  { name: 'Playfair Display', script: 'en', weight: 700 }, { name: 'Oswald', script: 'en', weight: 700 }, { name: 'Inter', script: 'en', weight: 700 },
  { name: 'Merriweather', script: 'en', weight: 700 }, { name: 'Lobster', script: 'en', weight: 400 }, { name: 'Bebas Neue', script: 'en', weight: 400 },
  { name: 'Pacifico', script: 'en', weight: 400 }, { name: 'Anton', script: 'en', weight: 400 },
];

export const FONTS = FONT_DEFS.map((f) => f.name);
export const isArabic = (s: string): boolean => /[\u0600-\u06FF]/.test(s);
export const scriptOf = (text: string): Script => (isArabic(text) ? 'ar' : 'en');

const weightOf = (name: string): number => FONT_DEFS.find((f) => f.name === name)?.weight ?? 700;

/** CSS font shorthand for a bundled font at `px` size, with the right weight for that font (some only have 400). */
export const fontCss = (name: string, px: number): string => `${weightOf(name)} ${px}px "${name}", sans-serif`;

/** Fonts that can draw `text`: Arabic text -> the Arabic fonts (they also include Latin letters); otherwise -> the Latin fonts. */
export const fontsFor = (text: string): string[] => FONT_DEFS.filter((f) => (isArabic(text) ? f.script === 'ar' : f.script === 'en')).map((f) => f.name);

/** Loads both the Arabic and Latin parts of a font (they are separate files selected by unicode-range). */
export async function loadFont(name: string): Promise<void> {
  const css = fontCss(name, 32);
  await Promise.all([document.fonts.load(css, 'A'), document.fonts.load(css, '\u0627')]);
}
