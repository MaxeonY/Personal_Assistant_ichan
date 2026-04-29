import { invoke } from "@tauri-apps/api/core";
import type {
  FirstRunWizardInput,
  FirstRunWizardService as FirstRunWizardServiceContract,
  SaveCompleteResult,
  SetupStatus,
  ValidationResult,
  WizardConfigKey,
} from "../types/wizard-types";

const REQUIRED_KEYS: WizardConfigKey[] = [
  "notionToken",
  "todoDbId",
  "researchDbId",
  "deepseekApiKey",
];

const CONFIG_VERSION = "1.0";
const CONTROL_CHAR_PATTERN = /[\u0000-\u001f\u007f]/;
const DASHED_UUID_PATTERN =
  /[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/g;
const HEX_32_PATTERN = /[0-9a-fA-F]{32}/g;

type HttpStatusResult = {
  status: number;
};

export function maskValue(value: string, visibleTail = 4): string {
  if (!value) return "";
  const tail = value.slice(-visibleTail);
  const maskLength = Math.max(8, value.length - visibleTail);
  return `${"•".repeat(maskLength)}${tail}`;
}

export function normalizeNotionDatabaseId(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new Error("invalid_format");
  }

  const source = getDatabaseIdCandidateSource(trimmed);
  const candidates = collectDatabaseIdCandidates(source);

  if (candidates.length !== 1) {
    throw new Error("invalid_format");
  }

  return candidates[0];
}

function getDatabaseIdCandidateSource(input: string): string {
  try {
    const url = new URL(input);
    return url.pathname;
  } catch {
    return input;
  }
}

function collectDatabaseIdCandidates(input: string): string[] {
  const candidates = new Set<string>();
  const dashedMatches = input.match(DASHED_UUID_PATTERN) ?? [];
  for (const match of dashedMatches) {
    candidates.add(match.replace(/-/g, "").toLowerCase());
  }

  const withoutDashedMatches = dashedMatches.reduce(
    (source, match) => source.replace(match, " "),
    input,
  );
  const hexMatches = withoutDashedMatches.match(HEX_32_PATTERN) ?? [];
  for (const match of hexMatches) {
    candidates.add(match.toLowerCase());
  }

  return [...candidates];
}

function hasValidSecretShape(value: string): boolean {
  const trimmed = value.trim();
  return trimmed.length >= 16 && !CONTROL_CHAR_PATTERN.test(trimmed);
}

function invalidResult(field: WizardConfigKey, detail: string): ValidationResult {
  return {
    field,
    ok: false,
    error: "invalid_format",
    detail,
  };
}

function mapNotionTokenStatus(status: number): ValidationResult {
  if (status === 200) {
    return { field: "notionToken", ok: true };
  }
  if (status === 401) {
    return {
      field: "notionToken",
      ok: false,
      error: "auth_failed",
      detail: "Notion Token 无效或未授权。",
    };
  }
  return {
    field: "notionToken",
    ok: false,
    error: "unknown",
    detail: "Notion Token 校验失败，请稍后重试。",
  };
}

function mapNotionDatabaseStatus(field: WizardConfigKey, status: number): ValidationResult {
  if (status === 200) {
    return { field, ok: true };
  }
  if (status === 404) {
    return {
      field,
      ok: false,
      error: "not_found",
      detail: "未找到该 Notion 数据库，请确认已授权集成访问。",
    };
  }
  if (status === 401) {
    return {
      field,
      ok: false,
      error: "auth_failed",
      detail: "Notion 授权已失效，请检查 Token。",
    };
  }
  return {
    field,
    ok: false,
    error: "unknown",
    detail: "Notion 数据库校验失败，请稍后重试。",
  };
}

function mapDeepSeekStatus(status: number): ValidationResult {
  if (status === 200) {
    return { field: "deepseekApiKey", ok: true };
  }
  if (status === 401) {
    return {
      field: "deepseekApiKey",
      ok: false,
      error: "auth_failed",
      detail: "DeepSeek API Key 无效。",
    };
  }
  if (status === 402) {
    return {
      field: "deepseekApiKey",
      ok: false,
      error: "auth_failed",
      detail: "余额不足",
    };
  }
  return {
    field: "deepseekApiKey",
    ok: false,
    error: "unknown",
    detail: "DeepSeek 校验失败，请稍后重试。",
  };
}

function networkResult(field: WizardConfigKey, detail: string): ValidationResult {
  return {
    field,
    ok: false,
    error: "network",
    detail,
  };
}

function sanitizeDiagnostic(error: unknown): string {
  return String(error ?? "")
    .replace(/(ntn_|secret_|sk-)[A-Za-z0-9_-]+/g, "$1***")
    .slice(0, 180);
}

function networkDetail(serviceName: "Notion" | "DeepSeek", error: unknown): string {
  const diagnostic = sanitizeDiagnostic(error);
  return diagnostic
    ? `无法连接 ${serviceName}，请检查网络后重试。诊断：${diagnostic}`
    : `无法连接 ${serviceName}，请检查网络后重试。`;
}

async function getConfigValue(key: string): Promise<string | null> {
  return invoke<string | null>("config_get_value", { key });
}

async function setConfigValue(key: string, value: string): Promise<void> {
  await invoke("config_set_value", { key, value });
}

async function checkNotionUser(notionToken: string): Promise<ValidationResult> {
  try {
    const response = await invoke<HttpStatusResult>("first_run_check_notion_user", {
      notionToken,
    });
    return mapNotionTokenStatus(response.status);
  } catch (error) {
    return networkResult("notionToken", networkDetail("Notion", error));
  }
}

async function checkNotionDatabase(
  field: "todoDbId" | "researchDbId",
  notionToken: string,
  databaseId: string,
): Promise<ValidationResult> {
  try {
    const response = await invoke<HttpStatusResult>("first_run_check_notion_database", {
      notionToken,
      databaseId,
    });
    return mapNotionDatabaseStatus(field, response.status);
  } catch (error) {
    return networkResult(field, networkDetail("Notion", error));
  }
}

async function checkDeepSeek(deepseekApiKey: string): Promise<ValidationResult> {
  try {
    const response = await invoke<HttpStatusResult>("first_run_check_deepseek", {
      deepseekApiKey,
    });
    return mapDeepSeekStatus(response.status);
  } catch (error) {
    return networkResult("deepseekApiKey", networkDetail("DeepSeek", error));
  }
}

export const FirstRunWizardService: FirstRunWizardServiceContract = {
  async checkSetupStatus(): Promise<SetupStatus> {
    const values = await Promise.all([
      getConfigValue("setup_completed"),
      getConfigValue("configVersion"),
      ...REQUIRED_KEYS.map((key) => getConfigValue(key)),
    ]);

    const setupCompleted = values[0];
    const configVersion = values[1];
    const configValues = values.slice(2);
    const missingKeys = REQUIRED_KEYS.filter((_, index) => !configValues[index]);

    return {
      completed: setupCompleted === "1",
      configVersion,
      missingKeys,
    };
  },

  async validateAll(input: FirstRunWizardInput): Promise<ValidationResult[]> {
    const notionToken = input.notionToken.trim();
    const deepseekApiKey = input.deepseekApiKey.trim();
    const results: ValidationResult[] = [];

    if (!hasValidSecretShape(notionToken)) {
      results.push(
        invalidResult("notionToken", "请输入有效的 Notion Integration Token。"),
      );
    }

    const deepseekFormatValid = hasValidSecretShape(deepseekApiKey);
    if (!deepseekFormatValid) {
      results.push(
        invalidResult("deepseekApiKey", "请输入有效的 DeepSeek API Key。"),
      );
    }

    if (results.some((result) => result.field === "notionToken")) {
      if (deepseekFormatValid) {
        results.push(await checkDeepSeek(deepseekApiKey));
      }
      return results;
    }

    const notionTokenResult = await checkNotionUser(notionToken);
    results.push(notionTokenResult);

    if (!notionTokenResult.ok) {
      if (deepseekFormatValid) {
        results.push(await checkDeepSeek(deepseekApiKey));
      }
      return results;
    }

    let todoDbId = "";
    let researchDbId = "";
    try {
      todoDbId = normalizeNotionDatabaseId(input.todoDbId);
    } catch {
      results.push(invalidResult("todoDbId", "请输入有效的 Todo 数据库 ID 或 Notion URL。"));
    }

    try {
      researchDbId = normalizeNotionDatabaseId(input.researchDbId);
    } catch {
      results.push(
        invalidResult("researchDbId", "请输入有效的 Research 数据库 ID 或 Notion URL。"),
      );
    }

    if (results.some((result) => result.error === "invalid_format" && result.field !== "deepseekApiKey")) {
      if (deepseekFormatValid) {
        results.push(await checkDeepSeek(deepseekApiKey));
      }
      return results;
    }

    results.push(await checkNotionDatabase("todoDbId", notionToken, todoDbId));
    results.push(await checkNotionDatabase("researchDbId", notionToken, researchDbId));

    if (deepseekFormatValid) {
      results.push(await checkDeepSeek(deepseekApiKey));
    }

    return results;
  },

  async saveAndComplete(input: FirstRunWizardInput): Promise<SaveCompleteResult> {
    const todoDbId = normalizeNotionDatabaseId(input.todoDbId);
    const researchDbId = normalizeNotionDatabaseId(input.researchDbId);

    await setConfigValue("notionToken", input.notionToken.trim());
    await setConfigValue("todoDbId", todoDbId);
    await setConfigValue("researchDbId", researchDbId);
    await setConfigValue("deepseekApiKey", input.deepseekApiKey.trim());
    await setConfigValue("configVersion", CONFIG_VERSION);
    await setConfigValue("setup_completed", "1");

    return {
      saved: true,
      configVersion: CONFIG_VERSION,
    };
  },
};
