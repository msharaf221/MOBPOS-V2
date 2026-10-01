import { useCallback } from 'react';
import { StoreState } from './types';

export function useNotificationsSlice(state: StoreState) {
    const { setNotifications } = state;

    const markNotificationAsRead = useCallback((id: string) => {
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, isRead: true } : n));
    }, [setNotifications]);
  

    const markAllNotificationsAsRead = useCallback(() => {
      setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
    }, [setNotifications]);
  

    const dismissNotification = useCallback((id: string) => {
      setNotifications(prev => prev.flatMap(n => {
        if (n.id !== id) return [n];
        // Auto alerts are kept but flagged dismissed, so the engine will not
        // resurrect them while their condition still holds. Anything else
        // (imported/legacy rows) is removed for good.
        return n.source === 'auto' ? [{ ...n, isRead: true, dismissed: true }] : [];
      }));
    }, [setNotifications]);
  

    const clearAllNotifications = useCallback(() => {
      setNotifications(prev => prev.flatMap(n =>
        n.source === 'auto' ? [{ ...n, isRead: true, dismissed: true }] : []
      ));
    }, [setNotifications]);
  

  return { markNotificationAsRead, markAllNotificationsAsRead, dismissNotification, clearAllNotifications };
}
