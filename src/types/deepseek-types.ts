// DeepSeek Service 相关类型定义
// 对齐 docs/01_contracts/persona_prompt_spec.md v1.0 + docs/03_execution/phaseb_execution_plan.md §2.4 / §2.13

import type { ImportResult } from "../services/WorkoutService";
import type { ChatMessageRecord } from "../services/chat-history-store";

// ---------------------------------------------------------------------------
// Chat message (DeepSeek API 层使用)
// ---------------------------------------------------------------------------

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

// ---------------------------------------------------------------------------
// MorningContext — 对齐 spec §3.1 示例结构
// ---------------------------------------------------------------------------

export interface MorningContext {
  currentDate: string;
  dayOfWeek: string;
  sleepReport: string;
  todos: { title: string; completed: boolean }[];
  researchLog: { title: string; summary: string } | null;
  workoutSummary: WorkoutSummaryForPrompt | null;
  bodyPartRecency: BodyPartRecencyItem[];
}

/** spec §3.1 workoutSummary 简化结构（仅 prompt 端需要的字段） */
export interface WorkoutSummaryForPrompt {
  date: string;
  bodyPart: string;
  topSetWeight: number;
  topSetReps: number;
  avgRPE: number;
}

export interface BodyPartRecencyItem {
  bodyPart: string;
  daysSince: number;
}

// ---------------------------------------------------------------------------
// generateFeedHighlight — 集成层预打包的高光摘要
// ---------------------------------------------------------------------------

/** 由集成层根据 §3.4 调用判断条件预先打包，本卡仅定义类型 */
export interface HighlightSummary {
  /** 本次投喂包含的部位列表 */
  bodyParts: string[];
  /** 其中 daysSince ≥ 7 的久未练部位 */
  longAbsentParts: string[];
  /** 本次投喂新增 session 数 */
  sessionsAdded: number;
}

// ---------------------------------------------------------------------------
// ChatMemoryResult — 对齐 docs/03_execution/phaseb_execution_plan.md §2.13
// ---------------------------------------------------------------------------

export interface ChatMemoryResult {
  recalled: ChatMessageRecord[];
  recentWindow: ChatMessageRecord[];
}

// ---------------------------------------------------------------------------
// DeepSeek API 请求/响应 raw 类型
// ---------------------------------------------------------------------------

export interface DeepSeekApiRequest {
  model: string;
  messages: ChatMessage[];
  temperature: number;
  max_tokens: number;
}

export interface DeepSeekApiResponse {
  choices: { message: { content: string } }[];
}

// ---------------------------------------------------------------------------
// Re-export for convenience
// ---------------------------------------------------------------------------

export type { ImportResult };
