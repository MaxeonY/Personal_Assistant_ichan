export type DialogUiState =
  | "idle"
  | "waiting_ichan_typing"
  | "user_typing"
  | "message_sent"
  | "ichan_replying"
  | "long_text_wrap"
  | "ichan_typing"
  | "conversation_done"
  | "history_review";

export type DialogTransitionPhase =
  | "measuring"
  | "compact"
  | "opening"
  | "open"
  | "closing.messages"
  | "closing.shell"
  | "closing.window";

export type DialogCloseReason = "user" | "timeout" | "service_done" | "error";
export type DialogMessageRole = "ichan" | "user";
export type DialogMessageStatus = "pending" | "sent" | "read" | "failed";

export interface ChatBubbleViewModel {
  id: string;
  role: DialogMessageRole;
  content: string;
  createdAtIso: string;
  displayTime: string;
  status: DialogMessageStatus;
  ephemeral: boolean;
}

export interface TalkingInteractionProps {
  open: boolean;
  visible: boolean;
  onRequestClose: (reason: DialogCloseReason) => void;
  onTransitionPhaseChange?: (phase: DialogTransitionPhase) => void;
  onClosingWindowPhase?: () => Promise<void> | void;
  onSessionChange?: (sessionId: string) => void;
}

export interface TalkingInteractionHandle {
  appendMockIchanMessage: (content?: string) => void;
  appendMockUserMessage: (content?: string) => void;
  runLongTextDemo: () => void;
  runHistoryReviewDemo: () => Promise<void>;
}
