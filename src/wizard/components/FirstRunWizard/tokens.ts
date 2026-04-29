export const wizardSteps = [
  { id: "config", index: 1, label: "配置集成" },
  { id: "test", index: 2, label: "功能测试" },
  { id: "done", index: 3, label: "完成" },
] as const;

export const configRows = [
  {
    key: "notionToken",
    label: "Notion Integration Token",
    helper: "(末四位明文)",
    placeholder: "secret_...",
    sensitive: true,
  },
  {
    key: "todoDbId",
    label: "Todo / Daily Plan 数据库 ID",
    helper: "数据库ID",
    placeholder: "Notion 数据库 URL 或 32 位 ID",
    sensitive: false,
  },
  {
    key: "researchDbId",
    label: "Research 数据库 ID",
    helper: "数据库ID",
    placeholder: "Notion 数据库 URL 或 32 位 ID",
    sensitive: false,
  },
  {
    key: "deepseekApiKey",
    label: "Deepseek API Key",
    helper: "",
    placeholder: "sk-...",
    sensitive: true,
  },
] as const;
