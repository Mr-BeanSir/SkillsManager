import { type ReactNode } from "react";
import { Modal } from "./Modal";

type ConfirmDialogProps = {
  title: string;
  description?: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  disabled?: boolean;
  danger?: boolean;
  closeOnBackdropClick?: boolean;
  confirmIcon?: ReactNode;
};

export function ConfirmDialog({
  title,
  description,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
  disabled = false,
  danger = false,
  closeOnBackdropClick = true,
  confirmIcon,
}: ConfirmDialogProps) {
  return (
    <Modal
      closeOnBackdropClick={closeOnBackdropClick}
      description={description}
      title={title}
      onClose={onCancel}
      actions={
        <>
          <button
            className="button button-secondary"
            disabled={disabled}
            onClick={onCancel}
            type="button"
          >
            {cancelLabel}
          </button>
          <button
            className={danger ? "button button-danger" : "button button-primary"}
            disabled={disabled}
            onClick={onConfirm}
            type="button"
          >
            {confirmIcon}
            {confirmLabel}
          </button>
        </>
      }
    />
  );
}
