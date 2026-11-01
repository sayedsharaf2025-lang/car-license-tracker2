import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.photoeditor.local',
  appName: 'محرر الصور',
  webDir: 'dist',
  server: { androidScheme: 'https' },
};
export default config;
