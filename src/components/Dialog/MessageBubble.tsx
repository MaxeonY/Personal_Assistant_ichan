import type { ChatBubbleViewModel } from "./dialog-types";

interface MessageBubbleProps {
  message: ChatBubbleViewModel;
  faded: boolean;
}

function speakerLabel(role: ChatBubbleViewModel["role"]): string {
  return role === "ichan" ? "i\u9171" : "\u4f60";
}

export default function MessageBubble({ message, faded }: MessageBubbleProps) {
  return (
    <article
      className={[
        "dialog-message-bubble",
        "reveal-item",
        message.role === "ichan" ? "is-ichan" : "is-user",
        faded ? "is-faded" : "",
        message.status === "failed" ? "is-failed" : "",
      ].filter(Boolean).join(" ")}
      data-reveal-item="true"
      data-reveal-key={`message-${message.id}`}
    >
      <header className="dialog-message-meta">
        <span className="dialog-message-speaker">{speakerLabel(message.role)}</span>
        <span className="dialog-message-time">{message.displayTime}</span>
      </header>
      <div className="dialog-message-body">{message.content}</div>
    </article>
  );
}
