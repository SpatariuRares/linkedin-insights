import { useCallback, useEffect, useRef, useState } from 'react';
import { loadState, saveState, type AppState } from '../lib/storage';

export function useAppState() {
  const [state, setState] = useState<AppState>(loadState);
  const [persisted, setPersisted] = useState(true);
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    setPersisted(saveState(state));
  }, [state]);

  const update = useCallback((fn: (s: AppState) => AppState) => setState(fn), []);

  return { state, update, replace: setState, persisted };
}
