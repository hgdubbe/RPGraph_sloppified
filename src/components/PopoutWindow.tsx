import { type ReactNode, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

type PopoutWindowProps = {
  open: boolean;
  title: string;
  features?: string;
  onClose: () => void;
  children: ReactNode;
};

function copyDocumentStyles(targetDocument: Document) {
  targetDocument.head.innerHTML = '';
  document.querySelectorAll('link[rel="stylesheet"], style').forEach((node) => {
    targetDocument.head.appendChild(node.cloneNode(true));
  });
}

export function PopoutWindow({
  open,
  title,
  features = 'width=720,height=900,resizable=yes,scrollbars=no',
  onClose,
  children,
}: PopoutWindowProps) {
  const [target, setTarget] = useState<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) {
      setTarget(null);
      return undefined;
    }

    const popup = window.open('about:blank', 'rpgraph-roleplay-popout', features);
    if (!popup) {
      onClose();
      return undefined;
    }

    popup.document.title = title;
    copyDocumentStyles(popup.document);
    popup.document.body.className = 'roleplay-popout-body';
    popup.document.body.innerHTML = '<main id="roleplay-popout-root"></main>';
    const root = popup.document.getElementById('roleplay-popout-root');
    setTarget(root);

    const handleBeforeUnload = () => onClose();
    popup.addEventListener('beforeunload', handleBeforeUnload);
    const pollClosed = window.setInterval(() => {
      if (popup.closed) {
        onClose();
      }
    }, 500);

    return () => {
      window.clearInterval(pollClosed);
      popup.removeEventListener('beforeunload', handleBeforeUnload);
      if (!popup.closed) {
        popup.close();
      }
      setTarget(null);
    };
  }, [features, onClose, open, title]);

  if (!open) {
    return <>{children}</>;
  }
  return target ? createPortal(children, target) : null;
}
