import type { ChangeEvent, FocusEvent } from "react";
import type { FieldValidationState, WizardConfigKey } from "../../../types/wizard-types";
import { maskValue } from "../../../services/FirstRunWizardService";

type ConfigRowProps = {
  fieldKey: WizardConfigKey;
  label: string;
  helper: string;
  placeholder: string;
  sensitive: boolean;
  value: string;
  state: FieldValidationState;
  visible: boolean;
  focused: boolean;
  onChange: (key: WizardConfigKey, value: string) => void;
  onFocus: (key: WizardConfigKey) => void;
  onBlur: (key: WizardConfigKey) => void;
  onToggleVisible: (key: WizardConfigKey) => void;
};

function statusContent(state: FieldValidationState) {
  if (state === "pending") {
    return (
      <>
        <span className="status-spinner" aria-hidden="true" />
        <span>验证中</span>
      </>
    );
  }

  if (state === "valid") {
    return (
      <>
        <span className="status-icon success" aria-hidden="true">
          <svg viewBox="0 0 16 16" role="img">
            <path d="M4 8.2 6.8 11 12.2 5.2" />
          </svg>
        </span>
        <span>有效</span>
      </>
    );
  }

  if (state === "invalid") {
    return (
      <>
        <span className="status-icon invalid" aria-hidden="true">
          <svg viewBox="0 0 16 16" role="img">
            <path d="M5 5 11 11M11 5 5 11" />
          </svg>
        </span>
        <span>无效</span>
      </>
    );
  }

  return null;
}

export default function ConfigRow({
  fieldKey,
  label,
  helper,
  placeholder,
  sensitive,
  value,
  state,
  visible,
  focused,
  onChange,
  onFocus,
  onBlur,
  onToggleVisible,
}: ConfigRowProps) {
  const displayValue = sensitive && !visible && !focused ? maskValue(value) : value;

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    onChange(fieldKey, event.target.value);
  }

  function handleFocus(_event: FocusEvent<HTMLInputElement>) {
    onFocus(fieldKey);
  }

  function handleBlur(_event: FocusEvent<HTMLInputElement>) {
    onBlur(fieldKey);
  }

  return (
    <div className="config-row">
      <div className="config-label">
        <div>{label}</div>
        {helper ? <span>{helper}</span> : null}
      </div>
      <div className="config-input-wrap">
        <input
          value={displayValue}
          placeholder={placeholder}
          onChange={handleChange}
          onFocus={handleFocus}
          onBlur={handleBlur}
          spellCheck={false}
          autoComplete="off"
          aria-label={label}
        />
        {sensitive ? (
          <button
            type="button"
            className="eye-button"
            onClick={() => onToggleVisible(fieldKey)}
            aria-label={visible ? "隐藏密钥" : "显示密钥"}
            title={visible ? "隐藏密钥" : "显示密钥"}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          </button>
        ) : null}
      </div>
      <div className={`config-status ${state}`}>{statusContent(state)}</div>
    </div>
  );
}
