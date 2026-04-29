import { useEffect, useRef } from 'react';
import {
  PET_CANVAS_ROOT_CLASS,
  SpriteAnimationPlayer,
  type AnimationPlayer,
  type AnimationPlayerOptions,
  type PlayParams,
} from './AnimationPlayer';
import './effects.css';

export interface PetCanvasProps {
  className?: string;
  assetRoot?: string;
  displayHeightPx?: number;
  autoPreload?: boolean;
  autoPlay?: PlayParams<'idle.awake'>;
  mode?: "default" | "dialog";
  onReady?: (player: AnimationPlayer) => void;
}

/**
 * AnimationPlayer 的一个轻量 React 消费者。
 * 核心播放逻辑仍在 SpriteAnimationPlayer 中，本组件仅负责挂载 DOM 与生命周期清理。
 */
export function PetCanvas({
  className,
  assetRoot = 'assets',
  displayHeightPx = 192,
  autoPreload = true,
  autoPlay,
  mode = "default",
  onReady,
}: PetCanvasProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const playerRef = useRef<SpriteAnimationPlayer | null>(null);

  useEffect(() => {
    if (!rootRef.current) {
      return;
    }

    const options: AnimationPlayerOptions = {
      rootElement: rootRef.current,
      assetRoot,
      targetDisplayHeightPx: displayHeightPx,
    };

    const player = new SpriteAnimationPlayer(options);
    playerRef.current = player;
    onReady?.(player);

    let disposed = false;

    const boot = async () => {
      if (autoPreload) {
        await player.preloadAll();
      }
      if (disposed || !autoPlay) {
        return;
      }
      player.play(autoPlay);
    };

    void boot();

    return () => {
      disposed = true;
      player.dispose();
      playerRef.current = null;
    };
  }, [assetRoot, autoPlay, autoPreload, displayHeightPx, onReady]);

  return (
    <div
      ref={rootRef}
      data-mode={mode}
      className={[
        PET_CANVAS_ROOT_CLASS,
        `pet-canvas-mode-${mode}`,
        className,
      ].filter(Boolean).join(' ')}
    />
  );
}

export default PetCanvas;
