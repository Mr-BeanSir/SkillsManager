import { useCallback, useSyncExternalStore } from "react";

type MessageType = "success" | "error" | "info";

interface MessageItem {
  id: number;
  type: MessageType;
  text: string;
  exiting: boolean;
}

let nextId = 0;
let messages: MessageItem[] = [];
const subscribers = new Set<() => void>();
const timers = new Map<number, ReturnType<typeof setTimeout>>();

function subscribe(callback: () => void) {
  subscribers.add(callback);
  return () => subscribers.delete(callback);
}

function getSnapshot() {
  return messages;
}

function notify() {
  for (const fn of subscribers) {
    fn();
  }
}

function push(type: MessageType, text: string) {
  const id = nextId++;
  messages = [...messages, { id, type, text, exiting: false }];
  notify();

  const timer = setTimeout(() => {
    startExit(id);
  }, 3000);
  timers.set(id, timer);
}

function startExit(id: number) {
  timers.delete(id);
  messages = messages.map((m) => (m.id === id ? { ...m, exiting: true } : m));
  notify();

  setTimeout(() => {
    remove(id);
  }, 200);
}

function remove(id: number) {
  messages = messages.filter((m) => m.id !== id);
  notify();
}

export const message = {
  success(text: string) {
    push("success", text);
  },
  error(text: string) {
    push("error", text);
  },
  info(text: string) {
    push("info", text);
  }
};

export function MessageProvider() {
  const list = useSyncExternalStore(subscribe, getSnapshot);

  const handleDismiss = useCallback((id: number) => {
    const timer = timers.get(id);
    if (timer) {
      clearTimeout(timer);
    }
    startExit(id);
  }, []);

  if (list.length === 0) {
    return null;
  }

  return (
    <div className="message-container" aria-live="polite">
      {list.map((item) => (
        <div
          className={`message-toast message-${item.type}${item.exiting ? " message-exit" : ""}`}
          key={item.id}
          role="status"
          onClick={() => handleDismiss(item.id)}
        >
          {item.text}
        </div>
      ))}
    </div>
  );
}
