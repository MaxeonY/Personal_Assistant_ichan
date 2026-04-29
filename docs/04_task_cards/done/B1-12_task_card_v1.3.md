# B1-12 任务卡 · hungry 自动判定逻辑

**版本**: v1.3（Codex 可执行版，修复 v1.2 的 3 处阻断 + 5 处建议修订）
**日期**: 2026-04-28

**执行**: Codex
**对应任务**: 任务 12（hungry 自动判定逻辑）
**依赖**: B0-1（CSV 服务，已完成）

---

## 行号引用约定

本卡引用的所有行号为**参考定位**，基于 v1.2 起草时的代码快照。Codex 必须先用 `rg -n "<关键字>"` 确认实际位置后再编辑。行号偏差不视为任务卡错误。

---

## 0. 任务定位

i酱在距上次 CSV 投喂 N 天后自动进入 hungry 状态（overlay 飘"饿肚子"提示），用户拖入新 CSV 后自动解除。本卡负责"判定逻辑 + 触发 `hungry.set` 事件"的服务/集成层落地。

判定语义：**判定时刻今天日期** vs **`lastCsvImportDate`**，差值 ≥ 阈值则判定为 hungry。

---

## 1. 范围

### 1.1 范围内
- 实现纯函数 `decideHungry(input): HungryDecisionOutput`，无副作用、可单元测试。
- 建立 PetContextService 持久化通道（读写 `lastCsvImportDate`，复用现有 SQLite `config` 表）。
- 在 `petBehaviorConfig.ts` 新增 hungry 判定参数组。
- 在应用启动时（pet 主窗口 `machine.start()` **之后**，异步完成判定）执行一次判定。
- 判定结果通过 `dispatch({ type: 'hungry.set', value })` 写入状态机。
- DevPanel 展示当前 `lastCsvImportDate` 与判定阈值（只读）。

### 1.2 范围外
- **不**实现 CSV 拖拽接收（B1-2 任务范围）。
- **不**实现 `lastCsvImportDate` 的写入调用——写入由 B1-2 集成层在 CSV 导入成功后执行，本卡仅搭建通道。
- **不**新增 `MajorState`、不新增 `PetEvent`（`hungry.set` 已在 v1.2 合同定义，本卡仅补充实现）。
- 移除 `public setHungry()`（修复历史违约，与 `interface_v1_2.md` §4.4 / §6.42 对齐）；内部逻辑保留为 `private applyHungryFlag()`，不影响其他公共方法。
- **不**新增 hungry overlay 素材或 CSS（已落地）。
- **不**实现轮询机制。
- **不**实现"跨天唤醒重新判定"。

---

## 2. 接口与依赖

### 2.1 判定函数契约

```ts
interface HungryDecisionInput {
  lastCsvImportDate: string;  // YYYY-MM-DD；空字符串表示从未投喂
  nowDate: string;            // YYYY-MM-DD，本地时区
  thresholdDays: number;      // 来自 petBehaviorConfig.hungry.thresholdDays
}

interface HungryDecisionOutput {
  isHungry: boolean;
  daysSinceFeed: number;      // 从未投喂时为 Number.POSITIVE_INFINITY
}
```

### 2.2 状态机接口（锁定，来自 interface_v1_2.md §4）

- 翻转入口：`dispatch({ type: 'hungry.set', value: boolean })`
- 读取入口：`getState().flags.isHungry`

### 2.3 持久化键名

- `config` 表 key：`petcontext.lastCsvImportDate`
- 读写通过 `invoke("config_get_value", { key })` / `invoke("config_set_value", { key, value })`
- 既有调用模板（参数签名已锁定）：
  - `invoke<string | null>("config_get_value", { key: "deepseekApiKey" })` — DeepSeekService.ts:357
  - `invoke<string | null>("config_get_value", { key: "notionToken" })` — notion-service.ts:389
  - `await invoke("config_set_value", { key, value })` — FirstRunWizardService.ts:196

---

## 3. 参数回流

### 3.1 在 `behavior_config.md` 新增 §2.7 "Hungry 判定参数"

版本号升至 **v1.3 (2026-04-28)**。

在 §2.6（UI/Bubble/Toast）之后、§3（硬基线）之前插入：

| 参数名 | 含义 | 当前冻结值 | 推荐调节范围 | 调参风险提示 |
|---|---|---|---|---|
| `hungry.thresholdDays` | 距上次 CSV 投喂多少天后判定为 hungry | `3 天` | `2 ~ 7 天` | 过小会让用户高频被催投喂；过大会让 hungry overlay 几乎不出现，弱化健身追踪激励作用 |
| `hungry.evaluateOnStartup` | 启动时是否执行一次判定 | `true` | 仅 DEV 调试时可置为 `false` | 关闭后 hungry 状态需手动通过 DevPanel 翻转，正式版本必须保持 `true` |

> **注**：现有 `HUNGRY_COPY.enterCooldownMs`（`petCopy.ts:33`，饥饿提示再次播报的最小间隔，6h）与本卡新增的 `hungry.thresholdDays`（首次进入 hungry 的天数门槛）**语义不同**。前者控制"已经 hungry 后多久可以再弹一次提示"，后者控制"多少天没喂才判定为 hungry"。本卡**不修改** `HUNGRY_COPY` 命名空间。

### 3.2 在 `behavior_config.md` §3"硬基线"追加第 9 条

> 9. hungry 翻转必须通过 `dispatch({ type: 'hungry.set', value })`，不存在 `setHungry(...)` 公共方法；自动判定结果写入也走 dispatch 单入口。

### 3.3 在 `src/config/petBehaviorConfig.ts` 新增对应字段

在 `ui: {` 之前插入：

```ts
  hungry: {
    thresholdDays: 3,
    evaluateOnStartup: true,
  },
```

**类型注意事项**：`petBehaviorConfig` 以 `as const` 结尾。新增字段后该 `as const` 仍应在文件末尾，无需额外改动。TypeScript 类型 `PetBehaviorConfig` 由 `typeof petBehaviorConfig` 自动推导，自动包含新增字段。

---

## 4. 判定时机与触发点

### 4.1 启动判定

- 触发点：`machine.start()` **同步完成后立即**启动异步判定。
- 位置：`src/App.tsx` → `handlePlayerReady` callback，在 `machine.start(session)` **之后**。
- **关键架构约束**：`machine.start()` 必须同步执行（立即进入 idle.awake），hungry 判定通过 `dispatch({ type: 'hungry.set' })` **异步**翻转 flag。这样 match 用户感知"pet 立刻出现"，判定结果随后生效。
- 流程：
  1. 先同步执行 `machine.start({ isNewDay: false, lastExitClean: true })`（与当前行为一致）。
  2. 若 `petBehaviorConfig.hungry.evaluateOnStartup === false`，跳过判定，hungry 保持默认 `false`。
  3. 启动异步判定：
     - 调用 `PetContextService.getLastCsvImportDate()`。
     - 取本地日期字符串 `YYYY-MM-DD`（本地时区，非 UTC）。
     - `decideHungry({ lastCsvImportDate, nowDate, thresholdDays })`。
     - `machine.dispatch({ type: 'hungry.set', value: isHungry })`。
     - DEV 构建下打印日志。
  4. 异步判定中的异常不应阻断 pet 运行，catch 后仅 `console.error`。

### 4.2 Feed 事件后翻转（B1-2 负责，本卡不实现）

B1-2 集成层负责：CSV 导入成功 → `PetContextService.setLastCsvImportDate(today)` → `dispatch({ type: 'hungry.set', value: false })`。

---

## 5. 实施步骤（按 commit 拆分，逐条执行）

---

### Commit 0 — `fix:` dispatch hungry.set as single entry point

**目标**：修复 `setHungry()` 绕过 dispatch 的历史违约，重命名为 private helper。

**前置检查**（先执行，确认无遗漏）：
```bash
# 应在 src/ 下找到 3 处结果：
#   src/state/StateMachine.ts  public setHungry / 方法定义
#   src/state/StateMachine.ts  this.setHungry / handleUserFeed 内调用
#   src/App.tsx  machineRef.current.setHungry / DevPanel toggle 调用
# src-tauri/ 下应为 0 结果
rg -n "setHungry" src/ src-tauri/
```

**改动清单**：

**A. `src/components/Pet/types.ts`** — `PetEvent` 联合的最后一个 `|` 项之后（`movement.arrive` 行后，闭合 `;` 前）追加：
```ts
  | { type: 'hungry.set'; value: boolean };
```

**B. `src/state/StateMachine.ts`**：

1. 找到 `public setHungry(isHungry: boolean)` 方法（约第 165 行），重命名为 `private applyHungryFlag`：
```ts
  private applyHungryFlag(isHungry: boolean): void {
    this.state = {
      ...this.state,
      flags: {
        ...this.state.flags,
        isHungry,
      },
    };
    this.syncHungryEffect();
    this.emitStateChanged();
  }
```
  ⚠️ 注意：删除 `public`，改为 `private`；方法名改为 `applyHungryFlag`。

2. 在 `handleUserFeed()` 中（约 334 行），`this.setHungry(false)` → `this.applyHungryFlag(false)`。

3. 在 `handleEvent()` 的 `switch` 中，`default: return;` 之前，新增 `case 'hungry.set'`：
```ts
      case 'hungry.set':
        this.applyHungryFlag(event.value);
        return;
```

**C. `src/App.tsx`** — 找到 `handleDevToggleHungry` callback（约 1133 行）：
```ts
  const handleDevToggleHungry = useCallback(() => {
    const nextIsHungry = !machineRef.current.getSnapshot().state.flags.isHungry;
    dispatch({ type: 'hungry.set', value: nextIsHungry });
    if (IS_DEV_BUILD) {
      setDevSnapshot(machineRef.current.getSnapshot());
    }
  }, [dispatch]);
```
  ⚠️ `machineRef.current.setHungry(nextIsHungry)` 改为 `dispatch({ type: 'hungry.set', value: nextIsHungry })`。`setDevSnapshot` 订阅已自动刷新 snapshot，但此处显式刷新可保留（确保 DevPanel 即时反映）。

**Commit 0 验收**：
```bash
pnpm exec tsc --noEmit
# 必须通过，无类型错误
```
DEV 构建下手动验证：打开 DevPanel，Toggle isHungry 按钮点击后 overlay 切换行为与改前完全等价。

---

### Commit 1 — `docs:` add hungry behavior config params

**改动清单**：

**A. `docs/01_contracts/behavior_config.md`**：

1. 第 3 行版本号：`v1.2 - 2026-04-27` → `v1.3 - 2026-04-28`
2. 在 §2.6（UI/Bubble/Toast 参数表及补充说明）**之后**、§3（不应再动的硬基线）**之前**插入：
```markdown
### 2.7 Hungry 判定参数

| 参数名 | 含义 | 当前冻结值 | 推荐调节范围 | 调参风险提示 |
|---|---|---|---|---|
| `hungry.thresholdDays` | 距上次 CSV 投喂多少天后判定为 hungry | `3 天` | `2 ~ 7 天` | 过小会让用户高频被催投喂；过大会让 hungry overlay 几乎不出现，弱化健身追踪激励作用 |
| `hungry.evaluateOnStartup` | 启动时是否执行一次判定 | `true` | 仅 DEV 调试时可置为 `false` | 关闭后 hungry 状态需手动通过 DevPanel 翻转，正式版本必须保持 `true` |

> **注**：现有 `HUNGRY_COPY.enterCooldownMs`（`petCopy.ts`，饥饿提示再次播报的最小间隔，6h）与本卡新增的 `hungry.thresholdDays`（首次进入 hungry 的天数门槛）**语义不同**。前者控制"已经 hungry 后多久可以再弹一次提示"，后者控制"多少天没喂才判定为 hungry"。本卡**不修改** `HUNGRY_COPY` 命名空间。
```
3. 在 §3（硬基线）末尾，第 8 条之后追加：
```markdown
9. hungry 翻转必须通过 `dispatch({ type: 'hungry.set', value })`，不存在 `setHungry(...)` 公共方法；自动判定结果写入也走 dispatch 单入口。
```

**B. `src/config/petBehaviorConfig.ts`** — 在 `ui: {` 之前插入：
```ts
  hungry: {
    thresholdDays: 3,
    evaluateOnStartup: true,
  },
```

**Commit 1 验收**：
```bash
pnpm exec tsc --noEmit
```

---

### Commit 2 — `feat:` add PetContextService with lastCsvImportDate persistence

**改动清单**：

**A. 新建 `src/services/PetContextService.ts`**：

```ts
import { invoke } from "@tauri-apps/api/core";

/**
 * PetContext 持久化通道（过渡方案）。
 *
 * 当前使用 SQLite `config` 表（key-value 结构）存储 PetContext 字段。
 * 迁移触发条件（满足任一即启动迁移至独立 pet_context 表）：
 *   1. PetContext 字段数 ≥ 5 且跨领域使用（CSV/Notion/Chat）
 *   2. 单字段读写频率超过 1 次/分钟
 *   3. 需要事务性批量更新多个字段
 *
 * 详见任务卡 B1-12 §8.5。
 */

const KEY_LAST_CSV_IMPORT = "petcontext.lastCsvImportDate";

export const PetContextService = {
  async getLastCsvImportDate(): Promise<string | null> {
    try {
      return await invoke<string | null>("config_get_value", {
        key: KEY_LAST_CSV_IMPORT,
      });
    } catch {
      return null;
    }
  },

  async setLastCsvImportDate(date: string): Promise<void> {
    await invoke("config_set_value", {
      key: KEY_LAST_CSV_IMPORT,
      value: date,
    });
  },

  /**
   * 预留：从 config 表迁移至独立 pet_context 表。
   * TODO(B1-12): 实现迁移逻辑，当触发任一迁移条件时调用。
   */
  async migrateFromConfigTable(): Promise<void> {
    // Placeholder: 将 config 表中 petcontext.* 键迁移至独立表
  },
};
```

**Commit 2 验收**：
```bash
pnpm exec tsc --noEmit
```

---

### Commit 3 — `feat:` add HungryDecisionService + unit tests

**前置检查**（先执行）：
```bash
# 确认项目当前测试框架。若无则安装 vitest（Vite 项目标准选择）
rg '"jest"|"vitest"|"mocha"' package.json
```

若输出为空 → 执行 `pnpm add -D vitest`，并在 `package.json` 的 `"scripts"` 中追加 `"test": "vitest run"`。
若已有测试框架 → 遵循现有框架，不额外安装。

**改动清单**：

**A. 新建 `src/services/HungryDecisionService.ts`**：

```ts
export interface HungryDecisionInput {
  lastCsvImportDate: string;
  nowDate: string;
  thresholdDays: number;
}

export interface HungryDecisionOutput {
  isHungry: boolean;
  daysSinceFeed: number;
}

/**
 * 判定宠物是否处于 hungry 状态。
 *
 * 边界处理：
 * - 空字符串 → 从未投喂：`isHungry: true, daysSinceFeed: POSITIVE_INFINITY`
 * - 非法日期格式（如 'invalid'、'2026-13-45'）→ 视为从未投喂
 * - 未来日期（`daysSinceFeed < 0`）→ 视为同日投喂：`isHungry: false, daysSinceFeed: 0`
 * - 阈值边界：`daysSinceFeed >= thresholdDays` 时判定为 hungry
 */
export function decideHungry(input: HungryDecisionInput): HungryDecisionOutput {
  const { lastCsvImportDate, nowDate, thresholdDays } = input;

  if (!lastCsvImportDate || lastCsvImportDate.trim() === "") {
    return { isHungry: true, daysSinceFeed: Number.POSITIVE_INFINITY };
  }

  const lastDate = parseLocalDate(lastCsvImportDate);
  const now = parseLocalDate(nowDate);

  if (lastDate === null || now === null) {
    return { isHungry: true, daysSinceFeed: Number.POSITIVE_INFINITY };
  }

  const diffMs = now.getTime() - lastDate.getTime();
  const daysSinceFeed = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (daysSinceFeed < 0) {
    return { isHungry: false, daysSinceFeed: 0 };
  }

  return {
    isHungry: daysSinceFeed >= thresholdDays,
    daysSinceFeed,
  };
}

/** 解析 YYYY-MM-DD 字符串为本地日期对象；非法格式返回 null */
function parseLocalDate(dateStr: string): Date | null {
  const match = /^\d{4}-\d{2}-\d{2}$/.test(dateStr);
  if (!match) {
    return null;
  }

  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(y, m - 1, d);

  if (
    date.getFullYear() !== y ||
    date.getMonth() !== m - 1 ||
    date.getDate() !== d
  ) {
    return null;
  }

  return date;
}
```

**B. 新建 `src/services/__tests__/HungryDecisionService.test.ts`**：

```ts
import { describe, it, expect } from "vitest";
import { decideHungry } from "../HungryDecisionService";

const today = "2026-04-28";
const threshold = 3;

function input(lastCsvImportDate: string) {
  return { lastCsvImportDate, nowDate: today, thresholdDays: threshold };
}

describe("decideHungry", () => {
  it("returns hungry when lastCsvImportDate is empty", () => {
    const result = decideHungry(input(""));
    expect(result.isHungry).toBe(true);
    expect(result.daysSinceFeed).toBe(Number.POSITIVE_INFINITY);
  });

  it("returns not hungry when fed today", () => {
    const result = decideHungry(input("2026-04-28"));
    expect(result.isHungry).toBe(false);
    expect(result.daysSinceFeed).toBe(0);
  });

  it("returns not hungry at threshold -1 (2 days)", () => {
    const result = decideHungry(input("2026-04-26"));
    expect(result.isHungry).toBe(false);
    expect(result.daysSinceFeed).toBe(2);
  });

  it("returns hungry at exact threshold (3 days)", () => {
    const result = decideHungry(input("2026-04-25"));
    expect(result.isHungry).toBe(true);
    expect(result.daysSinceFeed).toBe(3);
  });

  it("returns hungry at threshold +1 (4 days)", () => {
    const result = decideHungry(input("2026-04-24"));
    expect(result.isHungry).toBe(true);
    expect(result.daysSinceFeed).toBe(4);
  });

  it("returns not hungry for future date (system clock error)", () => {
    const result = decideHungry(input("2026-05-10"));
    expect(result.isHungry).toBe(false);
    expect(result.daysSinceFeed).toBe(0);
  });

  it("returns hungry for invalid date formats", () => {
    const r1 = decideHungry(input("invalid"));
    expect(r1.isHungry).toBe(true);
    expect(r1.daysSinceFeed).toBe(Number.POSITIVE_INFINITY);

    const r2 = decideHungry(input("2026-13-45"));
    expect(r2.isHungry).toBe(true);
    expect(r2.daysSinceFeed).toBe(Number.POSITIVE_INFINITY);
  });
});
```

**Commit 3 验收**：
```bash
pnpm test                            # 7 组用例全部通过
pnpm exec tsc --noEmit               # 无类型错误
```

---

### Commit 4 — `feat:` wire hungry async decision after startup + DevPanel observation

**架构关键**：`machine.start()` 必须在同步路径上立即执行。hungry 判定是异步补充动作，通过 `dispatch({ type: 'hungry.set' })` 事后翻转 flag。

**改动清单**：

**A. `src/App.tsx`** — 新增 imports（在文件顶部现有 imports 之后追加）：
```ts
import { PetContextService } from "./services/PetContextService";
import { decideHungry } from "./services/HungryDecisionService";
```
注意：`petBehaviorConfig` 已导入（约第 35 行），无需重复。

**B. `src/App.tsx`** — 新增工具函数（在文件顶部常量区之后、组件函数之前，约第 100 行附近，与其他常量并列）：
```ts
function formatLocalDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
```

**C. `src/App.tsx`** — 新增 DevPanel 数据 state（约第 299 行，与其他 `useState` 并列）：
```ts
  const [devHungryInfo, setDevHungryInfo] = useState<{
    lastCsvImportDate: string | null;
    daysSinceFeed: number;
  } | null>(null);
```

**D. `src/App.tsx`** — 在 `handlePlayerReady` callback 中注入判定逻辑。

找到 `// TODO(Phase B): Load real values from SQLite PetContext.` 注释行（约 852 行）及其下方的 `machine.start({...})` 调用块。

**保持 `machine.start()` 在同步路径**。在其**之后**追加异步判定：

```ts
      machine.start({
        isNewDay: false,
        lastExitClean: true,
      });
      if (IS_DEV_BUILD) {
        setDevSnapshot(machine.getSnapshot());
      }
      previousMajorRef.current = machine.getSnapshot().state.major;

      // Phase B B1-12: hungry auto-detect (async, after sync start)
      if (petBehaviorConfig.hungry.evaluateOnStartup) {
        void (async () => {
          try {
            const lastCsvImportDate = await PetContextService.getLastCsvImportDate();
            const nowDate = formatLocalDate(new Date());
            const { isHungry, daysSinceFeed } = decideHungry({
              lastCsvImportDate: lastCsvImportDate ?? "",
              nowDate,
              thresholdDays: petBehaviorConfig.hungry.thresholdDays,
            });

            if (IS_DEV_BUILD) {
              console.log(
                "[hungry] decided: isHungry=%s, daysSinceFeed=%d, threshold=%d, lastImport=%s",
                isHungry,
                daysSinceFeed,
                petBehaviorConfig.hungry.thresholdDays,
                lastCsvImportDate ?? "(never)",
              );
            }

            machine.dispatch({ type: "hungry.set", value: isHungry });
            setDevHungryInfo({ lastCsvImportDate, daysSinceFeed });

            if (IS_DEV_BUILD) {
              setDevSnapshot(machine.getSnapshot());
            }
          } catch (error) {
            console.error("[hungry] decision failed:", error);
          }
        })();
      }
```

⚠️ 注意：原来 `machine.start()` 后的 `if (IS_DEV_BUILD) { setDevSnapshot(...); }` 和 `previousMajorRef.current = ...` 行应**保留在原位**（`start` 后立即执行），不应挪入 async 回调。

**E. `src/components/DevPanel/DevPanel.tsx`** — Props 接口新增字段：
```ts
  lastCsvImportDate: string | null;
  hungryThresholdDays: number;
  hungryIsHungry: boolean;
  hungryDaysSinceFeed: number;
```

**F. `src/components/DevPanel/DevPanel.tsx`** — 在 "Flags / Overlay" 区块（约 131-137 行）追加 hungry 决策信息卡片：
```tsx
  <div className="dev-panel__state-card">
    <h4 className="dev-panel__state-title">Hungry Decision</h4>
    <pre className="dev-panel__state">
      {toPrettyJson({
        lastCsvImportDate,
        thresholdDays: hungryThresholdDays,
        isHungry: hungryIsHungry,
        daysSinceFeed: hungryDaysSinceFeed === Number.POSITIVE_INFINITY
          ? "Infinity"
          : hungryDaysSinceFeed,
      })}
    </pre>
  </div>
```

**G. `src/App.tsx`** — 传递新 props 到 DevPanel。找到 `<DevPanelLazy>` 或 `<DevPanel>` JSX（约 1520-1550 行区域），追加以下 props：
```tsx
  lastCsvImportDate={devHungryInfo?.lastCsvImportDate ?? null}
  hungryThresholdDays={petBehaviorConfig.hungry.thresholdDays}
  hungryIsHungry={devSnapshot?.state.flags.isHungry ?? false}
  hungryDaysSinceFeed={devHungryInfo?.daysSinceFeed ?? 0}
```

**Commit 4 验收**：
```bash
pnpm exec tsc --noEmit
pnpm tauri dev
```
手动验证：
- [ ] DevPanel 打开，"Hungry Decision" 卡片显示 `lastCsvImportDate: null`，`isHungry: true`，`daysSinceFeed: "Infinity"`（首次启动从未投喂）。
- [ ] 控制台打印 `[hungry] decided: isHungry=true, daysSinceFeed=Infinity, threshold=3, lastImport=(never)`。
- [ ] 宠物进入 idle.awake 后 hungry overlay 出现（首次启动）。
- [ ] DevPanel Toggle isHungry 按钮仍可正常工作（Commit 0 验收）。
- [ ] 若 `evaluateOnStartup` 改为 `false` → 启动后不打印日志，hungry 保持 `false`。

---

## 6. 待处理开放项

| # | 项 | 决议 |
|---|---|---|
| 1 | 非法日期兜底 | 视为从未投喂（`isHungry: true, daysSinceFeed: Infinity`） |
| 2 | 持久化通道 | 复用 SQLite `config` 表，key = `petcontext.lastCsvImportDate`（过渡方案） |
| 3 | 未来日期（`daysSinceFeed < 0`） | 视为同日投喂（`isHungry: false, daysSinceFeed: 0`） |
| 4 | DevPanel 不新增写入入口 | 仅展示 `lastCsvImportDate` + 阈值，不暴露写入按钮 |
| 5 | `hungry.thresholdDays` vs `HUNGRY_COPY.enterCooldownMs` | 语义不同（首次门槛 vs 重复提示冷却），本卡不改后者 |

---

## 7. 验收清单

### 7.1 自动化
- [ ] `decideHungry()` 7 组用例全部通过
- [ ] `pnpm exec tsc --noEmit` 通过
- [ ] `pnpm test` 通过
- [ ] `pnpm tauri build --debug` 通过

### 7.2 手动验收（项目负责人执行）
- [ ] **Step 0 独立验收**：DevPanel Toggle isHungry 按钮行为与改前完全等价
- [ ] 清空 `lastCsvImportDate` 后启动 → hungry overlay 出现
- [ ] 设置 `lastCsvImportDate` 为今日 → 启动后 hungry overlay 不出现
- [ ] 设置 `lastCsvImportDate` 为 4 天前（阈值为 3）→ 启动后 hungry overlay 出现
- [ ] 启动后控制台打印 `[hungry] decided: isHungry=..., daysSinceFeed=..., threshold=..., lastImport=...`
- [ ] DevPanel 中能观察到当前判定结果与 `daysSinceFeed`
- [ ] **B1-2 完成后联合验收**：拖入 CSV 导入成功 → `lastCsvImportDate` 更新 → `hungry.set(false)` 触发 → overlay 自动解除

### 7.3 文档闭环
- [ ] `behavior_config.md` §2.7 已新增
- [ ] `behavior_config.md` §3 第 9 条已追加
- [ ] `phaseb_execution_plan.md` 新增 §5.x B1-12 实施报告
- [ ] `ichan_project_doc.md` §9.3 任务看板将 B1-12 标记为 Done
- [ ] 本任务卡移入 `docs/04_task_cards/done/B1-12_task_card_v1.3.md`

---

## 8. 风险与边界

### 8.1 时区风险
判定使用本地时区。用户跨时区使用可能出现误判一天，本期不处理。

### 8.2 与晨间仪式的关系
B3-5 晨间仪式落地时，hungry 重新判定可能从"启动判定"迁移到"晨间仪式判定"。本卡不预留 hook。

### 8.3 与 talking 状态的交互
hungry 是 overlay/flag，与 `MajorState` 正交。启动时若 hungry=true，pet 进入 idle.awake 后 overlay 自动渲染。

### 8.4 不允许的事
- 不允许 `decideHungry()` 内部直接调 `dispatch`（保持纯函数）。
- 不允许把判定结果持久化到 `PetContext.isHungry`（`isHungry` 只能从 `getState().flags` 读取）。
- 不允许 DevPanel 暴露 `lastCsvImportDate` 写入按钮。
- 不允许异步判定延迟 `machine.start()`（机器必须同步启动）。

### 8.5 持久化过渡方案声明

当前 PetContext 字段使用 SQLite 单表 `config(key, value)` 存储，key 使用 `petcontext.*` 前缀命名空间。

**迁移触发条件（满足任一即启动迁移至独立 `pet_context` 表）**：
1. PetContext 字段数 ≥ 5 且跨领域使用（CSV/Notion/Chat）
2. 单字段读写频率超过 1 次/分钟
3. 需要事务性批量更新多个字段

`PetContextService.ts` 中已预留 `migrateFromConfigTable()` placeholder。
