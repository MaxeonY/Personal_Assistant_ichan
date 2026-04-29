# 宠物动画资产 (Ani_Resources)

>**版本**：
    > V1.1.0 - 2026.04.17
    > V1.1.1 - 2026.04.17
    > V1.2.0 - 2026.04.18
    > V1.2.1 - 2026.04.18
    > V1.2.2 - 2026.04.19
    > V1.2.3 - 2026.04.23
    > V1.2.4 - 2026.04.27（审计修订：§2 画布尺寸说明澄清）
    > V1.2.5 - 2026.04.27（审计+落地对齐修订）
> 维护者：MaxeonY
> 资源目录：assets
> 备注：帧功能定义及预定方案部分，自eat开始至idle/awake部分为GPT完成，剩余部分为Grok完成



## 1.统计

- 子目录数量：18
- 图片总数：116

## 2.全局资源规格

- **目标画布尺寸**： 788 × 660（设计参考尺寸，非运行时约束）
- **角色目标高度**: 500px（站立/悬浮姿势）
- **角色目标宽度**: 600px（躺平/横向姿势
- **锚点**: bottom-center，底部留白 20px
- **缩放算法**: NEAREST（最近邻，保持像素风）

> **注意**：实际 SpriteSheet 各状态的帧尺寸由 metadata 自描述（见附录 A），各状态差异显著（如 eat 480×600、idle_awake 440×560、talk ~271×254）。运行时显示层按 metadata 定义渲染，不强制统一到目标画布尺寸。此设计参考值主要用于素材制作时的归一化对齐。

## 3.资源清单

### 3.1.1 eat

**帧序列**
- eat_bite_01.png
- eat_bite_02.png
- eat_chew_01.png
- eat_chew_02.png
- eat_chew_03.png
- eat_chew_04.png
- eat_end_01.png
- eat_start_01.png
- eat.png
------
**帧功能定义**
| 顺序 | 资源名            | 帧功能           | 说明                          |
| -- | -------------- | ------------- | --------------------------- |
| 1  | `eat_start_01` | 起始帧 / 预备帧     | 苹果靠近嘴边，嘴张开，表示“准备吃”          |
| 2  | `eat_bite_01`  | 咬合动作 1        | 舌头伸出、嘴张得更大，进入第一下咬合          |
| 3  | `eat_bite_02`  | 咬合动作 2 / 咬住确认 | 咬的动作继续推进，作为 bite 段结束帧       |
| 4  | `eat_chew_01`  | 咀嚼循环 1        | 嘴闭上，进入 chewing，相当于 chew 的起点 |
| 5  | `eat_chew_02`  | 咀嚼循环 2        | 嘴部略变化，形成节奏感                 |
| 6  | `eat_chew_03`  | 咀嚼循环 3        | 眼睛眯起，情绪更满足                  |
| 7  | `eat_chew_04`  | 咀嚼循环 4 / 咀嚼尾帧 | chew 段的收束帧，接结束帧很自然          |
| 8  | `eat_end_01`   | 结束帧 / 吞咽后停顿   | 嘴再次张开但状态放松，像“吃完了一口”         |
| 9  | `end`   | SpriteSheet   | - |
----
**帧序列预定方案**
- 方案A：`eat_start_01` → `eat_bite_01` → `eat_bite_02` → `eat_chew_01` → `eat_chew_02` → `eat_chew_03` → `eat_chew_04` → `eat_end_01`
- 方案B：`eat_start_01` ×1 → `eat_bite_01` ×1 → `eat_bite_02` ×1 → (`eat_chew_01` → `eat_chew_02` → `eat_chew_03` → `eat_chew_04`) ×2 → `eat_end_01` ×1
- 基准设计以方案A开始

### 3.1.2 goodbye

**帧序列**
- goodbye_end_01.png
- goodbye_fade_01.png
- goodbye_start_01.png
- goodbye_wave_01.png
- goodbye_wave_02.png
- goodbye_wave_03.png
- goodbye_wave_04.png
- goodbye.png
------
**帧功能定义**
| 顺序 | 资源名                | 帧功能           | 说明                      |
| -- | ------------------ | ------------- | ----------------------- |
| 1  | `goodbye_start_01` | 起始帧 / 准备告别    | 进入闭眼、抬手的告别姿态，作为整段开头     |
| 2  | `goodbye_wave_01`  | 挥手循环 1        | 挥手动作起点                  |
| 3  | `goodbye_wave_02`  | 挥手循环 2        | 手臂继续抬起，形成摆动             |
| 4  | `goodbye_wave_03`  | 挥手循环 3        | 挥手回摆                    |
| 5  | `goodbye_wave_04`  | 挥手循环 4 / 挥手尾帧 | 挥手动作收束                  |
| 6  | `goodbye_end_01`   | 最终淡出帧 / 消失帧 | 颜色更浅，作为程序关闭前的最后一帧 |
| 7  | `goodbye_fade_01`  | 结束停顿帧 / 淡出前过渡帧     | 挥手结束后短暂停留，作为进入最终消失前的过渡 |
| 8  | `goodbye`  | SpriteSheet     | - |
----
**帧序列预定方案**
- 方案A：`goodbye_start_01` → `goodbye_wave_01` → `goodbye_wave_02` → `goodbye_wave_03` → `goodbye_wave_04` → `goodbye_fade_01` → `goodbye_end_01`
- 方案B：`goodbye_start_01` → `goodbye_wave_01` → `goodbye_wave_02` → `goodbye_wave_03` → `goodbye_wave_04` → `goodbye_wave_01` → `goodbye_wave_02` → `goodbye_wave_03` → `goodbye_wave_04` → `goodbye_fade_01` → `goodbye_end_01`
- 决策：基准设计以A开始

### 3.1.3 happy

**帧序列**
- happy_end_01.png
- happy_peak_01.png
- happy_peak_02.png
- happy_peak_03.png
- happy_relax_01.png
- happy_relax_02.png
- happy_rise_01.png
- happy_start_01.png
- happy.png
------
**帧功能定义**
| 顺序 | 资源名              | 帧功能        | 说明                         |
| -- | ---------------- | ---------- | -------------------------- |
| 1  | `happy_start_01` | 起始帧 / 开心起手 | 从普通状态切入开心表情，脸红出现，双手靠前      |
| 2  | `happy_rise_01`  | 抬升帧 / 情绪升温 | 身体和氛围开始“鼓起来”，作为进入 peak 的过渡 |
| 3  | `happy_peak_01`  | 峰值 1       | 开心状态正式建立，身体更饱满             |
| 4  | `happy_peak_02`  | 峰值 2       | 峰值强化，整体更“蓬”                |
| 5  | `happy_peak_03`  | 峰值 3 / 最高点 | 最满、最红润的一帧，作为高潮帧            |
| 6  | `happy_relax_01` | 回落 1       | 从高峰往下收，开心还在，但开始恢复          |
| 7  | `happy_relax_02` | 回落 2       | 接近常态，作为 end 的前置            |
| 8  | `happy_end_01`   | 结束帧        | 开心反馈结束，方便平滑切回 idle         |
| 9  | `happy`   | SpriteSheet | - |
----
**帧序列预定方案**
- 方案A：`happy_start_01` → `happy_rise_01` → `happy_peak_01` → `happy_peak_02` → `happy_peak_03` → `happy_relax_01` → `happy_relax_02` → `happy_end_01`
- 方案B：`happy_start_01` → `happy_rise_01` → `happy_peak_01` → `happy_peak_02` → `happy_peak_03` → `happy_peak_02` → `happy_peak_03` → `happy_relax_01` → `happy_relax_02` → `happy_end_01`
- 决策：当前阶段使用方案A

### 3.1.4 hungry

**帧序列**
- hungry_overlay_base_01.png
- hungry_overlay_base_02.png
- hungry_overlay_recover_01.png
- hungry_overlay_shake_01.png
- hungry_overlay_shake_02.png
- hungry_overlay_weak_01.png
- overlay.png
------
**帧功能定义**
| 顺序角色                | 资源名                         | 帧功能    | 说明                       |
| ------------------- | --------------------------- | ------ | ------------------------ |
| enter-1             | `hungry_overlay_base_01`    | 挂载起始帧  | 第一次显示饥饿效果，视觉上比正常状态更弱、更委屈 |
| enter-2 / idle-base | `hungry_overlay_base_02`    | 基础维持帧  | 作为 hungry overlay 的常驻基准帧 |
| loop-1              | `hungry_overlay_shake_01`   | 轻微抖动 1 | 轻度不稳感                    |
| loop-2              | `hungry_overlay_shake_02`   | 轻微抖动 2 | 抖动加强/方向变化                |
| loop-3              | `hungry_overlay_weak_01`    | 虚弱低谷帧  | 整个循环中最弱的一拍               |
| exit                | `hungry_overlay_recover_01` | 恢复帧    | 投喂后撤销 overlay 的过渡帧       |
----
**帧序列预定方案**
- 进入：`hungry_overlay_base_01` → `hungry_overlay_base_02`
    - 循环：`hungry_overlay_base_02` → `hungry_overlay_shake_01` → `hungry_overlay_shake_02` → `hungry_overlay_weak_01` → `hungry_overlay_shake_02` → `hungry_overlay_shake_01` → `hungry_overlay_base_02`
- 解除：`hungry_overlay_recover_01`

### 3.1.5 idle

- _无直接图片文件_

#### SecA：idle/awake

**帧序列**
- idle_awake_blink_01.png
- idle_awake_blink_02.png
- idle_awake_float_01.png
- idle_awake_float_02.png
- idle_awake_float_03.png
- idle_awake_float_04.png
- idle_awake_float_05.png
- idle_awake_float_06.png
- idle_awake_float_07.png
- idle_awake_float_08.png
- idle_awake_float_09.png
- idle_awake_float_10.png
- idle_awake_float_11.png
- awake.png
------
**帧功能定义**
- A.float 主循环
| 顺序 | 资源名                   | 帧功能      | 说明            |
| -- | --------------------- | -------- | ------------- |
| 1  | `idle_awake_float_01` | 主循环起点    | 清醒待机基准帧       |
| 2  | `idle_awake_float_02` | 浮动过渡 1   | 轻微上浮/重心变化     |
| 3  | `idle_awake_float_03` | 浮动过渡 2   | 延续漂浮感         |
| 4  | `idle_awake_float_04` | 浮动过渡 3   | 进一步位移         |
| 5  | `idle_awake_float_05` | 浮动中段 1   | 进入较明显的呼吸/漂浮区间 |
| 6  | `idle_awake_float_06` | 浮动中段 2   | 中性持续帧         |
| 7  | `idle_awake_float_07` | 浮动中段 3   | 接近高点          |
| 8  | `idle_awake_float_08` | 浮动高点过渡 1 | 高位区间          |
| 9  | `idle_awake_float_09` | 浮动高点过渡 2 | 高位持续          |
| 10 | `idle_awake_float_10` | 浮动高点 3   | 接近峰值          |
| 11 | `idle_awake_float_11` | 主循环峰值帧   | 漂浮/呼吸到达最顶点    |

- B.blink插入帧
| 顺序 | 资源名                   | 帧功能  | 说明        |
| -- | --------------------- | ---- | --------- |
| 1  | `idle_awake_blink_01` | 半闭眼帧 | 眨眼起始/结束过渡 |
| 2  | `idle_awake_blink_02` | 闭眼帧  | 眨眼最低点     |
------
**预定方案**
- 主循环：(`idle_awake_float_01` → `idle_awake_float_02` → ... → `idle_awake_float_11` → `idle_awake_float_10` → ... → `idle_awake_float_02` )repeat
    - <眨眼插入>.每隔一个随机时间窗口插入一次：`idle_awake_blink_01` → `idle_awake_blink_02` → `idle_awake_blink_01`.插入完毕后回到主循环当前位置
    - blink 非独立无限循环，低频插入事件，每次插入播放一次
- float主段无限循环

#### SecB：idle/drowsy
**帧序列**
- idle_drowsy_end_01.png
- idle_drowsy_fade_01.png
- idle_drowsy_fade_02.png
- idle_drowsy_heavy_01.png
- idle_drowsy_settle_01.png
- idle_drowsy_settle_02.png
- idle_drowsy_start_01.png
- idle_drowsy_yawn_01.png
- idle_drowsy_yawn_02.png
- idle_drowsy_yawn_03.png
- idle_drowsy_yawn_04.png
- idle_drowsy_yawn_05.png
- drowsy.png
**帧功能定义**
顺序,资源名,帧功能,说明
1,`idle_drowsy_start_01`,起始帧,从 idle.awake 进入 drowsy 过渡，眼睛大睁、精神饱满，作为打哈欠前奏
2,`idle_drowsy_heavy_01`,眼睛变沉,眼睛开始下垂眯起，表现出逐渐困倦（重眼皮信号）
3,`idle_drowsy_yawn_01`,打哈欠开始 1,嘴巴微微张开，眼睛更疲惫，哈欠动作启动
4,`idle_drowsy_yawn_02`,打哈欠开始 2,嘴巴张大，眼睛进一步闭合，哈欠加深
5,`idle_drowsy_yawn_03`,打哈欠高潮 1,眼睛几乎闭上，嘴巴大张，哈欠峰值（元气哈欠）
6,`idle_drowsy_yawn_04`,打哈欠高潮 2,嘴巴最大张开，舌头可见，哈欠最强烈
7,`idle_drowsy_yawn_05`,打哈欠收尾,哈欠结束，嘴巴逐渐放松，眼睛仍保持困倦
8,`idle_drowsy_settle_01`,放松过渡 1,哈欠后身体/表情开始放松，眼睛闭合
9,`idle_drowsy_settle_02`,放松过渡 2,进一步放松，闭眼满足微笑
10,`idle_drowsy_fade_01`,进入睡意 1,进入更困倦状态，i 标志轻微淡化/下沉
11,`idle_drowsy_fade_02`,进入睡意 2 / 备用帧,【当前不采用，仅存档】当前不纳入基准播放链，保留为后续参数微调或扩展使用
12,`idle_drowsy_end_01`,循环帧,drowsy loop 基帧（叠加 CSS 呼吸动效），同时作为 drowsy → napping 的过渡单帧
----
**预定方案**

- ~~进入过渡（一次性）：`idle_drowsy_start_01` → `idle_drowsy_heavy_01` → `idle_drowsy_yawn_01` → `idle_drowsy_yawn_02` → `idle_drowsy_yawn_03` → `idle_drowsy_yawn_04` → `idle_drowsy_yawn_05` → `idle_drowsy_settle_01` → `idle_drowsy_settle_02`~~[原方案废弃]
- ~~持续循环（无限）：`idle_drowsy_settle_02` → `idle_drowsy_fade_01` → `idle_drowsy_fade_02` → `idle_drowsy_fade_01` → `idle_drowsy_settle_02`（轻微呼吸般的闭眼微晃）~~[原方案废弃]
- v0.4 基准口径采用 **三段式方案**：
  - 第 1 段 / 进入（一次性 9 帧）：`idle_drowsy_start_01` → `idle_drowsy_heavy_01` → `idle_drowsy_yawn_01` → `idle_drowsy_yawn_02` → `idle_drowsy_yawn_03` → `idle_drowsy_yawn_04` → `idle_drowsy_yawn_05` → `idle_drowsy_settle_01` → `idle_drowsy_settle_02`
  - 第 2 段 / 驻留循环（单帧 + CSS 呼吸效果）：`idle_drowsy_end_01`，叠加 translateY ±3px、3.5s ease-in-out 无限循环
  - 第 3 段 / 短退出（4 帧自有序列 + 目标态首帧自然衔接，软打断用）：`idle_drowsy_end_01` → `idle_drowsy_fade_01` → `idle_drowsy_heavy_01` → `idle_drowsy_start_01`。第 5 帧的视觉衔接由状态机在下一次 play(target) 调用时自然完成（同一 rAF tick 内帧切换，肉眼无感）。
- 入睡过渡（1 帧）：`idle_drowsy_end_01` → 接 napping

### 3.1.6 reminding

**帧序列**
- reminding_base_01.png
- reminding_peak_01.png
- reminding_peak_02.png
- reminding_relax_01.png
- reminding_relax_02.png
- reminding_wave_01.png
- reminding_wave_02.png
- reminding.png
**帧功能定义**
顺序,资源名,帧功能,说明
1,`reminding_base_01`,基础帧 / 起始帧,基础警戒姿势：眼睛大睁、嘴巴微张、手微微抬起，i 标志正常，感叹号气泡出现，表现“注意到了！”的初始状态
2,`reminding_wave_01`,挥手动作 1,第一拍挥手，右手抬起较高，身体略微前倾，表情急切，强调开始呼唤主人
3,`reminding_peak_01`,高潮帧 1,兴奋峰值 1：眼睛瞪到最大，嘴巴大张，挥手达到最高点，i 标志轻微上浮闪烁，急切感最强
4,`reminding_wave_02`,挥手动作 2,第二拍挥手，动作幅度更大，身体轻微摇晃，保持高能量状态
5,`reminding_peak_02`,高潮帧 2,兴奋峰值 2：另一组最高兴奋表情，嘴巴更圆，眼睛更亮，i 标志闪烁更明显
6,`reminding_relax_01`,放松过渡 1,稍作放松过渡，手势回落但仍保持举起，眼睛略微放松，为下一轮挥手蓄力
7,`reminding_relax_02`,放松过渡 2 / 收尾帧,进一步放松，手势回到中位，表情保持警戒但略带满足，准备循环下一轮
----
**预定方案**
`reminding_base_01` → `reminding_wave_01` → `reminding_peak_01` → `reminding_wave_02` → `reminding_peak_02` → `reminding_relax_01` → `reminding_relax_02`（循环播放）

### 3.1.7 sleep

- _无直接图片文件_

#### SecA：sleep/napping

**帧序列**
- sleep_napping_base_01.png
- sleep_napping_base_02.png
- sleep_napping_fall_01.png
- sleep_napping_rise_01.png
- sleep_napping_rise_02.png
- sleep_napping_top_01.png
- sleep_napping_top_02.png
- napping.png
**帧功能定义**
顺序,资源名,帧功能,说明
1,`sleep_napping_fall_01`,入睡下沉 / 趴下帧,从 drowsy 状态完全趴到桌面上，身体下沉贴桌，完成进入深度睡眠的过渡
2,`sleep_napping_base_01`,基础趴睡姿势 1,完全放松的趴睡最低位，眼睛紧闭、表情安详，ZZZ 开始飘浮（呼吸低谷）
3,`sleep_napping_base_02`,基础趴睡姿势 2,基础睡姿轻微变化，保持放松状态（呼吸低谷变体）
4,`sleep_napping_rise_01`,呼吸抬起 1,身体开始缓缓抬起，进入吸气阶段（轻微膨胀）
5,`sleep_napping_rise_02`,呼吸抬起 2,继续抬起，呼吸幅度增大，身体更饱满
6,`sleep_napping_top_01`,呼吸峰值 1,身体抬至最高点，呼吸最饱满、最舒适的趴睡状态
7,`sleep_napping_top_02`,呼吸峰值 2,峰值第二帧，ZZZ 效果更明显，准备回落
**预定方案**
- 进入（一次性）：`sleep_napping_fall_01`
- 循环（无限）：`sleep_napping_base_01` → `sleep_napping_base_02` → `sleep_napping_rise_01` → `sleep_napping_rise_02` → `sleep_napping_top_01` → `sleep_napping_top_02` → `sleep_napping_top_01` → `sleep_napping_rise_02` → `sleep_napping_rise_01` → `sleep_napping_base_02`（呼吸起伏 ping-pong 循环）

- 备注：
    - 类型：循环播放（looping）
    - 时长：约 2.5–3.5 秒一轮（非常缓慢、温柔的节奏）
    - 触发：idle.drowsy 动画播放完毕后自动进入
    - 运动层：必须为 still（完全原地趴睡）
    - 结束后状态：持续保持在 idle.napping 循环
    - 可打断：是（当前仅指高优先级状态切换触发的硬打断路径：切至 wake/from_nap 过渡后进入目标状态）。【当前不采用，仅存档】用户 pat 点击微反应（microReact）能力。
    - 视觉重点：ZZZ 持续漂浮 + i 标志轻微上下浮动 + 身体轻柔呼吸起伏，营造“舒服地趴在桌面上小睡”的沉浸感

### 3.1.8 talk
**帧序列**
- talk_half_01.png
- talk_half_02.png
- talk_idle_01.png
- talk_open_01.png
- talk_open_02.png
- talk.png
**帧功能定义**
顺序,资源名,帧功能,说明
1,`talk_idle_01`,闭嘴 / 待机帧,嘴巴闭合，表情专注平和，一手微微抬起，对话气泡出现，代表说话间隙或倾听状态
2,`talk_half_01`,半张嘴 1,嘴巴微微张开，开始说话的第一阶段过渡帧
3,`talk_open_01`,张嘴说话 1,嘴巴明显张开，中等力度说话，表情活泼
4,`talk_open_02`,张嘴说话 2（峰值帧）,嘴巴张到最大，强调语气或兴奋高潮，元气最足
5,`talk_half_02`,半张嘴 2,嘴巴半开收尾过渡帧，自然衔接回待机状态
**预定方案**
`talk_idle_01` → `talk_half_01` → `talk_open_01` → `talk_open_02` → `talk_half_02`（循环播放）
- 备注
    - 类型：循环播放（looping）
    - 时长：约 0.8–1.2 秒一轮（5 帧循环，节奏轻快自然）
    - 触发：进入 majorState === 'talking' 时立即开始（晨间仪式对话、用户双击宠物主动对话时）
    - 运动层：必须为 still（原地说话）
    - 视觉重点：嘴巴有节奏地开合 + 右侧固定对话气泡（“...”），眼睛保持专注眼神，一只小手微微抬起
    - 结束后状态：当前阶段 `talking` 仅作为 loop 状态使用；正常退出机制未在当前接口开放，未定义 `talking exit intent` / `talking.finish` / `dialog.close`。若被更高优先级事件打断，由状态机按现有规则切出。【非当前实现】若需“自然结束后回 idle.awake”，需后续接口扩展，不构成当前接口承诺。
    - 可打断：是（eating、reminding、happy 等高优先级事件可立即中断）

### 3.1.9 wake

- _无直接图片文件_

#### SecA：wake/day_start
**帧序列**
- wake_day_start_awake_01.png
- wake_day_start_drowsy_01.png
- wake_day_start_drowsy_02.png
- wake_day_start_end_01.png
- wake_day_start_rise_01.png
- wake_day_start_settle_01.png
- wake_day_start_sleep_01.png
- wake_day_start_sleep_02.png
- day_start.png
**帧功能定义**
顺序,资源名,帧功能,说明
1,`wake_day_start_sleep_01`,沉睡起始帧,完全闭眼、身体最低位的沉睡姿势，作为隔天苏醒动画的起点
2,`wake_day_start_sleep_02`,沉睡过渡帧,睡眠中轻微身体/表情变化，准备开始苏醒过程
3,`wake_day_start_drowsy_01`,初醒困倦 1,眼睛半睁、重眼皮，迷糊困倦的表情，开始从沉睡中挣扎
4,`wake_day_start_drowsy_02`,初醒困倦 2,困倦感最强，眼睛更努力睁开，过渡到清醒动作
5,`wake_day_start_rise_01`,起身伸展帧,身体逐渐抬起（伸懒腰动作），眼睛暂时闭上但露出满足微笑
6,`wake_day_start_settle_01`,稳定过渡帧,身体安定到正常高度，眼睛开始睁开，表情转为温和开心
7,`wake_day_start_awake_01`,完全清醒帧,眼睛突然大睁、明亮有神，彻底清醒过来
8,`wake_day_start_end_01`,结束 / 最终帧,精神饱满、元气满满的最终姿势，i标志光效最亮
**预定方案**
`wake_day_start_sleep_01` → `wake_day_start_sleep_02` → `wake_day_start_drowsy_01` → `wake_day_start_drowsy_02` → `wake_day_start_rise_01` → `wake_day_start_settle_01` → `wake_day_start_awake_01` → `wake_day_start_end_01`
- 备注
    - 类型：一次性播放过渡动画（非循环）
    - 时长：约 2.0–2.8 秒
    - 触发：程序启动 + isNewDay === true 时，lifecycle 从 deep_sleep 进入 waking_up
    - 运动层：必须为 still（原地苏醒）
    - 结束后状态：自动进入 alive + majorState = idle.awake，立即开始晨间仪式对话
    - 视觉重点：i标志从暗淡逐渐出现白色光环 + 身体从低姿态慢慢抬起 + 眼睛从紧闭→半睁→大睁的明显情绪递进，完美体现“从沉睡中慢慢醒来”的可爱过程
    - 可打断：较低优先级（晨间仪式开场动画，一般不被打断）

#### SecB：wake/from_nap
**帧序列**
- wake_from_nap_awake_01.png
- wake_from_nap_end_01.png
- wake_from_nap_rise_01.png
- wake_from_nap_rise_02.png
- wake_from_nap_settle_01.png
- wake_from_nap_start_01.png
- from_nap.png
**帧功能定义**
顺序,资源名,帧功能,说明
1,`wake_from_nap_start_01`,起始帧 / 睡姿,从 napping 状态开始苏醒，眼睛紧闭微笑，身体略微抬起，i标志稍暗淡，带有轻微白色粒子效果，作为被打断后的唤醒起点
2,`wake_from_nap_rise_01`,起身睁眼 1,眼睛半睁（困倦状态），身体继续抬起，开始从趴睡中挣扎醒来
3,`wake_from_nap_rise_02`,起身睁眼 2,眼睛努力睁开，困倦表情稍有缓解，起身动作继续，过渡自然
4,`wake_from_nap_settle_01`,稳定过渡,身体安定下来，眼睛暂时闭上露出满足微笑（伸懒腰/调整姿势）
5,`wake_from_nap_awake_01`,完全清醒帧,眼睛突然大睁、明亮有神，表情转为开心，彻底清醒过来
6,`wake_from_nap_end_01`,结束帧 / 最终态,精神饱满、元气满满的最终姿势，i标志最亮，可直接切入 idle.awake
**预定方案**
`wake_from_nap_start_01` → `wake_from_nap_rise_01` → `wake_from_nap_rise_02` → `wake_from_nap_settle_01` → `wake_from_nap_awake_01` → `wake_from_nap_end_01`
- 备注
    - 类型：一次性播放过渡动画（非循环）
    - 时长：约 0.8–1.2 秒（短促可爱）
    - 触发：从 idle.napping 被当前已支持的高优先级打断事件切出时立即播放
    - 运动层：必须为 still（原地醒来）
    - 结束后状态：自动进入 idle.awake
    - 视觉重点：i标志从较暗/模糊逐渐清晰 + 眼睛从紧闭→半睁困倦→大睁清醒的明显情绪递进 + 身体轻微抬起过程，营造“被叫醒后快速恢复元气”的萌感
    - 可打断：较低优先级（过渡动画通常一气呵成）

### 3.1.10 walk

- _无直接图片文件_

#### SecA：walk/roaming
**帧序列**
- walk_roaming_left_01.png
- walk_roaming_left_02.png
- walk_roaming_left_03.png
- walk_roaming_left_04.png
- walk_roaming_left_05.png
- walk_roaming_right_01.png
- walk_roaming_right_02.png
- walk_roaming_right_03.png
- walk_roaming_right_04.png
- walk_roaming_right_05.png
- roaming.png
**帧功能定义**
顺序,资源名,帧功能,说明
1,`walk_roaming_left_01`,左漂基帧 1,向左漂移起始姿势，身体轻微左倾，小手自然摆动，i 标志正常
2,`walk_roaming_left_02`,左漂推进 1,向左移动推进动作，身体左倾加剧，体现漂浮感
3,`walk_roaming_left_03`,左漂峰值,左漂动作幅度最大，i 标志轻微偏移，漂移动态最明显
4,`walk_roaming_left_04`,左漂回收 1,推进后身体回正过渡帧，自然收束
5,`walk_roaming_left_05`,左漂基帧 2,完成一个周期的自然左漂状态，可循环
6,`walk_roaming_right_01`,右漂基帧 1,向右漂移起始姿势，身体轻微右倾，小手自然摆动
7,`walk_roaming_right_02`,右漂推进 1,向右移动推进动作，身体右倾加剧
8,`walk_roaming_right_03`,右漂峰值,右漂动作幅度最大，可见尾部轻微推进效果
9,`walk_roaming_right_04`,右漂回收 1,推进后身体回正过渡帧
10,`walk_roaming_right_05`,右漂基帧 2,完成一个周期的自然右漂状态，可循环
**预定方案**
- 向左漂移循环：(`walk_roaming_left_01` → `walk_roaming_left_02` → `walk_roaming_left_03` → `walk_roaming_left_04` → `walk_roaming_left_05`) x repeat
- 向右漂移循环：(`walk_roaming_right_01` → `walk_roaming_right_02` → `walk_roaming_right_03` → `walk_roaming_right_04` → `walk_roaming_right_05`) x repeat
- 备注
    - 类型：循环播放（looping）
    - 时长：约 1.2–1.8 秒一轮（5 帧循环）
    - 触发：movementState === 'roaming' 时，根据随机漂移方向选择对应 spritesheet（左/右）
    - 叠加方式：可与任何主行为状态（尤其是 idle.awake）正交叠加
    - 运动表现：身体轻微倾斜 + 小手自然摆动 + i 标志轻微浮动，营造“可爱飘浮随机漫游”的感觉
    - 结束后状态：持续保持 roaming 循环，直到状态机切换为 still 或 targeted_move
    - 可打断：是（任何高优先级事件如 talking、eating、reminding 均可立即中断）
- 实际上原始素材为向右素材，向左可完全通过CSS `scaleX(-1)`镜像`
#### SecB：walk/targeted
**帧序列**
- walk_targeted_left_01.png
- walk_targeted_left_02.png
- walk_targeted_lft_03.png
- walk_targeted_right_01.png
- walk_targeted_right_02.png
- walk_targeted_right_03.png
- targeted.png
**帧功能定义**
顺序,资源名,帧功能,说明
1,`walk_targeted_left_01`,向左推进起始帧,身体明显前倾，尾部出现较强运动残影，作为快速冲刺的启动姿势，准备向目标方向加速
2,`walk_targeted_left_02`,向左高速推进主帧,身体前倾幅度最大，运动残影最强烈，体现持续高速漂移的核心动态
3,`walk_targeted_lft_03`,向左冲刺峰值 / 粒子帧,速度感达到最高，新增亮闪粒子特效，i标志高亮，视觉高潮与兴奋感最足
4,`walk_targeted_right_01`,向右推进起始帧,身体明显前倾，尾部出现较强运动残影，作为快速冲刺的启动姿势，准备向目标方向加速
5,`walk_targeted_right_02`,向右高速推进主帧,身体前倾幅度最大，运动残影最强烈，体现持续高速漂移的核心动态
6,`walk_targeted_right_03`,向右冲刺峰值 / 粒子帧,速度感达到最高，新增亮闪粒子特效，i标志高亮，视觉高潮与兴奋感最足
7, `walk_targeted_left_01`,`walk_targeted_left_02`,`walk_targeted_lft_03`对应帧保留，不再使用
**预定方案**
1. ~~向左循环：targeted_left_01 → targeted_left_02 → targeted_lft_03 → targeted_left_02（循环播放）~~  [方案废弃]
2. 向右循环：(`walk_targeted_right_01` → `walk_targeted_right_02` → `walk_targeted_right_03` → `walk_targeted_right_02`)**loop** 【当前运行主链】
3. 向左循环采用CSS `scaleX(-1)` **水平镜像** 【当前运行主链】
4. 备注
    - 类型：循环播放（looping）
    - 时长：约 0.5–0.8 秒一轮（3帧高速循环，明显快于 roaming）
    - 触发：movementState === 'targeted_move' 时立即开始（提醒时快速跑到屏幕前台、被召唤等目的性移动）
    - 叠加方式：可与 reminding、talking 等主行为状态正交叠加
    - 视觉重点：强烈前倾姿态 + 运动拖影残影 + 第3帧的粒子闪光效果，营造“紧急、可爱地冲向目标”的目的性和急切感
    - 结束后状态：到达目标位置后自动切换回 still
    - 可打断：是（高优先级事件可立即停止移动动画）
    - 复用说明：仅3帧的情况下，通过在峰值帧(03)后直接回到主推进帧(02)，形成平滑且富有节奏的往返循环，既节省资源又保持高速流畅的冲刺感（无需额外帧即可实现自然重复）
5. 补充实现备注（2026-04-17 验证结论）：
    - walk/targeted 左向帧在独立 PNG 方案下，验证页中出现轻微闪烁。
    - 由于左向素材本身由右向素材镜像生成，而右向播放稳定，因此当前前端推荐实现改为：
        - 向右：直接使用 `walk_targeted_right_01/02/03`
        - 向左：复用 `walk_targeted_right_01/02/03`，通过 CSS `scaleX(-1)` 做水平镜像
    - `walk_targeted_left_01/02/lft_03` 【当前不采用，仅存档】


## 附录A：图片尺寸参数

| 文件名 | width | height | 相对路径 |
| --- | ---: | ---: | --- |
| `eat_bite_01.png` | 480 | 600 | `assets/eat/eat_bite_01.png` |
| `eat_bite_02.png` | 480 | 600 | `assets/eat/eat_bite_02.png` |
| `eat_chew_01.png` | 480 | 600 | `assets/eat/eat_chew_01.png` |
| `eat_chew_02.png` | 480 | 600 | `assets/eat/eat_chew_02.png` |
| `eat_chew_03.png` | 480 | 600 | `assets/eat/eat_chew_03.png` |
| `eat_chew_04.png` | 480 | 600 | `assets/eat/eat_chew_04.png` |
| `eat_end_01.png` | 480 | 600 | `assets/eat/eat_end_01.png` |
| `eat_start_01.png` | 480 | 600 | `assets/eat/eat_start_01.png` |
| `goodbye_end_01.png` | 443 | 503 | `assets/goodbye/goodbye_end_01.png` |
| `goodbye_fade_01.png` | 441 | 506 | `assets/goodbye/goodbye_fade_01.png` |
| `goodbye_start_01.png` | 420 | 500 | `assets/goodbye/goodbye_start_01.png` |
| `goodbye_wave_01.png` | 440 | 499 | `assets/goodbye/goodbye_wave_01.png` |
| `goodbye_wave_02.png` | 430 | 500 | `assets/goodbye/goodbye_wave_02.png` |
| `goodbye_wave_03.png` | 440 | 499 | `assets/goodbye/goodbye_wave_03.png` |
| `goodbye_wave_04.png` | 440 | 500 | `assets/goodbye/goodbye_wave_04.png` |
| `happy_end_01.png` | 383 | 475 | `assets/happy/happy_end_01.png` |
| `happy_peak_01.png` | 375 | 459 | `assets/happy/happy_peak_01.png` |
| `happy_peak_02.png` | 380 | 482 | `assets/happy/happy_peak_02.png` |
| `happy_peak_03.png` | 379 | 482 | `assets/happy/happy_peak_03.png` |
| `happy_relax_01.png` | 378 | 483 | `assets/happy/happy_relax_01.png` |
| `happy_relax_02.png` | 379 | 476 | `assets/happy/happy_relax_02.png` |
| `happy_rise_01.png` | 380 | 477 | `assets/happy/happy_rise_01.png` |
| `happy_start_01.png` | 380 | 480 | `assets/happy/happy_start_01.png` |
| `hungry_overlay_base_01.png` | 324 | 416 | `assets/hungry/overlay/hungry_overlay_base_01.png` |
| `hungry_overlay_base_02.png` | 315 | 400 | `assets/hungry/overlay/hungry_overlay_base_02.png` |
| `hungry_overlay_recover_01.png` | 317 | 399 | `assets/hungry/overlay/hungry_overlay_recover_01.png` |
| `hungry_overlay_shake_01.png` | 326 | 407 | `assets/hungry/overlay/hungry_overlay_shake_01.png` |
| `hungry_overlay_shake_02.png` | 325 | 407 | `assets/hungry/overlay/hungry_overlay_shake_02.png` |
| `hungry_overlay_weak_01.png` | 318 | 410 | `assets/hungry/overlay/hungry_overlay_weak_01.png` |
| `idle_awake_blink_01.png` | 440 | 560 | `assets/idle/awake/idle_awake_blink_01.png` |
| `idle_awake_blink_02.png` | 440 | 560 | `assets/idle/awake/idle_awake_blink_02.png` |
| `idle_awake_float_01.png` | 440 | 560 | `assets/idle/awake/idle_awake_float_01.png` |
| `idle_awake_float_02.png` | 440 | 560 | `assets/idle/awake/idle_awake_float_02.png` |
| `idle_awake_float_03.png` | 440 | 560 | `assets/idle/awake/idle_awake_float_03.png` |
| `idle_awake_float_04.png` | 440 | 560 | `assets/idle/awake/idle_awake_float_04.png` |
| `idle_awake_float_05.png` | 440 | 560 | `assets/idle/awake/idle_awake_float_05.png` |
| `idle_awake_float_06.png` | 440 | 560 | `assets/idle/awake/idle_awake_float_06.png` |
| `idle_awake_float_07.png` | 440 | 560 | `assets/idle/awake/idle_awake_float_07.png` |
| `idle_awake_float_08.png` | 440 | 560 | `assets/idle/awake/idle_awake_float_08.png` |
| `idle_awake_float_09.png` | 440 | 560 | `assets/idle/awake/idle_awake_float_09.png` |
| `idle_awake_float_10.png` | 440 | 560 | `assets/idle/awake/idle_awake_float_10.png` |
| `idle_awake_float_11.png` | 440 | 560 | `assets/idle/awake/idle_awake_float_11.png` |
| `idle_drowsy_end_01.png` | 250 | 280 | `assets/idle/drowsy/idle_drowsy_end_01.png` |
| `idle_drowsy_fade_01.png` | 250 | 280 | `assets/idle/drowsy/idle_drowsy_fade_01.png` |
| `idle_drowsy_fade_02.png` | 250 | 280 | `assets/idle/drowsy/idle_drowsy_fade_02.png` |
| `idle_drowsy_heavy_01.png` | 250 | 280 | `assets/idle/drowsy/idle_drowsy_heavy_01.png` |
| `idle_drowsy_settle_01.png` | 250 | 280 | `assets/idle/drowsy/idle_drowsy_settle_01.png` |
| `idle_drowsy_settle_02.png` | 250 | 280 | `assets/idle/drowsy/idle_drowsy_settle_02.png` |
| `idle_drowsy_start_01.png` | 250 | 280 | `assets/idle/drowsy/idle_drowsy_start_01.png` |
| `idle_drowsy_yawn_01.png` | 250 | 280 | `assets/idle/drowsy/idle_drowsy_yawn_01.png` |
| `idle_drowsy_yawn_02.png` | 250 | 280 | `assets/idle/drowsy/idle_drowsy_yawn_02.png` |
| `idle_drowsy_yawn_03.png` | 250 | 280 | `assets/idle/drowsy/idle_drowsy_yawn_03.png` |
| `idle_drowsy_yawn_04.png` | 250 | 280 | `assets/idle/drowsy/idle_drowsy_yawn_04.png` |
| `idle_drowsy_yawn_05.png` | 250 | 280 | `assets/idle/drowsy/idle_drowsy_yawn_05.png` |
| `reminding_base_01.png` | 164 | 160 | `assets/reminding/reminding_base_01.png` |
| `reminding_peak_01.png` | 169 | 165 | `assets/reminding/reminding_peak_01.png` |
| `reminding_peak_02.png` | 168 | 170 | `assets/reminding/reminding_peak_02.png` |
| `reminding_relax_01.png` | 165 | 159 | `assets/reminding/reminding_relax_01.png` |
| `reminding_relax_02.png` | 165 | 160 | `assets/reminding/reminding_relax_02.png` |
| `reminding_wave_01.png` | 165 | 157 | `assets/reminding/reminding_wave_01.png` |
| `reminding_wave_02.png` | 165 | 158 | `assets/reminding/reminding_wave_02.png` |
| `sleep_napping_base_01.png` | 731 | 410 | `assets/sleep/napping/sleep_napping_base_01.png` |
| `sleep_napping_base_02.png` | 731 | 410 | `assets/sleep/napping/sleep_napping_base_02.png` |
| `sleep_napping_fall_01.png` | 701 | 405 | `assets/sleep/napping/sleep_napping_fall_01.png` |
| `sleep_napping_rise_01.png` | 748 | 374 | `assets/sleep/napping/sleep_napping_rise_01.png` |
| `sleep_napping_rise_02.png` | 748 | 374 | `assets/sleep/napping/sleep_napping_rise_02.png` |
| `sleep_napping_top_01.png` | 701 | 373 | `assets/sleep/napping/sleep_napping_top_01.png` |
| `sleep_napping_top_02.png` | 701 | 373 | `assets/sleep/napping/sleep_napping_top_02.png` |
| `talk_half_01.png` | 271 | 254 | `assets/talk/talk_half_01.png` |
| `talk_half_02.png` | 271 | 254 | `assets/talk/talk_half_02.png` |
| `talk_idle_01.png` | 281 | 246 | `assets/talk/talk_idle_01.png` |
| `talk_open_01.png` | 279 | 249 | `assets/talk/talk_open_01.png` |
| `talk_open_02.png` | 272 | 259 | `assets/talk/talk_open_02.png` |
| `wake_day_start_awake_01.png` | 219 | 274 | `assets/wake/day_start/wake_day_start_awake_01.png` |
| `wake_day_start_drowsy_01.png` | 240 | 269 | `assets/wake/day_start/wake_day_start_drowsy_01.png` |
| `wake_day_start_drowsy_02.png` | 228 | 261 | `assets/wake/day_start/wake_day_start_drowsy_02.png` |
| `wake_day_start_end_01.png` | 219 | 280 | `assets/wake/day_start/wake_day_start_end_01.png` |
| `wake_day_start_rise_01.png` | 242 | 266 | `assets/wake/day_start/wake_day_start_rise_01.png` |
| `wake_day_start_settle_01.png` | 221 | 280 | `assets/wake/day_start/wake_day_start_settle_01.png` |
| `wake_day_start_sleep_01.png` | 242 | 254 | `assets/wake/day_start/wake_day_start_sleep_01.png` |
| `wake_day_start_sleep_02.png` | 238 | 253 | `assets/wake/day_start/wake_day_start_sleep_02.png` |
| `wake_from_nap_awake_01.png` | 313 | 398 | `assets/wake/from_nap/wake_from_nap_awake_01.png` |
| `wake_from_nap_end_01.png` | 313 | 399 | `assets/wake/from_nap/wake_from_nap_end_01.png` |
| `wake_from_nap_rise_01.png` | 301 | 375 | `assets/wake/from_nap/wake_from_nap_rise_01.png` |
| `wake_from_nap_rise_02.png` | 304 | 393 | `assets/wake/from_nap/wake_from_nap_rise_02.png` |
| `wake_from_nap_settle_01.png` | 295 | 398 | `assets/wake/from_nap/wake_from_nap_settle_01.png` |
| `wake_from_nap_start_01.png` | 287 | 375 | `assets/wake/from_nap/wake_from_nap_start_01.png` |
| `walk_roaming_left_01.png` | 172 | 211 | `assets/walk/roaming/walk_roaming_left_01.png` |
| `walk_roaming_left_02.png` | 172 | 211 | `assets/walk/roaming/walk_roaming_left_02.png` |
| `walk_roaming_left_03.png` | 171 | 209 | `assets/walk/roaming/walk_roaming_left_03.png` |
| `walk_roaming_left_04.png` | 172 | 211 | `assets/walk/roaming/walk_roaming_left_04.png` |
| `walk_roaming_left_05.png` | 172 | 211 | `assets/walk/roaming/walk_roaming_left_05.png` |
| `walk_roaming_right_01.png` | 177 | 211 | `assets/walk/roaming/walk_roaming_right_01.png` |
| `walk_roaming_right_02.png` | 194 | 213 | `assets/walk/roaming/walk_roaming_right_02.png` |
| `walk_roaming_right_03.png` | 202 | 218 | `assets/walk/roaming/walk_roaming_right_03.png` |
| `walk_roaming_right_04.png` | 202 | 218 | `assets/walk/roaming/walk_roaming_right_04.png` |
| `walk_roaming_right_05.png` | 177 | 211 | `assets/walk/roaming/walk_roaming_right_05.png` |
| `walk_targeted_left_01.png` | 251 | 254 | `assets/walk/targeted/walk_targeted_left_01.png` |
| `walk_targeted_left_02.png` | 254 | 255 | `assets/walk/targeted/walk_targeted_left_02.png` |
| `walk_targeted_lft_03.png` | 265 | 267 | `assets/walk/targeted/walk_targeted_lft_03.png` |
| `walk_targeted_right_01.png` | 251 | 254 | `assets/walk/targeted/walk_targeted_right_01.png` |
| `walk_targeted_right_02.png` | 254 | 255 | `assets/walk/targeted/walk_targeted_right_02.png` |
| `walk_targeted_right_03.png` | 265 | 267 | `assets/walk/targeted/walk_targeted_right_03.png` |


## 附录B：更新日志
**V1.1版本变更摘要**：

1. **新增 walk/targeted 向左动画帧**：将原动画资产三帧内容扩充至6帧，向左、向右方向各对应三帧

2. **新增对应向左帧功能定义**：详细内容见walk/targeted帧功能定义部分

3. **新增对应向左方案设计**：内容见见walk/targeted预定方案部分


**V1.1.1版本更新摘要**：

1. **新增walk/targeted实现备注**：保留原始翻转向左帧，实现方式改为使用CSS`scaleX(-1)`做水平镜像

**V1.2.0 版本更新摘要**

1. **新增统一资源规格**：见本文档第二节`2.全局资源规格`部分

2. **新增资源参数附录**：见本文档`附录A：图片尺寸参数`

3. **重构了文档格式**

**V1.2.1版本更新摘要**

1. **重构了`预定方案`帧顺序表述方式**：帧顺序由原始的图片素材序列改为对应图片索引

2. **重构了idle.drowsy预定方案及对应帧功能定义**

**V1.2.2版本更新摘要**

1. **idle.drowsy 预定方案同步为三段式口径**：明确区分“进入段 / 单帧驻留循环 / 短退出段”，并与 v0.4 打断规则保持一致

2. **修正 goodbye 帧功能表语义**：将 `goodbye_fade_01` 视为淡出前过渡/停顿帧，将 `goodbye_end_01` 视为最终淡出/消失帧，以保持与当前预定方案一致

3. **明确 `idle_drowsy_fade_02` 为备用帧**：当前不纳入基准播放链，保留为后续参数微调或扩展使用
4. **修改本文档命名方式**：将版本号集成在文档内部，文档更名`ani_resources.md`，文件名与文档名保持一致。

**V1.2.3版本更新摘要**

1. **收敛 talk 段落为当前接口事实**：明确 `talking` 当前仅支持 loop；未开放 `talking exit intent` / `talking.finish` / dialog.close，自然结束回 idle.awake 标注为【非当前实现】。

2. **收敛 sleep/napping 备注为当前实现事实**：保留 enter(sleep_napping_fall_01) + 呼吸 ping-pong loop 作为当前真值；将用户 pat 微反应统一标注为【当前不采用，仅存档】。

3. **统一 walk/targeted 左向命名与主链说明**：统一使用 walk_targeted_lft_03 命名；明确“右向直播 + 左向 scaleX(-1) 镜像”为【当前运行主链】；左向原始帧保留为【当前不采用，仅存档】。

4. **强化 idle_drowsy_fade_02 非主链标注**：在帧功能定义中明确该帧【当前不采用，仅存档】，不纳入基准播放链。

5. **统一本轮涉及段落的未来方案标注口径**：新增/统一使用【当前不采用，仅存档】与【非当前实现】标记，避免与当前事实混读。
