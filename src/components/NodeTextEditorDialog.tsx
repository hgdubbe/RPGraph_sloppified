import {
  useEffect,
  useRef,
  useState,
} from 'react';
import type { NodeTextEditorRequest } from '../nodes/types';

type NodeTextEditorDialogProps = {
  request: NodeTextEditorRequest;
  onClose: () => void;
};

export function NodeTextEditorDialog({ request, onClose }: NodeTextEditorDialogProps) {
  const [draft, setDraft] = useState(request.value);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    window.requestAnimationFrame(() => {
      textareaRef.current?.focus();
    });
  }, []);

  return (
    <div className="modal-overlay node-text-editor-overlay" role="presentation" onMouseDown={onClose}>
      <section
        className="node-text-editor-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Large node text editor"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="node-text-editor-header">
          <div>
            <strong>{request.title}</strong>
            <small>{request.language === 'json' ? 'JSON / prompt text' : 'Plain prompt text'}</small>
          </div>
          <button type="button" onClick={onClose} aria-label="Cancel large text edit">
            Cancel
          </button>
        </header>
        <textarea
          ref={textareaRef}
          className="node-text-editor-field"
          value={draft}
          spellCheck={false}
          onChange={(event) => setDraft(event.currentTarget.value)}
        />
        <footer className="node-text-editor-footer">
          <span>{draft.length.toLocaleString()} characters</span>
          <div>
            <button type="button" onClick={onClose}>
              Cancel
            </button>
            <button
              className="primary"
              type="button"
              onClick={() => {
                request.onApply(draft);
                onClose();
              }}
            >
              Apply
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
}
