import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Markdown } from './Markdown.jsx';

function show(text, props = {}) {
  return render(<Markdown text={text} {...props} />).container;
}

describe('Markdown', () => {
  it('renders the shapes a reply actually uses', () => {
    const container = show(
      [
        '## A heading',
        '',
        'Some **bold** text, some *emphasis*, and `inline code`.',
        '',
        '- first',
        '- second',
        '',
        '1. one',
        '2. two',
        '',
        '```js',
        'const answer = 42;',
        '```',
        '',
        '> a quotation',
      ].join('\n'),
    );

    expect(screen.getByRole('heading', { name: 'A heading' })).toBeInTheDocument();
    expect(container.querySelector('strong')).toHaveTextContent('bold');
    expect(container.querySelector('em')).toHaveTextContent('emphasis');
    expect(container.querySelectorAll('ul li')).toHaveLength(2);
    expect(container.querySelectorAll('ol li')).toHaveLength(2);
    expect(container.querySelector('pre')).toHaveTextContent('const answer = 42;');
    expect(container.querySelector('blockquote')).toHaveTextContent('a quotation');
  });

  it('renders a table that scrolls inside itself', () => {
    const container = show(['| wire | default |', '| --- | --- |', '| openai | yes |'].join('\n'));

    expect(container.querySelectorAll('th')).toHaveLength(2);
    expect(container.querySelector('td')).toHaveTextContent('openai');
    // A wide table must scroll on its own rather than making the transcript
    // scroll sideways. The wrapper is where that lives.
    expect(container.querySelector('table').closest('.table-node-wrapper')).not.toBeNull();
  });

  it('links only to schemes a browser should follow', () => {
    const container = show('[safe](https://example.dev) and [unsafe](javascript:alert(1))');

    const links = container.querySelectorAll('a');
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAttribute('href', 'https://example.dev');

    // The refused link becomes its own text: the words the model wrote are
    // still there, and the address that would have run is not in the document
    // at all.
    expect(container.textContent).toContain('unsafe');
    expect(container.innerHTML).not.toContain('javascript:');
  });

  it('does not fetch an image a reply names', () => {
    // A remote image is a request leaving the device, from an app whose promise
    // is that nothing does so unasked — and a one-pixel image is how that gets
    // abused. The address is offered to the reader as a link instead.
    const container = show('![a diagram](https://tracker.example/pixel.png)');

    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('a')).toHaveAttribute(
      'href',
      'https://tracker.example/pixel.png',
    );
    expect(container.textContent).toContain('a diagram');
  });

  it('does not link an image whose address is not one a browser should follow', () => {
    const container = show('![x](javascript:alert(1))');

    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('a')).toBeNull();
    expect(container.innerHTML).not.toContain('javascript:');
  });

  it('shows raw HTML as the text it is', () => {
    // htmlPolicy="escape". The library's default sanitises and renders, which
    // is right for content an application controls; this is content a model
    // wrote.
    const container = show('before <img src=x onerror="alert(1)"> after');

    expect(container.querySelector('img')).toBeNull();
    expect(container.textContent).toContain('<img src=x onerror="alert(1)">');
  });

  it('treats a half-written fence as a fence while the stream is open', () => {
    // What every streamed reply looks like partway through, and the reason this
    // renderer is the one being used.
    const container = show('Here you go:\n\n```js\nconst half = ', { final: false });

    expect(container.querySelector('pre')).toHaveTextContent('const half =');
  });

  it('renders text that is not Markdown at all unchanged', () => {
    const container = show('Just a sentence with a * star and an _ underscore.');

    expect(container.textContent).toBe('Just a sentence with a * star and an _ underscore.');
  });

  it('does not link an address that carries no scheme of its own', () => {
    // A relative link in a reply would resolve against the app's own URL, which
    // is not a place the model can have meant. An empty one is the same trap
    // wearing a different hat: resolved against a base it looks perfectly safe.
    const container = show('[here](/settings) and [there](./notes/a.md)');

    expect(container.querySelector('a')).toBeNull();
    expect(container.textContent).toContain('here');
    expect(container.textContent).toContain('there');
  });
});
