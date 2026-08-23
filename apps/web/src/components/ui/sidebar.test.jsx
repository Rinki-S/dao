import { render } from '@testing-library/react';
import { createRef } from 'react';
import { describe, expect, it } from 'vitest';
import { Sidebar, SidebarProvider } from './sidebar.jsx';

describe('Sidebar', () => {
  // The hover peek retracts by comparing the pointer against this element's
  // right edge, so a ref that does not reach it would collapse the peek on the
  // first pointer move.
  it('forwards a ref to the container element', () => {
    const ref = createRef(null);

    render(
      <SidebarProvider>
        <Sidebar ref={ref} />
      </SidebarProvider>,
    );

    expect(ref.current).toBeInstanceOf(HTMLElement);
    expect(ref.current).toHaveAttribute('data-slot', 'sidebar-container');
  });
});
