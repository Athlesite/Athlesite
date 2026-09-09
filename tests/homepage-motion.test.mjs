import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import test from 'node:test';
import ts from 'typescript';

const source = ts.transpileModule(readFileSync('src/components/marketing/editorial/motion.ts', 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ES2020 },
}).outputText.replace('export function', 'function');

function setup({ reduced = false, mobile = false, supported = true } = {}) {
  const listeners = new Set();
  const preference = { matches: reduced, addEventListener: (_, fn) => listeners.add(fn), removeEventListener: (_, fn) => listeners.delete(fn) };
  const observed = new Set();
  let callback, disconnected = false;
  class Element {
    constructor(top, variant = 'up', delay = '0') { this.top = top; this.dataset = { homeReveal: variant, homeDelay: delay }; this.calls = []; }
    getBoundingClientRect() { return { top: this.top, bottom: this.top + 300 }; }
    animate(frames, options) {
      const animation = { cancelled: false, finished: new Promise(() => {}), cancel() { this.cancelled = true; } };
      this.calls.push({ frames, options, animation });
      return animation;
    }
  }
  class Observer {
    constructor(fn) { callback = fn; }
    observe(node) { observed.add(node); }
    unobserve(node) { observed.delete(node); }
    disconnect() { disconnected = true; observed.clear(); }
  }
  const window = { innerHeight: 800, matchMedia: query => query.includes('reduced-motion') ? preference : { matches: mobile } };
  if (supported) window.IntersectionObserver = Observer;
  const context = vm.createContext({ window, IntersectionObserver: Observer, HTMLElement: Element });
  vm.runInContext(source, context);
  const nodes = [new Element(20), new Element(1000, 'image', '90'), new Element(1400, 'right', '999')];
  const cleanup = context.startHomepageMotion({ querySelectorAll: () => nodes });
  return { nodes, observed, listeners, preference, cleanup, enter: node => callback([{ target: node, isIntersecting: true }]), disconnected: () => disconnected };
}

test('initial viewport stays stable; below-fold imagery enters once and stagger is bounded', () => {
  const h = setup();
  assert.equal(h.observed.has(h.nodes[0]), false);
  h.enter(h.nodes[1]); h.enter(h.nodes[1]); h.enter(h.nodes[2]);
  assert.equal(h.nodes[1].calls.length, 1);
  assert.match(h.nodes[1].calls[0].frames[0].transform, /scale/);
  assert.equal(h.nodes[1].calls[0].options.duration, 800);
  assert.equal(h.nodes[2].calls[0].options.delay, 180);
  h.cleanup();
  assert.equal(h.disconnected(), true);
  assert.equal(h.listeners.size, 0);
  assert.equal(h.nodes[1].calls[0].animation.cancelled, true);
});

test('mobile uses vertical movement without desktop stagger', () => {
  const h = setup({ mobile: true }); h.enter(h.nodes[2]);
  assert.match(h.nodes[2].calls[0].frames[0].transform, /translateY/);
  assert.equal(h.nodes[2].calls[0].options.delay, 0);
  h.cleanup();
});

test('reduced motion skips entrances and preference changes cancel active motion', () => {
  const reduced = setup({ reduced: true }); reduced.enter(reduced.nodes[1]);
  assert.equal(reduced.nodes[1].calls.length, 0); reduced.cleanup();
  const h = setup(); h.enter(h.nodes[1]);
  h.preference.matches = true; h.listeners.forEach(fn => fn());
  assert.equal(h.nodes[1].calls[0].animation.cancelled, true);
  h.enter(h.nodes[2]); assert.equal(h.nodes[2].calls.length, 0); h.cleanup();
});

test('unsupported browsers leave content alone and allow cleanup', () => {
  const h = setup({ supported: false }); assert.equal(h.observed.size, 0);
  assert.equal(h.listeners.size, 0); h.cleanup();
});
