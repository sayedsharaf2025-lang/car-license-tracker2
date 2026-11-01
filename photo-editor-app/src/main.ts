import './styles/tokens.css';
import './styles/app.css';
import './styles/fonts.css';
import { route, start } from './router.ts';
import { homeScreen } from './screens/home.ts';
import { editorScreen } from './screens/editor.ts';
import { stubScreen } from './screens/stub.ts';

route('/', homeScreen);
route('/editor', editorScreen);

// Stub routes for every screen in the recon map that is not built yet (S06-S19).
const stubs: Record<string, string> = {
  S06: 'الخلفية', S07: 'خلفية بالذكاء الاصطناعي', S08: 'استبدال بالذكاء الاصطناعي', S09: 'إزالة عنصر',
  S10: 'تحسين الجودة', S11: 'قص وتعديل', S12: 'فلاتر', S13: 'نص', S14: 'ملصقات ورسم',
  S15: 'الطبقات', S17: 'حدود الاستخدام', S18: 'الإعدادات', S19: 'البحث عن الخط',
};
for (const [id, name] of Object.entries(stubs)) route(`/s/${id}`, () => stubScreen(name));

start(document.getElementById('app')!, () => homeScreen());
