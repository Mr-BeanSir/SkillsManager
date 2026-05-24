import { type ReactNode, useRef, useState } from "react";

type TooltipProps = {
  content: ReactNode;
  children: ReactNode;
  placement?: "top" | "bottom" | "left" | "right";
};

export function Tooltip({
  content,
  children,
  placement = "top"
}: TooltipProps) {
  const [visible, setVisible] = useState(false);
  const hideTimeout = useRef<ReturnType<typeof setTimeout>>();

  function show() {
    clearTimeout(hideTimeout.current);
    setVisible(true);
  }

  function hide() {
    clearTimeout(hideTimeout.current);
    hideTimeout.current = setTimeout(() => setVisible(false), 80);
  }

  return (
    <span
      className="tooltip-trigger"
      onMouseEnter={show}
      onMouseLeave={hide}
    >
      {children}
      {visible ? (
        <span
          className={`tooltip-content tooltip-${placement}`}
          onMouseEnter={show}
          onMouseLeave={hide}
          role="tooltip"
        >
          {content}
        </span>
      ) : null}
    </span>
  );
}
