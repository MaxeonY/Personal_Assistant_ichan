// 启动方式：NOTION_TOKEN=xxx TODO_DB_ID=xxx RESEARCH_DB_ID=xxx npx tsx scripts/verify-notion.ts
import { NotionService } from "../src/services/notion-service.ts";
import { type DailyPlan, NotionServiceError } from "../src/types/notion-types.ts";

const NOTION_TOKEN = requireEnv("NOTION_TOKEN");
const TODO_DB_ID = requireEnv("TODO_DB_ID");
const RESEARCH_DB_ID = requireEnv("RESEARCH_DB_ID");

const service = new NotionService({
  tokenProvider: async () => NOTION_TOKEN,
});

async function main(): Promise<void> {
  printStep(1, "getYesterdayTodos");
  const yesterdayTodos = await service.getYesterdayTodos(TODO_DB_ID);
  console.table(yesterdayTodos);

  printStep(2, "getTodayTimedTodos");
  const timedTodos = await service.getTodayTimedTodos(TODO_DB_ID);
  console.table(timedTodos);

  printStep(3, "getLatestResearchLog");
  const latestResearch = await service.getLatestResearchLog(RESEARCH_DB_ID);
  console.log(latestResearch);

  printStep(4, "createDailyPlan");
  const now = new Date();
  const planDate = toLocalDateIso(now);
  const seed = now.toISOString();
  const plan: DailyPlan = {
    date: planDate,
    items: [
      { title: `verify step A (${seed})`, priority: "high" },
      { title: "verify step B", priority: "medium" },
    ],
    sleepNote: 8,
  };
  const pageId = await service.createDailyPlan(TODO_DB_ID, plan);
  console.log("created page id:", pageId);

  printStep(5, "invalid token => NotionServiceError.code");
  const invalidTokenService = new NotionService({
    tokenProvider: async () => "invalid-token-for-verification",
  });
  try {
    await invalidTokenService.getYesterdayTodos(TODO_DB_ID);
    console.log("unexpected: invalid token call did not fail");
  } catch (error) {
    if (error instanceof NotionServiceError) {
      console.log("caught NotionServiceError.code =", error.code);
    } else {
      console.error("unexpected non-NotionServiceError:", error);
    }
  }
}

function printStep(index: number, title: string): void {
  console.log(`\n${"-".repeat(68)}`);
  console.log(`STEP ${index}: ${title}`);
  console.log("-".repeat(68));
}

function requireEnv(name: "NOTION_TOKEN" | "TODO_DB_ID" | "RESEARCH_DB_ID"): string {
  const value = process.env[name];
  if (!value || value.trim().length === 0) {
    throw new Error(`Missing environment variable: ${name}`);
  }
  return value.trim();
}

function toLocalDateIso(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

main().catch((error) => {
  console.error("\nVerification script failed:", error);
  process.exitCode = 1;
});
