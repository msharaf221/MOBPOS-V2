// ============================================================
//  Hook لاستخدام حالة وميزات المزامنة السحابية في مكونات React
// ============================================================

import { useState, useEffect, useCallback } from 'react';
import { syncEngine } from '../services/SyncEngine';
import type { SyncEngineState, SyncConfig } from '../types/sync';

export function useSyncEngine() {
  const [syncState, setSyncState] = useState<SyncEngineState>(() => syncEngine.getState());

  useEffect(() => {
    const unsubscribe = syncEngine.subscribe((state) => {
      setSyncState(state);
    });
    return unsubscribe;
  }, []);

  const triggerSyncNow = useCallback(async () => {
    return await syncEngine.syncNow();
  }, []);

  const updateConfig = useCallback((cfg: Partial<SyncConfig>) => {
    syncEngine.saveConfig(cfg);
  }, []);

  const clearOutbox = useCallback(async () => {
    await syncEngine.clearOutbox();
  }, []);

  return {
    ...syncState,
    triggerSyncNow,
    updateConfig,
    clearOutbox,
    loadConfig: () => syncEngine.loadConfig(),
    signInWithPassword: (email: string, pass: string) => syncEngine.signInWithPassword(email, pass),
    signOut: () => syncEngine.signOut(),
    pushAllSnapshots: () => syncEngine.pushAllSnapshots(),
    pushStoreSnapshots: (stores: string[]) => syncEngine.pushStoreSnapshots(stores),
    pullAllSnapshots: () => syncEngine.pullAllSnapshots(),
  };
}
