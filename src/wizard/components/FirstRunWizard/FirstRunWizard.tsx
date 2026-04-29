import { useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type {
  FieldValidationState,
  FirstRunWizardInput,
  ValidationResult,
  WizardConfigKey,
} from "../../../types/wizard-types";
import { FirstRunWizardService } from "../../../services/FirstRunWizardService";
import ConfigFormCard from "./ConfigFormCard";
import HintBar from "./HintBar";
import WizardStepper from "./WizardStepper";
import mascotFrame from "../../../assets/idle/awake/idle_awake_float_01.png";

const initialInput: FirstRunWizardInput = {
  notionToken: "",
  todoDbId: "",
  researchDbId: "",
  deepseekApiKey: "",
};

const initialValidation: Record<WizardConfigKey, FieldValidationState> = {
  notionToken: "empty",
  todoDbId: "empty",
  researchDbId: "empty",
  deepseekApiKey: "empty",
};

const fieldKeys: WizardConfigKey[] = [
  "notionToken",
  "todoDbId",
  "researchDbId",
  "deepseekApiKey",
];

function validationFromResults(results: ValidationResult[]) {
  const nextValidation = { ...initialValidation };
  for (const result of results) {
    nextValidation[result.field] = result.ok ? "valid" : "invalid";
  }
  return nextValidation;
}

function firstErrorMessage(results: ValidationResult[]) {
  const failed = results.find((result) => !result.ok);
  return (
    failed?.detail ??
    "请检查标记为无效的配置项，修正后再次点击测试连接。"
  );
}

export default function FirstRunWizard() {
  const [input, setInput] = useState<FirstRunWizardInput>(initialInput);
  const [validation, setValidation] = useState(initialValidation);
  const [visibleSecrets, setVisibleSecrets] = useState({
    notionToken: false,
    deepseekApiKey: false,
  });
  const [focusedField, setFocusedField] = useState<WizardConfigKey | null>(null);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [hintMessage, setHintMessage] = useState(
    "点击“测试连接”将验证以上配置是否正确。所有信息将安全保存，仅用于 i酱 的功能服务。",
  );

  const canTest = useMemo(
    () => fieldKeys.every((key) => input[key].trim().length > 0),
    [input],
  );
  const canFinish = fieldKeys.every((key) => validation[key] === "valid") && !saving;
  const currentStep = canFinish ? "done" : testing ? "test" : "config";

  function handleChange(key: WizardConfigKey, value: string) {
    setInput((current) => ({ ...current, [key]: value }));
    setValidation((current) => ({ ...current, [key]: "empty" }));
  }

  function handleToggleVisible(key: WizardConfigKey) {
    if (key !== "notionToken" && key !== "deepseekApiKey") return;
    setVisibleSecrets((current) => ({ ...current, [key]: !current[key] }));
  }

  async function handleTestConnection() {
    if (!canTest || testing) return;

    setTesting(true);
    setHintMessage("正在验证配置，请稍候。");
    setValidation({
      notionToken: "pending",
      todoDbId: "pending",
      researchDbId: "pending",
      deepseekApiKey: "pending",
    });

    try {
      const results = await FirstRunWizardService.validateAll(input);
      setValidation(validationFromResults(results));
      const allValid = fieldKeys.every((key) =>
        results.some((result) => result.field === key && result.ok),
      );
      setHintMessage(
        allValid
          ? "配置校验通过。点击完成后，i酱 将保存配置并进入主窗口。"
          : firstErrorMessage(results),
      );
    } catch {
      setValidation(initialValidation);
      setHintMessage("连接测试失败，请检查网络后重试。");
    } finally {
      setTesting(false);
    }
  }

  async function handleFinish() {
    if (!canFinish || saving) return;
    setSaving(true);
    setHintMessage("正在保存配置。");
    try {
      await FirstRunWizardService.saveAndComplete(input);
      await invoke("first_run_complete");
    } catch {
      setHintMessage("保存失败，请确认配置校验通过后重试。");
      setSaving(false);
    }
  }

  async function handleClose() {
    await invoke("first_run_close_wizard");
  }

  async function handleMinimize() {
    await getCurrentWindow().minimize();
  }

  async function handleToggleMaximize() {
    await getCurrentWindow().toggleMaximize();
  }

  return (
    <main className="first-run-root">
      <div className="first-run-page" />
      <section className="first-run-window" data-tauri-drag-region>
        <div className="window-controls">
          <button type="button" onClick={handleMinimize} aria-label="最小化" title="最小化">
            <span className="control-min" />
          </button>
          <button
            type="button"
            onClick={handleToggleMaximize}
            aria-label="最大化或还原"
            title="最大化或还原"
          >
            <span className="control-max" />
          </button>
          <button type="button" onClick={handleClose} aria-label="关闭" title="关闭">
            <span className="control-close" />
          </button>
        </div>

        <header className="wizard-header">
          <img className="pet-mascot" src={mascotFrame} alt="i酱" draggable={false} />
          <div className="title-block">
            <h1>欢迎使用 i酱！</h1>
            <p>让我们一起完成首次配置，开启高效陪伴之旅吧！</p>
          </div>
        </header>

        <WizardStepper currentStep={currentStep} />

        <ConfigFormCard
          input={input}
          validation={validation}
          visibleSecrets={visibleSecrets}
          focusedField={focusedField}
          onChange={handleChange}
          onFocus={setFocusedField}
          onBlur={() => setFocusedField(null)}
          onToggleVisible={handleToggleVisible}
        />

        <HintBar
          testing={testing}
          canTest={canTest}
          message={hintMessage}
          onTest={handleTestConnection}
        />

        <button
          type="button"
          className="primary-action-button"
          disabled={!canFinish}
          onClick={handleFinish}
        >
          {saving ? "保存中" : "完成，进入 i酱！"}
        </button>
      </section>
    </main>
  );
}
