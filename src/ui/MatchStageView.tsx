import { useEffect, useRef, type MutableRefObject } from 'react';
import type { Hex, MatchState } from '../engine';
import { MatchStage } from '../match/stage';
import type { Highlight } from './Pitch';

/** The painted pitch with the match on it (three.js), as a React component. */
export function MatchStageView(props: {
  state: MatchState;
  active?: string;
  highlights: Highlight[];
  onHex: (h: Hex) => void;
  stageRef: MutableRefObject<MatchStage | null>;
}) {
  const host = useRef<HTMLDivElement>(null);
  const { state, active, highlights, onHex, stageRef } = props;

  useEffect(() => {
    const stage = new MatchStage(host.current!);
    stageRef.current = stage;
    // Handle for browser automation and console poking.
    (window as unknown as { corecupStage?: MatchStage }).corecupStage = stage;
    return () => {
      stage.dispose();
      stageRef.current = null;
    };
  }, [stageRef]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    stage.onHex = onHex;
    stage.sync(state, { active, highlights });
  });

  return <div className="stage" ref={host} role="img" aria-label="The pitch" />;
}
