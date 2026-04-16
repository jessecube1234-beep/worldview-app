import { useEffect } from 'react';
import { initWorldViewApp } from '../app.js';

export function useWorldViewApp() {
  useEffect(() => {
    const destroy = initWorldViewApp();
    return () => {
      if (typeof destroy === 'function') destroy();
    };
  }, []);
}
