export interface Screen { el: HTMLElement; dispose?: () => void }
type Factory = () => Screen;

const routes = new Map<string, Factory>();
let current: Screen | null = null;

export function route(path: string, f: Factory): void { routes.set(path, f); }
export function go(path: string): void { location.hash = '#' + path; }

export function start(root: HTMLElement, fallback: Factory): void {
  const render = () => {
    current?.dispose?.();
    const path = location.hash.replace(/^#/, '') || '/';
    current = (routes.get(path) ?? fallback)();
    root.replaceChildren(current.el);
  };
  window.addEventListener('hashchange', render);
  render();
}
