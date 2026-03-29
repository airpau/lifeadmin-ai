import {
  Wifi, Landmark, UtensilsCrossed, Shield, Banknote, Smartphone, Home,
  Tv, Monitor, Car, Zap, MoreHorizontal, Dumbbell, Music, Gamepad2,
  Cloud, Heart, Lock, HandHeart, GraduationCap, PawPrint, ParkingCircle,
  Plane, Dice5, Receipt, CircleDollarSign, type LucideIcon, Droplets,
} from 'lucide-react';

interface CategoryConfig {
  label: string;
  icon: LucideIcon;
  color: string;
  bgColor: string;
}

export const CATEGORY_CONFIG: Record<string, CategoryConfig> = {
  broadband: { label: 'Broadband', icon: Wifi, color: 'text-blue-400', bgColor: 'bg-blue-400/10' },
  council_tax: { label: 'Council Tax', icon: Landmark, color: 'text-amber-400', bgColor: 'bg-amber-400/10' },
  food: { label: 'Food & Drink', icon: UtensilsCrossed, color: 'text-orange-400', bgColor: 'bg-orange-400/10' },
  insurance: { label: 'Insurance', icon: Shield, color: 'text-cyan-400', bgColor: 'bg-cyan-400/10' },
  loan: { label: 'Loans', icon: Banknote, color: 'text-red-400', bgColor: 'bg-red-400/10' },
  mobile: { label: 'Mobile', icon: Smartphone, color: 'text-violet-400', bgColor: 'bg-violet-400/10' },
  mortgage: { label: 'Mortgage', icon: Home, color: 'text-emerald-400', bgColor: 'bg-emerald-400/10' },
  streaming: { label: 'Streaming', icon: Tv, color: 'text-purple-400', bgColor: 'bg-purple-400/10' },
  software: { label: 'Software', icon: Monitor, color: 'text-indigo-400', bgColor: 'bg-indigo-400/10' },
  transport: { label: 'Transport', icon: Car, color: 'text-yellow-400', bgColor: 'bg-yellow-400/10' },
  utility: { label: 'Utilities', icon: Zap, color: 'text-green-400', bgColor: 'bg-green-400/10' },
  other: { label: 'Other', icon: MoreHorizontal, color: 'text-slate-400', bgColor: 'bg-slate-400/10' },
  fitness: { label: 'Fitness & Gym', icon: Dumbbell, color: 'text-rose-400', bgColor: 'bg-rose-400/10' },
  music: { label: 'Music', icon: Music, color: 'text-pink-400', bgColor: 'bg-pink-400/10' },
  gaming: { label: 'Gaming', icon: Gamepad2, color: 'text-fuchsia-400', bgColor: 'bg-fuchsia-400/10' },
  storage: { label: 'Cloud Storage', icon: Cloud, color: 'text-sky-400', bgColor: 'bg-sky-400/10' },
  healthcare: { label: 'Healthcare', icon: Heart, color: 'text-red-300', bgColor: 'bg-red-300/10' },
  security: { label: 'Security', icon: Lock, color: 'text-slate-300', bgColor: 'bg-slate-300/10' },
  charity: { label: 'Charity', icon: HandHeart, color: 'text-teal-400', bgColor: 'bg-teal-400/10' },
  education: { label: 'Education', icon: GraduationCap, color: 'text-blue-300', bgColor: 'bg-blue-300/10' },
  pets: { label: 'Pets', icon: PawPrint, color: 'text-amber-300', bgColor: 'bg-amber-300/10' },
  parking: { label: 'Parking', icon: ParkingCircle, color: 'text-gray-400', bgColor: 'bg-gray-400/10' },
  travel: { label: 'Travel', icon: Plane, color: 'text-sky-300', bgColor: 'bg-sky-300/10' },
  gambling: { label: 'Gambling', icon: Dice5, color: 'text-yellow-300', bgColor: 'bg-yellow-300/10' },
  bills: { label: 'Bills', icon: Receipt, color: 'text-orange-300', bgColor: 'bg-orange-300/10' },
  fee: { label: 'Fees', icon: CircleDollarSign, color: 'text-neutral-400', bgColor: 'bg-neutral-400/10' },
  water: { label: 'Water', icon: Droplets, color: 'text-cyan-300', bgColor: 'bg-cyan-300/10' },
};

export function getCategoryLabel(category: string): string {
  return CATEGORY_CONFIG[category]?.label || category.charAt(0).toUpperCase() + category.slice(1).replace(/_/g, ' ');
}

export function getCategoryColor(category: string): string {
  return CATEGORY_CONFIG[category]?.color || 'text-slate-400';
}

export function getCategoryBgColor(category: string): string {
  return CATEGORY_CONFIG[category]?.bgColor || 'bg-slate-400/10';
}

export function getCategoryIcon(category: string): LucideIcon {
  return CATEGORY_CONFIG[category]?.icon || MoreHorizontal;
}

/** All categories sorted alphabetically by label, for dropdowns */
export const SORTED_CATEGORIES = Object.entries(CATEGORY_CONFIG)
  .sort(([, a], [, b]) => a.label.localeCompare(b.label))
  .map(([key, config]) => ({ value: key, label: config.label }));
