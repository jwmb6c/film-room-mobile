// Tiny helpers for building screens without a framework.

// h('button', {class: 'btn', onclick: fn}, 'Label') -> <button class="btn">Label</button>
// Attributes: class, dataset, on* handlers, DOM properties (value, type, disabled...) or plain attributes.
export function h(tag, attrs, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs ?? {})) {
    if (value == null || value === false) continue;
    if (key === 'class') el.className = value;
    else if (key === 'dataset') Object.assign(el.dataset, value);
    else if (key.startsWith('on')) el.addEventListener(key.slice(2), value);
    else if (key in el) el[key] = value;
    else el.setAttribute(key, value === true ? '' : value);
  }
  for (const child of children.flat(Infinity)) {
    if (child == null || child === false) continue;
    el.append(child instanceof Node ? child : String(child));
  }
  return el;
}

// Replace parent's contents with children, skipping null/false (replaceChildren alone would write "null").
export function fill(parent, ...children) {
  parent.replaceChildren(...children.flat(Infinity).filter(child => child != null && child !== false));
}

let toastTimer;
// A short message at the bottom of the screen; bad = red.
export function toast(text, bad = false) {
  const el = document.getElementById('toast');
  el.textContent = text;
  el.classList.toggle('bad', bad);
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), bad ? 5000 : 2500);
}

// Top bar: a back link (or nothing), a title, and any buttons on the right.
export function topbar(title, { back, actions = [] } = {}) {
  return h('header', { class: 'topbar' },
    back ? h('a', { class: 'back', href: back, 'aria-label': 'Back' }, '‹') : null,
    h('h1', null, title),
    h('div', { class: 'actions' }, actions));
}

// A bottom panel over a dimmed screen, for menus and small forms. body is a node or list of nodes.
// Tapping outside the panel closes it. Returns {close}.
export function openModal(title, body) {
  const panel = h('div', { class: 'modal-panel', role: 'dialog', 'aria-label': title }, h('h2', null, title), body);
  const backdrop = h('div', { class: 'modal', onclick: event => { if (event.target === backdrop) close(); } }, panel);
  const close = () => backdrop.remove();
  document.body.append(backdrop);
  return { close };
}

// Today's date as YYYY-MM-DD in the phone's own time zone.
export function today() {
  return new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}
