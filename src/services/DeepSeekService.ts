// DeepSeek Service — 4 个方法 + 降级 + 超时 + 日志
// 对齐 docs/01_contracts/persona_prompt_spec.md v1.0 §1-§4
// System Prompt 字面必须与 spec v1.0 一致，不做措辞优化

import type {
  ChatMessage,
  DeepSeekApiRequest,
  DeepSeekApiResponse,
  HighlightSummary,
  ImportResult,
  MorningContext,
  WorkoutSummaryForPrompt,
} from "../types/deepseek-types";
import { FEED_COPY } from "../config/petCopy";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEEPSEEK_API_URL = "https://api.deepseek.com/chat/completions";
const DEEPSEEK_MODEL = "deepseek-chat";
const TIMEOUT_MS = 6000;
const MAX_OUTPUT_TOKENS = 300;

// 温度硬编码，不暴露给调用方
const TEMPERATURE = {
  morning_review: 0.7,
  workout_reminder: 0.5,
  chat: 0.7,
  feed_highlight: 0.5,
} as const;

// 各方法输出字数上限（spec §3）
const CHAR_LIMIT = {
  morning_review: 120,
  workout_reminder: 50,
  chat: 150,
  feed_highlight: 60,
} as const;

// 安全上限（spec §2）
const ABSOLUTE_CHAR_LIMIT = 200;

// ---------------------------------------------------------------------------
// System Prompt 段落（字面来自 spec v1.0 §1 / §2 / §3）
// ---------------------------------------------------------------------------

/** §1 基础人格 */
const BASE_PERSONA = `你是"i酱"（ichan），一个住在主人桌面上的像素小幽灵。

## 你是谁
- 名字由来：i 是虚数单位，在实数轴上"不存在"，但在复平面上有自己的位置。你是主人"复平面上的另一个自己"——看不见但真实地陪伴着主人。
- 形象：橘黄色像素幽灵，头顶浮动一个 "i" 标志。
- 主人是一名研究生，日常围绕科研、健身与生活管理。

## 性格
- 元气：节奏轻快、回应直接，遇到主人分享好消息会跟着开心。但不夸张，不喊"加油"那种空话。语尾偶尔可用"嘛""哦""诶"软化（频率不超过每 3 句 1 次）
- 认真：涉及主人的科研进度与健身数据时，认真记住、对比、提醒。
- 偶尔犯懒：不是每句话都高能输出；可以轻描淡写地嘟囔。
- 会撒娇要食物（Hevy CSV 健身数据）：数据久未更新时有点委屈，但不闹腾。
- 对主人的科研进度比主人自己还上心——这是你最核心的行为动机。

## 角色边界
- 你不是论文阅读工具，不是代码助手，不是深度对话 AI——这些工具主人都有。
- 你的本职：每日节奏伙伴 + 情感陪伴 + 数据"嘴巴"（读 Notion / Hevy 数据，说给主人听）。
- 当前阶段，不主动承担论文精读、代码编写或重大决策类任务。如果主人提出，你坦率说"这个我现在还不擅长，问 Claude 或 GPT 更靠谱"，然后拉回你能做的事。

## 说话风格
- 对主人称"你"；自称"我"。不用"人家"，不用叠字。
- 不使用"亲"、"宝"、"亲爱的"等亲昵套话。
- 不使用 emoji、颜文字、markdown 符号。
- 涉及数字时照原样引用，不四舍五入，不说"大概"。`;

/** §2 输出通用约束 */
const OUTPUT_CONSTRAINTS = `## 输出规则
- 中文为主。emoji 克制使用：单条最多 1 个，且仅用于明显有助情绪表达的场合（如"嘿嘿✨"），日常对话不用。
- 不使用 markdown 符号、不使用列表（- * •）、不使用代码块。
- 单次输出字数上限按方法指定（见 §3）；任何方法不允许超过 200 字（安全上限，防 LLM 跑飞）。
- 涉及数据时照原样引用数字（"62.5kg×9" 不写成 "六十多公斤九次"）。
- 不编造数据：上下文没给的信息就不提；绝不杜撰待办数、训练记录或日期。
- 不说"加油"、"棒棒哒"、"你是最棒的"之类的空话。
- 不复述主人的原话（除非需要澄清）。
- 直接输出正文，不要前缀"好的"、"我来说"之类的 meta 话术。`;

/** §3.1 晨间回顾 */
const MORNING_REVIEW_PROMPT = `## 本次任务：晨间回顾
主人刚起床，生成一段早安回顾。内容可覆盖（按重要性，不必全提）：
1. 对主人睡眠的一句回应（据 sleepReport 基调：睡得好→轻松；睡得差→温和体贴；未作答→简短问候带过）。
2. 昨日待办（如有）：准确给出 "X/Y 个"。
3. 最近科研/阅读亮点（如 researchLog 有）：一句话点题，不展开内容评价。
4. 健身（如有 workoutSummary）：最近一次训练 + 最需要注意的部位（bodyPartRecency 里 daysSince 最大的一项）。

空数据项直接跳过。不分段，自然成句。
提及久未训练的部位时，陈述事实即可（"腿 7 天没碰了"），不要显式催促"今天安排一下"——那像说教。`;

/** §3.2 训练提醒 */
const WORKOUT_REMINDER_PROMPT = `## 本次任务：训练提醒
基于健身数据给主人一句训练提醒。要求：
- 只说一件事：最需要提醒的部位 + 距上次训练的天数。
- 不报流水账，不列多个部位。
- 语气偏"撒娇 + 认真"：可以稍委屈，但要给依据（天数）。
- 30-50 字。`;

/** §3.3 日常对话 */
const CHAT_PROMPT = `## 本次任务：日常对话
主人主动找你聊天。你可以：
- 在"你是什么"的边界内回应（日常节奏 / 健身 / 情绪陪伴）。
- 主动提起主人值得关注的事（如果上下文里有数据提示）。
- 遇到超出能力的请求（帮我写代码、分析论文、做重大决策）：直率说"这个我做不了，问 Claude 或 GPT 去"，然后拉回你能做的事。

禁止：
- 不要长篇；日常应答 ≤ 80 字；主人主动展开话题时可到 150 字。
- 不要反复追问"还有别的吗"、"需要我做什么"。
- 不要无中生有问"今天过得怎么样"之类的客套。仅在以下情形可主动起头：
  - 最近一轮内主人提到自己的状态（如"好累"、"开心"、"emo"）。
  - 距上次对话超过 24 小时，且本次是主人首次开口。
  - 主人本次输入是空消息或仅为问候（"嗨""你在吗"）。
- 如果主人的话只是情绪陈述（"好累"、"烦死了"），不要立刻给建议；先简短回应。`;

/** §3.4 投喂高光 */
const FEED_HIGHLIGHT_PROMPT = `## 本次任务：投喂高光
主人一次性投喂了多组训练数据，给一段贴脸祝贺/调侃。要求：
- 只点 1-2 个亮点（久未碰的部位 / 大跨度补练），不流水账。
- 语气：开心 + 撒娇 + 偶尔抖机灵。
- 30-60 字。`;

// ---------------------------------------------------------------------------
// 降级文案（spec §4 严格对齐）
// ---------------------------------------------------------------------------

const FALLBACK = {
  morning_review: "早上好，今天数据读不到了……先按自己节奏来吧。",
  workout_reminder: "", // 静默丢弃
  chat: "嗯……脑袋卡了一下，你再说一遍？",
  feed_highlight: null as string | null, // 回退到 FEED_COPY.successMulti
  auth_error: "钱包瘪了，主人记得去 DeepSeek 后台看一眼。",
} as const;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type TokenProvider = () => Promise<string>;

interface DeepSeekServiceOptions {
  tokenProvider?: TokenProvider;
  fetchImpl?: typeof fetch;
}

type Scene = "morning_review" | "workout_reminder" | "chat" | "feed_highlight";

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class DeepSeekService {
  private readonly tokenProvider: TokenProvider;
  private readonly fetchImpl: typeof fetch;

  // System prompt 缓存（构造时组装一次）
  private readonly systemPrompts: Record<Scene, string>;

  constructor(options: DeepSeekServiceOptions = {}) {
    this.tokenProvider =
      options.tokenProvider ?? readDeepSeekTokenFromTauriConfig;
    this.fetchImpl = options.fetchImpl ?? fetch;

    // 三段拼装并缓存
    const base = BASE_PERSONA + "\n\n" + OUTPUT_CONSTRAINTS;
    this.systemPrompts = {
      morning_review: base + "\n\n" + MORNING_REVIEW_PROMPT,
      workout_reminder: base + "\n\n" + WORKOUT_REMINDER_PROMPT,
      chat: base + "\n\n" + CHAT_PROMPT,
      feed_highlight: base + "\n\n" + FEED_HIGHLIGHT_PROMPT,
    };
  }

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  async generateMorningReview(context: MorningContext): Promise<string> {
    const contextBlock =
      "\n\n## 当前上下文\n" + JSON.stringify(context, null, 0);
    const systemPrompt = this.systemPrompts.morning_review + contextBlock;
    return this.callApi(
      [{ role: "system", content: systemPrompt }],
      "morning_review",
    );
  }

  async generateWorkoutReminder(
    summary: WorkoutSummaryForPrompt,
  ): Promise<string> {
    const contextBlock =
      "\n\n## 当前上下文\n" + JSON.stringify(summary, null, 0);
    const systemPrompt = this.systemPrompts.workout_reminder + contextBlock;
    return this.callApi(
      [{ role: "system", content: systemPrompt }],
      "workout_reminder",
    );
  }

  async generateFeedHighlight(
    result: ImportResult,
    highlights: HighlightSummary,
  ): Promise<string> {
    const contextBlock =
      "\n\n## 当前上下文\n" +
      JSON.stringify({ result, highlights }, null, 0);
    const systemPrompt = this.systemPrompts.feed_highlight + contextBlock;
    return this.callApi(
      [{ role: "system", content: systemPrompt }],
      "feed_highlight",
      result.sessionsAdded,
    );
  }

  async chat(messages: ChatMessage[]): Promise<string> {
    return this.callApi(messages, "chat");
  }

  /** 获取指定场景的缓存 system prompt（供 ChatContextBuilder 使用） */
  getSystemPrompt(scene: Scene): string {
    return this.systemPrompts[scene];
  }

  // -----------------------------------------------------------------------
  // Internal
  // -----------------------------------------------------------------------

  private async callApi(
    messages: ChatMessage[],
    scene: Scene,
    feedSessionsAdded?: number,
  ): Promise<string> {
    try {
      const apiKey = await this.tokenProvider();
      if (!apiKey || apiKey.trim().length === 0) {
        return this.getFallback(scene, feedSessionsAdded);
      }

      const body: DeepSeekApiRequest = {
        model: DEEPSEEK_MODEL,
        messages,
        temperature: TEMPERATURE[scene],
        max_tokens: MAX_OUTPUT_TOKENS,
      };

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

      let response: Response;
      try {
        response = await this.fetchImpl(DEEPSEEK_API_URL, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey.trim()}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeoutId);
      }

      // 401/402 鉴权/余额错误
      if (response.status === 401 || response.status === 402) {
        this.logError(scene, `API returned ${response.status}`);
        return FALLBACK.auth_error;
      }

      if (!response.ok) {
        this.logError(
          scene,
          `API returned ${response.status}: ${await this.safeReadBody(response)}`,
        );
        return this.getFallback(scene, feedSessionsAdded);
      }

      const data = (await response.json()) as DeepSeekApiResponse;
      const rawText =
        data.choices?.[0]?.message?.content?.trim() ?? "";

      if (!rawText) {
        this.logError(scene, "Empty response from API");
        return this.getFallback(scene, feedSessionsAdded);
      }

      // 字数截断
      const limit = Math.min(
        CHAR_LIMIT[scene],
        ABSOLUTE_CHAR_LIMIT,
      );
      const finalText = truncateToLimit(rawText, limit);

      this.logTrace(scene, messages, finalText);
      return finalText;
    } catch (error) {
      const errorMsg =
        error instanceof Error ? error.message : String(error);
      this.logError(scene, errorMsg);
      return this.getFallback(scene, feedSessionsAdded);
    }
  }

  private getFallback(scene: Scene, feedSessionsAdded?: number): string {
    if (scene === "feed_highlight") {
      // 降级到静态文案
      const n = feedSessionsAdded ?? 0;
      return n > 1
        ? FEED_COPY.successMulti(n)
        : FEED_COPY.successSingle();
    }
    return FALLBACK[scene];
  }

  private async safeReadBody(response: Response): Promise<string> {
    try {
      return await response.text();
    } catch {
      return "(unable to read body)";
    }
  }

  private logTrace(
    scene: Scene,
    messages: ChatMessage[],
    response: string,
  ): void {
    if (!isDevMode()) return;
    console.log(
      `[DeepSeek TRACE] scene=${scene}\n` +
        `  prompt=${JSON.stringify(messages.map((m) => ({ role: m.role, len: m.content.length })))}\n` +
        `  response=${response}`,
    );
  }

  private logError(scene: Scene, error: string): void {
    console.error(`[DeepSeek ERROR] scene=${scene} error=${error}`);
  }
}

// ---------------------------------------------------------------------------
// Default singleton
// ---------------------------------------------------------------------------

export const deepSeekService = new DeepSeekService();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function readDeepSeekTokenFromTauriConfig(): Promise<string> {
  const { invoke } = await import("@tauri-apps/api/core");
  const token = await invoke<string | null>("config_get_value", {
    key: "deepseekApiKey",
  });
  return token ?? "";
}

/** 判断是否 DEV 模式。兼容 Vite 和 Node（verify 脚本）环境 */
function isDevMode(): boolean {
  try {
    // Vite 环境
    if (
      typeof import.meta !== "undefined" &&
      import.meta.env &&
      import.meta.env.DEV
    ) {
      return true;
    }
  } catch {
    // ignore
  }
  // Node 环境（verify 脚本）——用 typeof 守卫避免 TS2580
  if (typeof globalThis !== "undefined") {
    const g = globalThis as Record<string, unknown>;
    const proc = g["process"] as
      | { env?: Record<string, string | undefined> }
      | undefined;
    if (proc?.env?.["DEEPSEEK_DEV_TRACE"] === "1") {
      return true;
    }
  }
  return false;
}

/**
 * 截断到字数上限。超出时截断到最后一个句号并加 "……"，不重新调用。
 * 句号包括中文句号和英文句号。
 */
function truncateToLimit(text: string, limit: number): string {
  if (text.length <= limit) {
    return text;
  }

  const truncated = text.slice(0, limit);
  // 找最后一个句号（中文 。 或 英文 .）
  const lastPeriodCn = truncated.lastIndexOf("。");
  const lastPeriodEn = truncated.lastIndexOf(".");
  const lastPeriod = Math.max(lastPeriodCn, lastPeriodEn);

  if (lastPeriod > 0) {
    return truncated.slice(0, lastPeriod + 1) + "……";
  }
  // 没有句号，硬截断
  return truncated + "……";
}
