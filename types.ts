
export interface SubTask {
  id: string;
  text: string;
  completed: boolean;
}

export interface Reminder {
  isoString: string;
  recurrence?: 'daily' | 'weekly' | 'yearly' | 'monthly';
  hasNotified?: boolean;
  type?: 'notification' | 'alarm';
}

export interface Task {
  id: string;
  text: string;
  completed: boolean;
  createdAt: number;
  subtasks: SubTask[];
  isAiGenerating?: boolean; // UI state for loading
  category?: string;
  reminder?: Reminder;
}

export enum AppSection {
  TASKS = 'TASKS',
  REMINDERS = 'REMINDERS',
  BIRTHDAYS = 'BIRTHDAYS'
}

export enum ThemeColor {
  INDIGO = 'indigo',
  ROSE = 'rose',
  EMERALD = 'emerald',
  AMBER = 'amber'
}
