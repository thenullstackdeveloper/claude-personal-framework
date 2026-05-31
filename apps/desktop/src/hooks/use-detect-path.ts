import { useCallback, useEffect, useRef, useState } from 'react';
import { type PathDetection, detectPath } from '../lib/api';

/**
 * Subscribes to the project role for a given path. Re-runs the detection
 * whenever `projectRoot` changes. Exposes `refresh()` so callers can force
 * a re-detection without changing the path — useful after `initialize`
 * succeeds (the path didn't change but the manifest now exists, so the
 * detection result does).
 *
 * Best-effort: a failed detection clears the cached value rather than
 * surfacing the error. Detection is a UI hint (do we show "Initialize"
 * or "Install"?), not authoritative state.
 *
 * Concurrent runs are tracked with a monotonic counter so an in-flight
 * detection is silently superseded by a later one — prevents the
 * out-of-order set-state when `refresh()` is called twice quickly or
 * the path changes mid-flight.
 */
export const useDetectPath = (
  projectRoot: string | null,
): { detection: PathDetection | null; refresh: () => void } => {
  const [detection, setDetection] = useState<PathDetection | null>(null);
  const runIdRef = useRef(0);

  const runDetection = useCallback(async () => {
    const myRunId = ++runIdRef.current;
    if (!projectRoot) {
      setDetection(null);
      return;
    }
    try {
      const d = await detectPath(projectRoot);
      if (runIdRef.current === myRunId) setDetection(d);
    } catch {
      if (runIdRef.current === myRunId) setDetection(null);
    }
  }, [projectRoot]);

  useEffect(() => {
    void runDetection();
  }, [runDetection]);

  const refresh = useCallback(() => {
    void runDetection();
  }, [runDetection]);

  return { detection, refresh };
};
