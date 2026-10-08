import { JSDOM } from "jsdom";
import { act } from "react";
import type { ReactElement } from "react";

/**
 * The smallest render harness that can exercise a real component.
 *
 * Deliberately **not** a testing framework. There is no `@testing-library`, no custom
 * matchers and no global setup file — just jsdom for a document, `createRoot` for a
 * real React tree, and `act` from React 19 so state updates flush before assertions.
 * Queries are plain DOM calls.
 *
 * **Why this exists at all.** Most of this repo's logic is deliberately extracted into
 * plain modules so the bare `node:test` runner can reach it without a DOM — see
 * `otpMachine.ts`, `age-eligibility.ts`, `profile-save-decisions.ts`. That works for
 * pure decisions, but the age-gate regressions it was added for are about *mounted
 * component state*: data collected before a Back-navigation, blob URLs held by a live
 * tree, and a remount reading module state. Those cannot be observed without rendering.
 *
 * jsdom is a dev-only dependency; nothing here ships.
 */

type ReactDomClient = typeof import("react-dom/client");
type Root = ReturnType<ReactDomClient["createRoot"]>;

let reactDomClient: ReactDomClient | null = null;

/**
 * Imports `react-dom/client` **after** a document exists, and keeps the instance.
 *
 * This has to be lazy. At module-evaluation time react-dom computes
 * `canUseDOM` once, from whether `window.document` is present, and derives
 * `isInputEventSupported` from it. A static `import` is hoisted above the
 * `installDom()` call below, so react-dom would see no document, decide the
 * browser cannot report `input` events, and permanently fall back to its legacy
 * keyboard/focus polyfill for text fields. The visible symptom is specific and
 * very easy to misread: `onInput` fires, clicks fire, `<select>` `change` fires,
 * but `onChange` on a text input never does — so a controlled field silently
 * keeps whatever the test wrote into the DOM while React state stays empty.
 *
 * Importing after the document is installed makes that determination correctly,
 * once. The cached module is reused by later renders, which each install a fresh
 * document; react-dom reads the container element and the current globals per
 * render, so only this one-time capability check depends on ordering.
 */
async function loadReactDomClient(): Promise<ReactDomClient> {
  reactDomClient ??= await import("react-dom/client");
  return reactDomClient;
}

export type Harness = {
  container: HTMLElement;
  /** Flush a synchronous interaction (a click, a change) and re-render. */
  interact: (fn: () => void) => Promise<void>;
  text: () => string;
  /** All elements matching a selector, as a real array. */
  all: <T extends Element = Element>(selector: string) => T[];
  /** First element whose trimmed text content matches exactly. */
  byText: <T extends Element = Element>(selector: string, text: string) => T | undefined;
  unmount: () => Promise<void>;
};

/**
 * Installs a jsdom document on the global object.
 *
 * React reads `window`/`document` from globals at module scope, so these have to exist
 * before a root is created. Returns a disposer that restores whatever was there, so
 * tests do not leak a document into one another.
 */
function installDom(): () => void {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", {
    url: "http://localhost/",
    pretendToBeVisual: true,
  });

  const globals = globalThis as unknown as Record<string, unknown>;

  const assigned: Record<string, unknown> = {
    window: dom.window,
    document: dom.window.document,
    navigator: dom.window.navigator,
    HTMLElement: dom.window.HTMLElement,
    HTMLInputElement: dom.window.HTMLInputElement,
    HTMLSelectElement: dom.window.HTMLSelectElement,
    Element: dom.window.Element,
    Node: dom.window.Node,
    Event: dom.window.Event,
    MouseEvent: dom.window.MouseEvent,
    File: dom.window.File,
    getComputedStyle: dom.window.getComputedStyle.bind(dom.window),
    requestAnimationFrame: (cb: FrameRequestCallback) =>
      setTimeout(() => cb(Date.now()), 0) as unknown as number,
    cancelAnimationFrame: (id: number) => clearTimeout(id),
    // React 19 checks this flag before allowing `act`.
    IS_REACT_ACT_ENVIRONMENT: true,
  };

  // `defineProperty` rather than assignment: several of these (notably `navigator`) are
  // getter-only on the Node global, so a plain `globals.navigator = …` throws.
  const restore = Object.keys(assigned).map((key) => {
    const descriptor = Object.getOwnPropertyDescriptor(globals, key);
    Object.defineProperty(globals, key, {
      value: assigned[key],
      configurable: true,
      writable: true,
    });
    return { key, descriptor };
  });

  return () => {
    dom.window.close();
    for (const { key, descriptor } of restore) {
      if (descriptor) Object.defineProperty(globals, key, descriptor);
      else delete globals[key];
    }
  };
}

/** Renders `element` into a fresh jsdom document and returns handles for driving it. */
export async function render(element: ReactElement): Promise<Harness> {
  const dispose = installDom();
  const { createRoot } = await loadReactDomClient();
  const container = document.createElement("div");
  document.body.appendChild(container);

  let root: Root;
  await act(async () => {
    root = createRoot(container);
    root.render(element);
  });

  return {
    container,
    interact: async (fn: () => void) => {
      await act(async () => {
        fn();
      });
    },
    text: () => container.textContent ?? "",
    all: <T extends Element = Element>(selector: string) =>
      Array.from(container.querySelectorAll(selector)) as T[],
    byText: <T extends Element = Element>(selector: string, value: string) =>
      Array.from(container.querySelectorAll(selector)).find(
        (node) => (node.textContent ?? "").trim() === value
      ) as T | undefined,
    unmount: async () => {
      await act(async () => {
        root.unmount();
      });
      dispose();
    },
  };
}

/** Fires a native click, the way a browser would. */
export function click(node: Element | undefined): void {
  if (!node) throw new Error("click(): element not found");
  node.dispatchEvent(new window.Event("click", { bubbles: true }));
}

/** Sets a `<select>`'s value and fires the change React listens for. */
export function selectOption(node: Element | undefined, value: string): void {
  if (!node) throw new Error("selectOption(): element not found");
  const select = node as HTMLSelectElement;
  // React 19 tracks the DOM value to dedupe change events, so the tracker has to be
  // bypassed for a programmatic set to register as a real change.
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLSelectElement.prototype,
    "value"
  )?.set;
  setter?.call(select, value);
  select.dispatchEvent(new window.Event("change", { bubbles: true }));
}
