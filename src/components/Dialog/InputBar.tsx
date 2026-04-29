import { forwardRef } from "react";
import type { ChangeEvent, KeyboardEvent } from "react";
import SendButton from "./SendButton";

interface InputBarProps {
  value: string;
  busy: boolean;
  canSend: boolean;
  onChange: (nextValue: string) => void;
  onSend: () => void;
  onEmojiClick: () => void;
}

function onTextareaKeyDown(event: KeyboardEvent<HTMLTextAreaElement>, onSend: () => void): void {
  if (event.key !== "Enter") {
    return;
  }
  event.preventDefault();
  onSend();
}

function onTextareaChange(event: ChangeEvent<HTMLTextAreaElement>, onChange: (nextValue: string) => void): void {
  onChange(event.target.value.replace(/[\r\n]+/g, " "));
}

const InputBar = forwardRef<HTMLTextAreaElement, InputBarProps>(function InputBar(
  { value, busy, canSend, onChange, onSend, onEmojiClick },
  ref,
) {
  const isDisabled = !canSend || busy;

  return (
    <div className="dialog-input-bar reveal-item" data-reveal-item="true" data-reveal-key="input-bar">
      <textarea
        ref={ref}
        rows={1}
        className="dialog-input"
        placeholder={"\u8f93\u5165\u6d88\u606f..."}
        value={value}
        onChange={(event) => onTextareaChange(event, onChange)}
        onKeyDown={(event) => onTextareaKeyDown(event, onSend)}
      />
      <button
        type="button"
        className="dialog-emoji-button"
        aria-label="emoji"
        data-reveal-item="true"
        data-reveal-key="emoji-button"
        onClick={onEmojiClick}
      >
        <svg className="dialog-emoji-icon" viewBox="0 0 24 24" aria-hidden>
          <circle cx="12" cy="12" r="8.4" fill="none" stroke="currentColor" strokeWidth="1.6" />
          <circle cx="9.3" cy="10.1" r="1" fill="currentColor" />
          <circle cx="14.7" cy="10.1" r="1" fill="currentColor" />
          <path
            d="M8.7 14.2C9.5 15.5 10.7 16.2 12 16.2C13.3 16.2 14.5 15.5 15.3 14.2"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
          />
        </svg>
      </button>
      <SendButton disabled={isDisabled} busy={busy} onClick={onSend} />
    </div>
  );
});

export default InputBar;
