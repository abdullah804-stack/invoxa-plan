import { addDays } from '@invoxa/shared';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import type { ReminderList } from '../api/types';

/**
 * Due-date reminders are local notifications: no push service, no server email
 * and no paid plan. They are best-effort, so every call is wrapped and a blocked
 * permission simply leaves the in-app card as the reminder.
 */

const PREFIX = 'invoxa-due-';

if (Platform.OS !== 'web') {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
}

export async function ensureNotificationPermission(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  try {
    const current = await Notifications.getPermissionsAsync();
    if (current.granted) return true;
    if (!current.canAskAgain) return false;
    const asked = await Notifications.requestPermissionsAsync();
    return asked.granted;
  } catch {
    return false;
  }
}

function reminderInstant(dueDate: string, daysBefore: number, hour: number): Date {
  const [year, month, day] = addDays(dueDate, -daysBefore).split('-').map(Number) as [
    number,
    number,
    number,
  ];
  return new Date(year, month - 1, day, hour, 0, 0, 0);
}

function dueEntry(clientName: string | null, number: string | null, dueDate: string) {
  const who = clientName ?? 'A client';
  const label = number ? `${number} for ${who}` : `The invoice for ${who}`;
  return `${label} is due on ${dueDate}.`;
}

/**
 * Reconciles the phone's scheduled reminders with the current due list: keeps
 * what matches, cancels what no longer applies and schedules what is new.
 */
export async function syncDueReminders(reminders: ReminderList | undefined): Promise<void> {
  if (Platform.OS === 'web' || !reminders) return;

  try {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    const ours = scheduled.filter((item) => item.identifier.startsWith(PREFIX));
    const permissions = await Notifications.getPermissionsAsync();

    const wanted = new Map<string, { date: Date; title: string; body: string; id: string }>();

    if (reminders.settings.enabled && permissions.granted) {
      const now = Date.now();
      for (const item of reminders.dueSoon) {
        const date = reminderInstant(
          item.dueDate,
          reminders.settings.daysBefore,
          reminders.settings.hour,
        );
        if (date.getTime() <= now) continue;
        wanted.set(`${PREFIX}${item.id}`, {
          date,
          id: item.id,
          title: item.daysUntilDue <= 1 ? 'Invoice due tomorrow' : 'Invoice due soon',
          body: dueEntry(item.clientName, item.number, item.dueDate),
        });
      }
    }

    await Promise.all(
      ours
        .filter((item) => !wanted.has(item.identifier))
        .map((item) => Notifications.cancelScheduledNotificationAsync(item.identifier)),
    );

    for (const [identifier, entry] of wanted) {
      if (ours.some((item) => item.identifier === identifier)) continue;
      await Notifications.scheduleNotificationAsync({
        identifier,
        content: {
          title: entry.title,
          body: entry.body,
          data: { documentId: entry.id },
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: entry.date,
        },
      });
    }
  } catch {
    // A notification that cannot be scheduled must never break a screen.
  }
}
