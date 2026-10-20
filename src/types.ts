export type TimeOfDay = 'morning' | 'afternoon' | 'evening' | 'night';
export type Intensity = 'faint' | 'moderate' | 'strong';
export type SmellType = 'rotten-egg' | 'sulfur' | 'chemical' | 'other';
export type WindCondition = 'calm' | 'light-breeze' | 'windy' | 'unknown';

export interface GasReport {
  id: string;
  lat: number;
  lng: number;
  timeOfDay: TimeOfDay;
  observedDate: string; // YYYY-MM-DD
  observedTime: string; // e.g. "08:30 AM"
  intensity: Intensity;
  smellType: SmellType;
  windCondition: WindCondition;
  windDirection?: string;
  notes: string;
  reportedBy: string; // Name, initials or "Anonymous Neighbor"
  createdAt: string; // ISO 8601
}

export interface NewReportInput {
  lat: number;
  lng: number;
  timeOfDay: TimeOfDay;
  observedDate: string;
  observedTime: string;
  intensity: Intensity;
  smellType: SmellType;
  windCondition: WindCondition;
  windDirection?: string;
  notes: string;
  reportedBy?: string;
}

export interface FilterState {
  timeOfDay: TimeOfDay[];
  intensity: Intensity[];
  date: string; // 'all' or specific date
}

export const TIME_OF_DAY_CONFIG: Record<
  TimeOfDay,
  { label: string; timeRange: string; color: string; bg: string; border: string; emoji: string }
> = {
  morning: {
    label: 'Morning',
    timeRange: '6 AM – 12 PM',
    color: '#eab308',
    bg: '#fef9c3',
    border: '#ca8a04',
    emoji: '🌅'
  },
  afternoon: {
    label: 'Afternoon',
    timeRange: '12 PM – 6 PM',
    color: '#0284c7',
    bg: '#e0f2fe',
    border: '#0369a1',
    emoji: '☀️'
  },
  evening: {
    label: 'Evening',
    timeRange: '6 PM – 10 PM',
    color: '#e11d48',
    bg: '#ffe4e6',
    border: '#be123c',
    emoji: '🌆'
  },
  night: {
    label: 'Night',
    timeRange: '10 PM – 6 AM',
    color: '#7c3aed',
    bg: '#ede9fe',
    border: '#6d28d9',
    emoji: '🌙'
  }
};

export const INTENSITY_CONFIG: Record<
  Intensity,
  { label: string; badge: string; description: string; haloSize: number }
> = {
  faint: {
    label: 'Faint Whiff',
    badge: 'Hint of smell',
    description: 'Caught a light, quick whiff outdoors',
    haloSize: 28
  },
  moderate: {
    label: 'Noticeable',
    badge: 'Clear smell',
    description: 'Distinct natural gas / mercaptan odor',
    haloSize: 38
  },
  strong: {
    label: 'Strong / Acrid',
    badge: 'Strong odor',
    description: 'Heavy, persistent or alarming odor',
    haloSize: 48
  }
};
