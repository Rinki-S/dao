import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Markdown } from './Markdown.jsx';

function show(text) {
  return render(<Markdown text={text} />).container;
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
    expect(container.querySelector('pre code')).toHaveTextContent('const answer = 42;');
    expect(container.querySelector('blockquote')).toHaveTextContent('a quotation');
  });

  it('renders a table', () => {
    const container = show(['| wire | default |', '| --- | --- |', '| openai | yes |'].join('\n'));

    expect(container.querySelectorAll('th')).toHaveLength(2);
    expect(container.querySelector('td')).toHaveTextContent('openai');
    // A wide table scrolls inside itself rather than making the transcript
    // scroll sideways.
    expect(container.querySelector('table').parentElement).toHaveClass('overflow-x-auto');
  });

  it('links only to schemes a browser should follow', () => {
    const container = show('[safe](https://example.dev) and [unsafe](javascript:alert(1))');

    const links = container.querySelectorAll('a');
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAttribute('href', 'https://example.dev');

    // The refused link is still shown, as the text the model wrote. Dropping it
    // would hide from the reader that the model produced it at all.
    expect(container.textContent).toContain('[unsafe](javascript:alert(1))');
  });

  it('does not fetch an image a reply names', () => {
    // A remote image is a request leaving the device, from an app whose promise
    // is that nothing does so unasked — and a one-pixel image is how that gets
    // abused. The address is offered to the reader instead.
    const container = show('![a diagram](https://tracker.example/pixel.png)');

    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByRole('link', { name: 'a diagram' })).toHaveAttribute(
      'href',
      'https://tracker.example/pixel.png',
    );
  });

  it('shows raw HTML as the text it is', () => {
    // Nothing here builds an HTML string, so a tag in the model's output has no
    // route to becoming a tag in the document. This is the test that says so.
    const container = show('before <img src=x onerror="alert(1)"> after');

    expect(container.querySelector('img')).toBeNull();
    expect(container.textContent).toContain('<img src=x onerror="alert(1)">');
  });

  it('shows a half-written fence as code rather than as nothing', () => {
    // What every streamed reply looks like partway through.
    const container = show('Here you go:\n\n```js\nconst half = ');

    expect(container.querySelector('pre code')).toHaveTextContent('const half =');
  });

  it('renders text that is not Markdown at all unchanged', () => {
    const container = show('Just a sentence with a * star and an _ underscore.');

    expect(container.textContent).toBe('Just a sentence with a * star and an _ underscore.');
  });
});
