import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';

const storageValues = new Map();
Object.defineProperty(window, 'localStorage', {
  configurable: true,
  value: {
    clear: () => storageValues.clear(),
    getItem: (key) => storageValues.get(key) ?? null,
    removeItem: (key) => storageValues.delete(key),
    setItem: (key, value) => storageValues.set(key, String(value)),
  },
});

Element.prototype.scrollIntoView = vi.fn();

Object.defineProperty(Element.prototype, 'getAnimations', {
  configurable: true,
  value() {
    return [];
  },
});

class ResizeObserverMock {
  observe() {}

  unobserve() {}

  disconnect() {}
}

globalThis.ResizeObserver = ResizeObserverMock;

/**
 * jsdom implements no IntersectionObserver, and it lays nothing out, so there
 * is no honest answer it could give about what is on screen.
 *
 * This one reports everything as visible and hands each instance to the test,
 * so a test that cares — the transcript only follows a reply for a reader who
 * is at the bottom of it — can say otherwise.
 */
class IntersectionObserverMock {
  constructor(callback) {
    this.callback = callback;
    this.elements = new Set();
    IntersectionObserverMock.instances.push(this);
  }

  observe(element) {
    this.elements.add(element);
    this.callback([{ target: element, isIntersecting: true }], this);
  }

  unobserve(element) {
    this.elements.delete(element);
  }

  disconnect() {
    this.elements.clear();
  }

  /** Report what the test says, rather than what jsdom cannot know. */
  report(isIntersecting) {
    this.callback(
      [...this.elements].map((target) => ({ target, isIntersecting })),
      this,
    );
  }
}

IntersectionObserverMock.instances = [];

globalThis.IntersectionObserver = IntersectionObserverMock;

Object.defineProperty(Document.prototype, 'elementFromPoint', {
  configurable: true,
  value() {
    return this.querySelector('.ProseMirror') ?? this.body;
  },
});

Object.defineProperty(Range.prototype, 'getBoundingClientRect', {
  configurable: true,
  value() {
    return new DOMRect(0, 0, 0, 0);
  },
});

Object.defineProperty(Range.prototype, 'getClientRects', {
  configurable: true,
  value() {
    return [this.getBoundingClientRect()];
  },
});

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});
