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
