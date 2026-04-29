interface SendButtonProps {
  disabled: boolean;
  busy: boolean;
  onClick: () => void;
}

export default function SendButton({ disabled, busy, onClick }: SendButtonProps) {
  return (
    <button
      type="button"
      className={`dialog-send-button${busy ? " is-sending" : ""}`}
      aria-label="send"
      data-reveal-item="true"
      data-reveal-key="send-button"
      disabled={disabled}
      onClick={onClick}
    >
      <svg className="dialog-send-icon" viewBox="0 0 24 24" aria-hidden>
        <path
          d="M4 12.5L18.8 6.1C19.6 5.8 20.2 6.6 19.8 7.3L13.6 18.9C13.2 19.7 12 19.5 11.9 18.6L11.4 14.2L7 13.7C6.1 13.6 5.8 12.4 6.6 12L11.8 9.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.9"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}
