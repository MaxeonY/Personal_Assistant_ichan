import type {
  FieldValidationState,
  FirstRunWizardInput,
  WizardConfigKey,
} from "../../../types/wizard-types";
import ConfigRow from "./ConfigRow";
import { configRows } from "./tokens";

type ConfigFormCardProps = {
  input: FirstRunWizardInput;
  validation: Record<WizardConfigKey, FieldValidationState>;
  visibleSecrets: Record<"notionToken" | "deepseekApiKey", boolean>;
  focusedField: WizardConfigKey | null;
  onChange: (key: WizardConfigKey, value: string) => void;
  onFocus: (key: WizardConfigKey) => void;
  onBlur: (key: WizardConfigKey) => void;
  onToggleVisible: (key: WizardConfigKey) => void;
};

export default function ConfigFormCard({
  input,
  validation,
  visibleSecrets,
  focusedField,
  onChange,
  onFocus,
  onBlur,
  onToggleVisible,
}: ConfigFormCardProps) {
  return (
    <section className="config-form-card" aria-label="首次启动配置">
      {configRows.map((row) => {
        const key = row.key;
        const visible =
          key === "notionToken" || key === "deepseekApiKey" ? visibleSecrets[key] : true;
        return (
          <ConfigRow
            key={key}
            fieldKey={key}
            label={row.label}
            helper={row.helper}
            placeholder={row.placeholder}
            sensitive={row.sensitive}
            value={input[key]}
            state={validation[key]}
            visible={visible}
            focused={focusedField === key}
            onChange={onChange}
            onFocus={onFocus}
            onBlur={onBlur}
            onToggleVisible={onToggleVisible}
          />
        );
      })}
    </section>
  );
}
