import { type ReactNode, useEffect, useId } from "react";
import { X } from "@phosphor-icons/react";

type ModalProps = {
  title: string;
  description?: string;
  children?: ReactNode;
  actions?: ReactNode;
  compact?: boolean;
  closeOnBackdropClick?: boolean;
  closeLabel?: string;
  onClose?: () => void;
  className?: string;
};

export function Modal({
  title,
  description,
  children,
  actions,
  compact = true,
  closeOnBackdropClick = true,
  closeLabel,
  onClose,
  className,
}: ModalProps) {
  const titleId = useId();

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && onClose) {
        onClose();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  function handleBackdropClick() {
    if (closeOnBackdropClick && onClose) {
      onClose();
    }
  }

  const panelClassName = compact
    ? `modal-panel modal-panel-compact${className ? ` ${className}` : ""}`
    : `modal-panel${className ? ` ${className}` : ""}`;

  return (
    <div className="modal-backdrop" onClick={handleBackdropClick}>
      <div
        aria-labelledby={titleId}
        aria-modal="true"
        className={panelClassName}
        onClick={(event) => event.stopPropagation()}
        role="dialog"
      >
        <div className="panel-header">
          <div>
            <h2 id={titleId}>{title}</h2>
            {description ? <p>{description}</p> : null}
          </div>
          {closeLabel && onClose ? (
            <button
              aria-label={closeLabel}
              className="icon-button"
              onClick={onClose}
              type="button"
            >
              <X size={18} weight="bold" aria-hidden="true" />
            </button>
          ) : null}
        </div>
        {children}
        {actions ? (
          <div className="modal-actions modal-actions-pad">{actions}</div>
        ) : null}
      </div>
    </div>
  );
}
