export interface SubTask {
  id: string;
  text: string;
  completed: boolean;
}

export interface Reminder {
  isoString: string;
  recurrence?: 'daily' | 'weekly' | 'yearly' | 'monthly';
  hasNotified?: boolean;
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

export enum FilterType {
  ALL = 'ALL',
  ACTIVE = 'ACTIVE',
  COMPLETED = 'COMPLETED'
}

export enum ThemeColor {
  INDIGO = 'indigo',
  ROSE = 'rose',
  EMERALD = 'emerald',
  AMBER = 'amber'
}