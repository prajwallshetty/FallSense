import { create } from 'zustand';
import { FallAlert } from '../types';

interface AlertState {
  activeAlert: FallAlert | null;
  countdown: number;
  isTimerActive: boolean;
  
  triggerFall: (alert: Omit<FallAlert, 'alertId' | 'status'>) => void;
  acknowledgeAlert: (userId: string) => void;
  cancelAlert: () => void;
  tickCountdown: () => void;
  stopAlertCountdown: () => void;
}

export const useAlertStore = create<AlertState>((set, get) => {
  let intervalId: ReturnType<typeof setInterval> | null = null;

  const clearTimer = () => {
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
    }
  };

  return {
    activeAlert: null,
    countdown: 30,
    isTimerActive: false,

    triggerFall: (alertData) => {
      clearTimer();
      
      const newAlert: FallAlert = {
        ...alertData,
        alertId: `alert_${Date.now()}`,
        status: 'pending'
      };

      set({
        activeAlert: newAlert,
        countdown: 30,
        isTimerActive: true
      });

      // Start internal 1s timer countdown
      intervalId = setInterval(() => {
        get().tickCountdown();
      }, 1000);
    },

    tickCountdown: () => {
      const currentCountdown = get().countdown;
      const active = get().activeAlert;

      if (!active) {
        clearTimer();
        set({ isTimerActive: false });
        return;
      }

      if (currentCountdown <= 1) {
        clearTimer();
        // Escalated status - trigger automatic dispatch SMS/Call
        set({
          countdown: 0,
          isTimerActive: false,
          activeAlert: {
            ...active,
            status: 'escalated'
          }
        });
        console.log('ALERT ESCALATED: Alerting contacts automatically.');
      } else {
        set({ countdown: currentCountdown - 1 });
      }
    },

    acknowledgeAlert: (userId) => {
      clearTimer();
      const active = get().activeAlert;
      if (active) {
        set({
          activeAlert: {
            ...active,
            status: 'acknowledged',
            resolvedBy: userId,
            resolvedAt: new Date().toISOString()
          },
          isTimerActive: false,
          countdown: 0
        });
      }
    },

    cancelAlert: () => {
      clearTimer();
      const active = get().activeAlert;
      if (active) {
        set({
          activeAlert: {
            ...active,
            status: 'false_alarm',
            resolvedAt: new Date().toISOString()
          },
          isTimerActive: false,
          countdown: 0
        });
      }
      
      // Auto-clear active alert after short delay so UI resets
      setTimeout(() => {
        set({ activeAlert: null });
      }, 2000);
    },

    stopAlertCountdown: () => {
      clearTimer();
      set({ isTimerActive: false });
    }
  };
});
