export const petBehaviorConfig = {
  app: {
    clickThroughShortcut: "Ctrl+Alt+P",//切换全局快捷键
    shortcutDebounceMs: 180,//快捷键防抖
    statusHideMs: 1800,//状态提示 Toast 自动隐藏时间
  },
  windowMovement: {
    edgePaddingPx: 8,//窗口贴近工作区边缘时保留的安全距离
    roamingSpeedPxPerSec: 52,//roaming 随机溜达时的窗口位移速度
    targetedSpeedPxPerSec: 180,//targeted_move 有目的移动时的窗口位移速度
    targetedArrivalThresholdPx: 8,//targeted_move 到达目标点的判定阈值
    targetedDefaultWorkareaX: 0.82,//targeted_move 默认目标点在工作区宽度的比例位置（0-1），相对于工作区左上角
  },
  stateTimers: {
    idleTimeoutMs: 1 * 60 * 1000,//从 idle.awake 进入 idle.drowsy 前，需要连续“无交互”持续多久
    drowsyToNapMs: 30 * 1000,//进入 idle.drowsy 后，停留多久再切到 idle.napping
    roamingMinMs: 3 * 1000,//roaming 状态持续的最短时间
    roamingMaxMs: 6 * 1000,//roaming 状态持续的最长时间
  },
  playback: {//数值越大，动画越慢；数值越小，动画越快
    idleAwakeMs: 125,//idle.awake 的主循环帧时长
    idleDrowsyEnterMs: 150,//idle.drowsy 进入段每帧时长
    idleDrowsyLoopMs: 760,//idle.drowsy 驻留段的循环节奏
    idleDrowsyExitMs: 120,//idle.drowsy 短退出段每帧时长
    idleNappingEnterMs: 420,//idle.napping 进入段时长
    idleNappingLoopMs: 260,//idle.napping 呼吸循环的每帧时长，趴睡呼吸节奏的核心
    talkingMs: 130,//talking 循环每帧时长，控制说话时嘴巴开合一轮有多快
    eatingMs: 120,//eating 每帧时长，控制“准备吃—咬—嚼—结束”这一串动作的节奏
    happyMs: 110,//happy 每帧时长，控制开心反馈的抬升、峰值、回落速度
    remindingMs: 110,//reminding 每帧时长，控制提醒时挥手、警觉、放松这一轮循环的快慢
    wakeDayStartMs: 180,//隔天苏醒 wake.day_start 每帧时长
    wakeFromNapMs: 120,//从小睡醒来 wake.from_nap 每帧时长，它代表被打断后，从趴睡状态快速恢复清醒的速度
    farewellMs: 150,//告别动画 farewell 每帧时长，对应的是 goodbye 的主序列：start -> wave -> fade -> end
    walkRoamingMs: 170,//roaming 步态动画的每帧时长，只控制“溜达时身体摆动”的帧速度，不控制桌面上真位移多快
    walkTargetedMs: 90,//targeted_move 步态动画的每帧时长
  },
  hungry: {
    thresholdDays: 3,
    evaluateOnStartup: true,
  },
  ui: {
    petDisplayHeightPx: 180,//宠物显示盒的统一显示高度，体感大小、命中区域&窗口视觉占比
  },
} as const;

export type PetBehaviorConfig = typeof petBehaviorConfig;
