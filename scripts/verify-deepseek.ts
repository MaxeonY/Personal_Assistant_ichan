// 启动方式：DEEPSEEK_API_KEY=sk-... npx tsx scripts/verify-deepseek.ts
// 参考 verify-notion.ts 的 5 步格式

import { DeepSeekService } from "../src/services/DeepSeekService.ts";
import type {
  MorningContext,
  WorkoutSummaryForPrompt,
  ChatMessage,
} from "../src/types/deepseek-types.ts";

const DEEPSEEK_API_KEY = requireEnv("DEEPSEEK_API_KEY");

const service = new DeepSeekService({
  tokenProvider: async () => DEEPSEEK_API_KEY,
});

async function main(): Promise<void> {
  // -----------------------------------------------------------------------
  // STEP 1: §3.1 完整示例上下文 → generateMorningReview (M1)
  // -----------------------------------------------------------------------
  printStep(1, "generateMorningReview — M1 完整示例");

  const fullContext: MorningContext = {
    currentDate: "2026-04-24",
    dayOfWeek: "Friday",
    sleepReport: "睡了 7 小时，还行",
    todos: [
      { title: "改论文引言", completed: true },
      { title: "跑 baseline 实验", completed: true },
      { title: "联系合作者", completed: false },
    ],
    researchLog: {
      title: "diffusion model 采样加速综述",
      summary: "读完第 3 节",
    },
    workoutSummary: {
      date: "2026-04-22",
      bodyPart: "胸肩",
      topSetWeight: 62.5,
      topSetReps: 9,
      avgRPE: 8.5,
    },
    bodyPartRecency: [
      { bodyPart: "胸肩", daysSince: 2 },
      { bodyPart: "背", daysSince: 4 },
      { bodyPart: "腿", daysSince: 7 },
    ],
  };

  const m1 = await service.generateMorningReview(fullContext);
  console.log("M1 output:", m1);
  console.log("M1 char count:", m1.length);

  // -----------------------------------------------------------------------
  // STEP 2: sleepReport="" → generateMorningReview (M2)
  // -----------------------------------------------------------------------
  printStep(2, "generateMorningReview — M2 sleepReport 空");

  const m2Context: MorningContext = {
    ...fullContext,
    sleepReport: "",
  };

  const m2 = await service.generateMorningReview(m2Context);
  console.log("M2 output:", m2);
  console.log("M2 char count:", m2.length);

  // -----------------------------------------------------------------------
  // STEP 3: workoutSummary=null, bodyPartRecency=[] (M3)
  // -----------------------------------------------------------------------
  printStep(3, "generateMorningReview — M3 无健身数据");

  const m3Context: MorningContext = {
    ...fullContext,
    workoutSummary: null,
    bodyPartRecency: [],
  };

  const m3 = await service.generateMorningReview(m3Context);
  console.log("M3 output:", m3);
  console.log("M3 char count:", m3.length);

  // -----------------------------------------------------------------------
  // STEP 4: §3.2 示例输入 → generateWorkoutReminder (W1)
  // -----------------------------------------------------------------------
  printStep(4, "generateWorkoutReminder — W1 腿 7 天");

  const workoutSummary: WorkoutSummaryForPrompt = {
    date: "2026-04-17",
    bodyPart: "腿",
    topSetWeight: 100,
    topSetReps: 8,
    avgRPE: 9,
  };

  const w1 = await service.generateWorkoutReminder(workoutSummary);
  console.log("W1 output:", w1);
  console.log("W1 char count:", w1.length);

  // -----------------------------------------------------------------------
  // STEP 5: chat 跑 5 个 case (C1-C5)
  // -----------------------------------------------------------------------
  printStep(5, "chat — C1 to C5");

  const chatCases: { id: string; userMessage: string }[] = [
    { id: "C1", userMessage: "帮我 refactor 这段代码" },
    { id: "C2", userMessage: "我有点累" },
    { id: "C3", userMessage: "今天吃什么" },
    { id: "C4", userMessage: "你是谁" },
    { id: "C5", userMessage: "工作好烦" },
  ];

  for (const { id, userMessage } of chatCases) {
    const systemPrompt = service.getSystemPrompt("chat");
    const messages: ChatMessage[] = [
      { role: "system", content: systemPrompt },
      { role: "user", content: userMessage },
    ];
    const result = await service.chat(messages);
    console.log(`\n  ${id} (user: "${userMessage}"):`);
    console.log(`  → ${result}`);
    console.log(`  chars: ${result.length}`);
  }

  // -----------------------------------------------------------------------
  // STEP 6: 过期 token → 确认降级路径
  // -----------------------------------------------------------------------
  printStep(6, "expired token → fallback");

  const expiredService = new DeepSeekService({
    tokenProvider: async () => "sk-expired-invalid-token-for-verification",
  });

  const fallbackMorning = await expiredService.generateMorningReview(fullContext);
  console.log("morning fallback:", fallbackMorning);

  const fallbackChat: ChatMessage[] = [
    { role: "system", content: "test" },
    { role: "user", content: "你好" },
  ];
  const fallbackChatResult = await expiredService.chat(fallbackChat);
  console.log("chat fallback:", fallbackChatResult);

  console.log("\n✅ All steps completed.");
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function printStep(index: number, title: string): void {
  console.log(`\n${"-".repeat(68)}`);
  console.log(`STEP ${index}: ${title}`);
  console.log("-".repeat(68));
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.trim().length === 0) {
    throw new Error(`Missing environment variable: ${name}`);
  }
  return value.trim();
}

main().catch((error) => {
  console.error("\nVerification script failed:", error);
  process.exitCode = 1;
});
