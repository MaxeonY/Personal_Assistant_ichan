import type { MouseEvent, PointerEvent } from "react";
import type { TimedTodoWithDueAt } from "../../services/ReminderScheduler";
import "./ReminderBubble.css";

interface ReminderBubbleProps {
  reminder: TimedTodoWithDueAt;
  titleMaxChars: number;
  onDismiss: (event: MouseEvent<HTMLButtonElement>) => void;
}

function stopPropagation(event: PointerEvent<HTMLDivElement> | MouseEvent<HTMLDivElement>): void {
  event.stopPropagation();
}

function truncateTitle(title: string, maxChars: number): string {
  if (!Number.isInteger(maxChars) || maxChars <= 0 || title.length <= maxChars) {
    return title;
  }
  return `${title.slice(0, maxChars)}...`;
}

export default function ReminderBubble({
  reminder,
  titleMaxChars,
  onDismiss,
}: ReminderBubbleProps) {
  return (
    <div
      className="reminder-bubble"
      onPointerDown={stopPropagation}
      onPointerUp={stopPropagation}
      onClick={stopPropagation}
      role="status"
      aria-live="polite"
    >
      <div className="reminder-bubble__body">
        <div className="reminder-bubble__title" title={reminder.title}>
          {truncateTitle(reminder.title, titleMaxChars)}
        </div>
        <div className="reminder-bubble__subtitle">今天 {reminder.reminderTime}</div>
      </div>
      <button
        className="reminder-bubble__close"
        onClick={onDismiss}
        type="button"
        aria-label="关闭提醒"
      >
        ×
      </button>
    </div>
  );
}
