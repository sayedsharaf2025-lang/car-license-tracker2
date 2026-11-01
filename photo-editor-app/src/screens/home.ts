import { h, toast } from '../ui.ts';
import { t } from '../copy.ts';
import { go, type Screen } from '../router.ts';
import { projects } from '../data/store.ts';

// S02 Home. S03 (photo picker) is the system picker opened by the file input.
export function homeScreen(): Screen {
  const status = h('p', { class: 'muted', 'aria-live': 'polite' });
  const input: HTMLInputElement = h('input', {
    type: 'file', accept: 'image/*', class: 'visually-hidden', id: 'photo-input',
    onchange: async () => {
      const file = input.files?.[0];
      if (!file) return;
      status.textContent = t.home.loadingPhoto;
      try {
        await projects.create(file);
        go('/editor');
      } catch {
        status.textContent = '';
        toast(t.home.photoFailed, 'error');
      } finally {
        input.value = '';
      }
    },
  });

  const recent = projects.list();
  const list = recent.length
    ? h('ul', { class: 'recent' }, ...recent.map((p) =>
        h('li', {}, h('button', { class: 'btn secondary', onclick: () => { projects.open(p.id); go('/editor'); } }, p.title))))
    : h('p', { class: 'muted' }, t.home.recentEmpty);

  return {
    el: h('main', { class: 'page' },
      h('h1', {}, t.home.title),
      h('label', { class: 'btn primary', for: 'photo-input' }, t.home.pick),
      input, status,
      h('h2', {}, t.home.recent), list),
  };
}
