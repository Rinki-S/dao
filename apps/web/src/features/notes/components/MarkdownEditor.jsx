import { useCallback, useEffect, useRef } from 'react';
import { Crepe, CrepeFeature } from '@milkdown/crepe';
import { Milkdown, MilkdownProvider, useEditor } from '@milkdown/react';

function MilkdownEditor({ value, onChange, placeholder }) {
  const onChangeRef = useRef(onChange);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEditor(
    useCallback(
      (root) => {
        const crepe = new Crepe({
          root,
          defaultValue: value,
          featureConfigs: {
            [CrepeFeature.Placeholder]: {
              text: placeholder,
              mode: 'doc',
            },
          },
        });

        crepe.on((listener) => {
          listener.markdownUpdated((_, markdown) => {
            onChangeRef.current(markdown);
          });
        });

        return crepe;
      },
      [placeholder, value],
    ),
  );

  return <Milkdown />;
}

export function MarkdownEditor({ value, onChange, placeholder = 'Write markdown...' }) {
  return (
    <div className="dao-markdown-editor min-h-0 flex-1 overflow-y-auto">
      <MilkdownProvider>
        <MilkdownEditor value={value} onChange={onChange} placeholder={placeholder} />
      </MilkdownProvider>
    </div>
  );
}
