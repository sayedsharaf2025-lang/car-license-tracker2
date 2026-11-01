import { registerPlugin } from '@capacitor/core';

// Native plugin: native/MediaSaverPlugin.java (copied into the Android project by the CI workflow).
export interface MediaSaverPlugin {
  saveImage(options: { data: string; name: string; mime: string; album: string }): Promise<{ uri: string }>;
}

export const MediaSaver = registerPlugin<MediaSaverPlugin>('MediaSaver');
