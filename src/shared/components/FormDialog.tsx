import { type FormEvent, type ReactNode } from "react";
import { Modal } from "./Modal";

type FormDialogProps = {
  title: string;
  description?: string;
  submitLabel: string;
  submitIcon?: ReactNode;
  cancelLabel: string;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onCancel: () => void;
  disabled?: boolean;
  closeLabel?: string;
  children: ReactNode;
  formClassName?: string;
};

export function FormDialog({
  title,
  description,
  submitLabel,
  submitIcon,
  cancelLabel,
  onSubmit,
  onCancel,
  disabled = false,
  closeLabel,
  children,
  formClassName,
}: FormDialogProps) {
  return (
    <Modal
      closeOnBackdropClick={!disabled}
      closeLabel={closeLabel}
      description={description}
      title={title}
      onClose={onCancel}
    >
      <form className={formClassName} onSubmit={onSubmit}>
        {children}
        <div className="modal-actions">
          <button
            className="button button-secondary"
            disabled={disabled}
            onClick={onCancel}
            type="button"
          >
            {cancelLabel}
          </button>
          <button
            className="button button-primary"
            disabled={disabled}
            type="submit"
          >
            {submitIcon}
            {submitLabel}
          </button>
        </div>
      </form>
    </Modal>
  );
}
