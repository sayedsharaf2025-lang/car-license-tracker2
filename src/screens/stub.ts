import { h } from '../ui.ts';
import { t } from '../copy.ts';
import { go, type Screen } from '../router.ts';

export function stubScreen(name: string): Screen {
  return {
    el: h('main', { class: 'page' },
      h('h1', {}, name),
      h('p', { class: 'muted' }, t.stub.body),
      h('button', { class: 'btn secondary', onclick: () => go('/') }, t.editor.back)),
  };
}
