type Kid = Node | string | null | false | undefined;

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K, props: Record<string, unknown> = {}, ...kids: Kid[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v === null || v === undefined || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
    else if (k === 'class') el.className = String(v);
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of kids) if (c !== null && c !== undefined && c !== false) el.append(c);
  return el;
}

/** Like replaceChildren, but ignores null / undefined / false entries so conditional children are safe. */
export function setChildren(el: Element, ...kids: Kid[]): void {
  el.replaceChildren(...kids.filter((k): k is Node | string => k !== null && k !== undefined && k !== false));
}

let region: HTMLElement | null = null;
export function toast(message: string, kind: 'info' | 'error' = 'info'): void {
  if (!region) {
    region = h('div', { class: 'toasts', 'aria-live': 'polite' });
    document.body.append(region);
  }
  const el = h('div', { class: `toast ${kind}`, role: kind === 'error' ? 'alert' : 'status' }, message);
  region.append(el);
  setTimeout(() => el.remove(), kind === 'error' ? 8000 : 4000);
}
