import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import type { WheelEvent } from "react";
import { chatContextBuilder } from "../../services/ChatContextBuilder";
import { deepSeekService } from "../../services/DeepSeekService";
import { chatHistoryStore, type ChatMessageRecord } from "../../services/chat-history-store";
import InputBar from "./InputBar";
import MessageBubble from "./MessageBubble";
import {
  ACTIVE_MESSAGE_FADE,
  DIALOG_TRANSITION,
  HISTORY_REVIEW,
} from "./dialog-tokens";
import type {
  ChatBubbleViewModel,
  DialogMessageRole,
  DialogMessageStatus,
  DialogUiState,
  TalkingInteractionHandle,
  TalkingInteractionProps,
} from "./dialog-types";
import { DIALOG_PET_ANCHOR_IN_WINDOW } from "./dialog-transition";
import { useDialogAnchorTransition } from "./useDialogAnchorTransition";
import "./TalkingInteraction.css";

const FALLBACK_FAILURE_HINTS = ["\u518d\u8bf4\u4e00\u904d", "\u8111\u888b\u5361\u4f4f", "\u8bfb\u4e0d\u5230"];
const LONG_TEXT_DEMO_CONTENT =
  "\u4eca\u5929\u5148\u628a\u6700\u5173\u952e\u7684\u4e00\u4ef6\u4e8b\u63a8\u8fdb\u5230\u53ef\u63d0\u4ea4\u72b6\u6001\uff0c\u518d\u56de\u5934\u8865\u8fb9\u89d2\u3002\u4f60\u4e0d\u7528\u4e00\u6b21\u628a\u6240\u6709\u4efb\u52a1\u505a\u5b8c\uff0c\u5148\u62ff\u4e0b\u6700\u5361\u4f60\u7684\u70b9\uff0c\u540e\u7eed\u8282\u594f\u4f1a\u81ea\u7136\u987a\u8d77\u6765\u3002";

function formatDisplayTime(date: Date): string {
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

function createDialogSessionId(now = new Date()): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const suffix = Math.random().toString(36).slice(2, 8).padEnd(6, "0").slice(0, 6);
  return `dialog-${year}-${month}-${day}-${suffix}`;
}

function createMessage(
  role: DialogMessageRole,
  content: string,
  status: DialogMessageStatus = "sent",
  ephemeral = true,
): ChatBubbleViewModel {
  const now = new Date();
  const iso = now.toISOString();
  return {
    id: `${role}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    role,
    content,
    createdAtIso: iso,
    displayTime: formatDisplayTime(now),
    status,
    ephemeral,
  };
}

function sortByChronologicalOrder(records: ChatMessageRecord[]): ChatMessageRecord[] {
  return [...records].sort((a, b) => {
    if (typeof a.id === "number" && typeof b.id === "number") {
      return a.id - b.id;
    }
    return Date.parse(a.createdAtIso) - Date.parse(b.createdAtIso);
  });
}

function mapRecordToBubble(record: ChatMessageRecord): ChatBubbleViewModel | null {
  if (record.role === "system") {
    return null;
  }
  return {
    id: `history-${record.id ?? record.createdAtIso}`,
    role: record.role,
    content: record.content,
    createdAtIso: record.createdAtIso,
    displayTime: formatDisplayTime(new Date(record.createdAtIso)),
    status: "sent",
    ephemeral: false,
  };
}

function looksLikeServiceFailure(text: string): boolean {
  if (!text.trim()) {
    return true;
  }
  return FALLBACK_FAILURE_HINTS.some((hint) => text.includes(hint));
}

const TalkingInteraction = forwardRef<TalkingInteractionHandle, TalkingInteractionProps>(
  function TalkingInteraction(
    {
      open,
      visible,
      onRequestClose,
      onTransitionPhaseChange,
      onClosingWindowPhase,
      onSessionChange,
    },
    ref,
  ) {
    const inputRef = useRef<HTMLTextAreaElement | null>(null);
    const requestVersionRef = useRef(0);
    const activeSessionIdRef = useRef("");
    const messagesRef = useRef<ChatBubbleViewModel[]>([]);

    const [dialogState, setDialogState] = useState<DialogUiState>("idle");
    const [inputValue, setInputValue] = useState("");
    const [busy, setBusy] = useState(false);
    const [messages, setMessages] = useState<ChatBubbleViewModel[]>([]);
    const [historyMessages, setHistoryMessages] = useState<ChatBubbleViewModel[]>([]);
    const [historyLoading, setHistoryLoading] = useState(false);
    const [fadeClock, setFadeClock] = useState(0);
    const [measureSignal, setMeasureSignal] = useState(0);

    const updateMessages = useCallback(
      (updater: (prev: ChatBubbleViewModel[]) => ChatBubbleViewModel[]) => {
        setMessages((prev) => {
          const next = updater(prev);
          messagesRef.current = next;
          return next;
        });
      },
      [],
    );

    const appendToStore = useCallback(
      async (role: DialogMessageRole, content: string) => {
        const sessionId = activeSessionIdRef.current;
        if (!sessionId) {
          return;
        }
        await chatHistoryStore.append({
          sessionId,
          role,
          content,
          createdAtIso: new Date().toISOString(),
        });
      },
      [],
    );

    const updateMessageStatus = useCallback(
      (id: string, status: DialogMessageStatus) => {
        updateMessages((prev) => prev.map((message) => (
          message.id === id ? { ...message, status } : message
        )));
      },
      [updateMessages],
    );

    const enterHistoryReview = useCallback(async () => {
      const sessionId = activeSessionIdRef.current;
      if (!sessionId) {
        return;
      }

      setDialogState("history_review");
      setHistoryLoading(true);
      try {
        const sessionRecords = await chatHistoryStore.listBySession(
          sessionId,
          undefined,
          HISTORY_REVIEW.pageSize,
        );
        const shouldFallback = messagesRef.current.length < HISTORY_REVIEW.fallbackThreshold;
        const sourceRecords = shouldFallback
          ? await chatHistoryStore.listRecent(HISTORY_REVIEW.pageSize)
          : sessionRecords;

        const bubbles = sortByChronologicalOrder(sourceRecords)
          .map(mapRecordToBubble)
          .filter((record): record is ChatBubbleViewModel => record !== null);

        setHistoryMessages(bubbles);
      } catch (error) {
        console.error("Failed to load history review:", error);
        setHistoryMessages([]);
      } finally {
        setHistoryLoading(false);
      }
    }, []);

    const sendMessage = useCallback(async () => {
      const trimmed = inputValue.trim();
      if (!open || busy || !trimmed) {
        return;
      }

      if (dialogState === "history_review") {
        setDialogState("idle");
      } else {
        setDialogState("message_sent");
      }

      setInputValue("");
      const userMessage = createMessage("user", trimmed, "pending", true);
      updateMessages((prev) => [...prev, userMessage]);

      const sessionId = activeSessionIdRef.current;
      const deepSeekMessages = await chatContextBuilder.getChatContext(trimmed, sessionId);

      try {
        await appendToStore("user", trimmed);
        updateMessageStatus(userMessage.id, "sent");
      } catch (error) {
        console.error("Failed to append user message:", error);
        updateMessageStatus(userMessage.id, "failed");
      }

      setBusy(true);
      setDialogState("ichan_typing");

      const typingBubble = createMessage("ichan", "\u6b63\u5728\u601d\u8003\u4e2d...", "pending", true);
      updateMessages((prev) => [...prev, typingBubble]);

      const requestVersion = ++requestVersionRef.current;
      try {
        const reply = (await deepSeekService.chat(deepSeekMessages)).trim();
        if (requestVersionRef.current !== requestVersion) {
          return;
        }

        updateMessages((prev) => prev.filter((message) => message.id !== typingBubble.id));

        if (looksLikeServiceFailure(reply)) {
          updateMessages((prev) => [
            ...prev,
            createMessage("ichan", reply || "\u8fde\u63a5\u670d\u52a1\u5931\u8d25\uff0c\u8bf7\u7a0d\u540e\u518d\u8bd5\u3002", "failed", false),
          ]);
          setDialogState("conversation_done");
          return;
        }

        updateMessages((prev) => [...prev, createMessage("ichan", reply, "sent", true)]);
        setDialogState(reply.length > 72 ? "long_text_wrap" : "conversation_done");

        try {
          await appendToStore("ichan", reply);
        } catch (error) {
          console.error("Failed to append ichan reply:", error);
        }
      } catch (error) {
        if (requestVersionRef.current !== requestVersion) {
          return;
        }
        console.error("DeepSeek chat failed:", error);
        updateMessages((prev) => [
          ...prev.filter((message) => message.id !== typingBubble.id),
          createMessage("ichan", "\u8fde\u63a5\u670d\u52a1\u5931\u8d25\uff0c\u8bf7\u7a0d\u540e\u518d\u8bd5\u3002", "failed", false),
        ]);
        setDialogState("conversation_done");
      } finally {
        if (requestVersionRef.current === requestVersion) {
          setBusy(false);
        }
      }
    }, [
      appendToStore,
      busy,
      dialogState,
      inputValue,
      open,
      updateMessageStatus,
      updateMessages,
    ]);

    const appendMockMessage = useCallback((role: DialogMessageRole, content: string) => {
      if (!open) {
        return;
      }
      updateMessages((prev) => [...prev, createMessage(role, content, "sent", true)]);
      void appendToStore(role, content).catch((error) => {
        console.error("Failed to append mock message:", error);
      });
    }, [appendToStore, open, updateMessages]);

    const handleEmojiClick = useCallback(() => {
      console.info("TODO(B2-9): emoji panel is not implemented in v2.1");
    }, []);

    const handleStageWheel = useCallback((event: WheelEvent<HTMLDivElement>) => {
      event.stopPropagation();
      if (event.deltaY < 0) {
        event.preventDefault();
        void enterHistoryReview();
        return;
      }
      if (event.deltaY > 0 && dialogState === "history_review") {
        setDialogState("idle");
      }
    }, [dialogState, enterHistoryReview]);

    useImperativeHandle(ref, () => ({
      appendMockIchanMessage: (content) => {
        appendMockMessage("ichan", content ?? "\u6536\u5230\uff0c\u6211\u5728\u8fd9\u8fb9\u770b\u7740\u4f60\u3002");
      },
      appendMockUserMessage: (content) => {
        appendMockMessage("user", content ?? "\u6211\u5148\u628a\u5f53\u524d\u4efb\u52a1\u63a8\u8fdb\u4e00\u4e0b\u3002");
      },
      runLongTextDemo: () => {
        appendMockMessage("user", LONG_TEXT_DEMO_CONTENT);
        appendMockMessage("ichan", LONG_TEXT_DEMO_CONTENT);
        setDialogState("long_text_wrap");
      },
      runHistoryReviewDemo: async () => {
        await enterHistoryReview();
      },
    }), [appendMockMessage, enterHistoryReview]);

    useEffect(() => {
      messagesRef.current = messages;
    }, [messages]);

    useEffect(() => {
      if (!open) {
        setBusy(false);
        return;
      }

      requestVersionRef.current += 1;
      const nextSessionId = createDialogSessionId();
      activeSessionIdRef.current = nextSessionId;
      onSessionChange?.(nextSessionId);

      setDialogState("idle");
      setInputValue("");
      setBusy(false);
      setHistoryLoading(false);
      setHistoryMessages([]);
      updateMessages(() => []);
    }, [onSessionChange, open, updateMessages]);

    useEffect(() => {
      if (!open || !visible) {
        return;
      }
      const focusTimer = window.setTimeout(() => {
        inputRef.current?.focus();
      }, DIALOG_TRANSITION.openingMs);
      return () => {
        window.clearTimeout(focusTimer);
      };
    }, [open, visible]);

    useEffect(() => {
      if (!open) {
        return;
      }

      const handleEsc = (event: KeyboardEvent) => {
        if (event.key !== "Escape") {
          return;
        }
        event.preventDefault();
        onRequestClose("user");
      };
      window.addEventListener("keydown", handleEsc);
      return () => {
        window.removeEventListener("keydown", handleEsc);
      };
    }, [onRequestClose, open]);

    useEffect(() => {
      if (!open || dialogState === "history_review" || messages.length === 0) {
        return;
      }
      const timer = window.setInterval(() => {
        setFadeClock((value) => value + 1);
      }, 240);
      return () => {
        window.clearInterval(timer);
      };
    }, [dialogState, messages.length, open]);

    const displayMessages = useMemo(
      () => (dialogState === "history_review" ? historyMessages : messages),
      [dialogState, historyMessages, messages],
    );

    useEffect(() => {
      if (!open) {
        return;
      }
      setMeasureSignal((value) => value + 1);
    }, [open, historyLoading, dialogState, displayMessages]);

    const {
      phase,
      rootRef,
      anchorRef,
      dialogStyleVars,
      requestRemeasure,
    } = useDialogAnchorTransition({
      open,
      isDialogRequestedOpen: visible,
      measureSignal,
      onAfterOpen: () => {
        requestRemeasure();
      },
      onAfterClose: () => {
        requestRemeasure();
      },
      onClosingWindowPhase,
      onPhaseChange: onTransitionPhaseChange,
    });

    if (!open) {
      return null;
    }

    const canSend = inputValue.trim().length > 0;
    const now = Date.now() + fadeClock;
    const shouldFade = (message: ChatBubbleViewModel, index: number): boolean => {
      if (dialogState === "history_review") {
        return false;
      }
      if (!message.ephemeral || message.status === "failed") {
        return false;
      }
      if (index >= displayMessages.length - ACTIVE_MESSAGE_FADE.preserveLatestCount) {
        return false;
      }
      const createdAtMs = Date.parse(message.createdAtIso);
      return now - createdAtMs >= ACTIVE_MESSAGE_FADE.delayMs;
    };

    return (
      <div
        ref={rootRef}
        className="interactive-dialog-shell"
        data-dialog-phase={phase}
        style={dialogStyleVars}
      >
        <section
          className="dialog-shell"
          role="dialog"
          aria-label="interactive_box"
          data-reveal-item="true"
          data-reveal-key="dialog-shell"
        >
          <div className="talking-bg" />
          <div
            ref={anchorRef}
            className="dialog-anchor-box"
            style={{
              left: `${DIALOG_PET_ANCHOR_IN_WINDOW.x}px`,
              top: `${DIALOG_PET_ANCHOR_IN_WINDOW.y}px`,
              width: `${DIALOG_PET_ANCHOR_IN_WINDOW.width}px`,
              height: `${DIALOG_PET_ANCHOR_IN_WINDOW.height}px`,
            }}
          />

          <header
            className="dialog-header reveal-item"
            data-reveal-item="true"
            data-reveal-key="dialog-header"
            data-tauri-drag-region
          >
            <div className="dialog-brand-mark">i</div>
            <div className="dialog-title">{"i\u9171"}</div>
            <div className="dialog-controls">
              <button
                type="button"
                className="dialog-control-button"
                aria-label="minimize-dialog"
                onClick={() => onRequestClose("user")}
              >
                -
              </button>
              <button
                type="button"
                className="dialog-control-button"
                aria-label="close-dialog"
                onClick={() => onRequestClose("user")}
              >
                {"\u00d7"}
              </button>
            </div>
          </header>

          <div className="dialog-stage" onWheel={handleStageWheel}>
            {displayMessages.map((message, index) => (
              <MessageBubble
                key={message.id}
                message={message}
                faded={shouldFade(message, index)}
              />
            ))}
            {historyLoading ? (
              <div
                className="dialog-history-hint reveal-item"
                data-reveal-item="true"
                data-reveal-key="dialog-history-hint"
              >
                {"\u52a0\u8f7d\u5386\u53f2\u4e2d..."}
              </div>
            ) : null}
          </div>

          <InputBar
            ref={inputRef}
            value={inputValue}
            busy={busy}
            canSend={canSend}
            onChange={(nextValue) => {
              setInputValue(nextValue);
              setDialogState(nextValue.trim() ? "user_typing" : "idle");
            }}
            onSend={() => {
              void sendMessage();
            }}
            onEmojiClick={handleEmojiClick}
          />
        </section>
      </div>
    );
  },
);

export default TalkingInteraction;
