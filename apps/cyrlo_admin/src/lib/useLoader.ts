import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { ApiError } from '../api/types';
import { errorMessage } from './apiMessage';

export type LoadState<T> =
  | { status: 'loading' }
  | { status: 'ready'; data: T }
  | { status: 'error'; message: string; httpStatus?: number };

/**
 * Loads data whenever `key` changes (or `reload` is called). Privileged 401s navigate to
 * /session-expired. Stale responses are ignored.
 */
export function useLoader<T>(fetcher: () => Promise<T>, key: string) {
  const navigate = useNavigate();
  const fetcherRef = useRef(fetcher);
  const [state, setState] = useState<LoadState<T>>({ status: 'loading' });
  const [tick, setTick] = useState(0);
  const requestId = useRef(0);

  useEffect(() => {
    fetcherRef.current = fetcher;
  });

  useEffect(() => {
    const id = ++requestId.current;
    setState({ status: 'loading' });
    fetcherRef
      .current()
      .then((data) => {
        if (id === requestId.current) setState({ status: 'ready', data });
      })
      .catch((err: unknown) => {
        if (id !== requestId.current) return;
        if (err instanceof ApiError && err.status === 401) {
          navigate('/session-expired', { replace: true });
          return;
        }
        setState({
          status: 'error',
          message: errorMessage(err, 'Failed to load'),
          httpStatus: err instanceof ApiError ? err.status : undefined,
        });
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fetcher is read via ref; key drives reloads
  }, [key, tick, navigate]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { state, reload };
}
