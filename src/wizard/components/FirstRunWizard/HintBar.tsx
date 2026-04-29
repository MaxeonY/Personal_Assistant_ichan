type HintBarProps = {
  testing: boolean;
  canTest: boolean;
  message: string;
  onTest: () => void;
};

export default function HintBar({ testing, canTest, message, onTest }: HintBarProps) {
  return (
    <div className="hint-bar">
      <p>{message}</p>
      <button
        type="button"
        className="secondary-button"
        disabled={!canTest || testing}
        onClick={onTest}
      >
        {testing ? "测试中" : "测试连接"}
      </button>
    </div>
  );
}
