export type ColorPreset = 'default' | 'sand' | 'industrial' | 'forest' | 'nordic' | 'midnight' | 'space' | 'mono'

// Rich metadata for color presets
export const PRESET_DETAILS: Record<ColorPreset, { label: string; description: string; gradient: string; accent: string; adjectives: string[] }> = {
  default: {
    label: 'Royal',
    description: 'Deep purple tones for a creative atmosphere.',
    gradient: 'from-violet-600/20 via-purple-600/10 to-transparent',
    accent: 'bg-violet-600',
    adjectives: ['Creative', 'Deep', 'Royal']
  },
  sand: {
    label: 'Sand',
    description: 'Warm, natural tones for focused work.',
    gradient: 'from-orange-600/20 via-amber-600/10 to-transparent',
    accent: 'bg-orange-600',
    adjectives: ['Warm', 'Earth', 'Focus']
  },
  industrial: {
    label: 'Industrial',
    description: 'High-contrast red for precision editing.',
    gradient: 'from-red-600/20 via-rose-600/10 to-transparent',
    accent: 'bg-red-600',
    adjectives: ['Bold', 'Sharp', 'Tech']
  },
  forest: {
    label: 'Forest',
    description: 'Calming greens to reduce eye strain.',
    gradient: 'from-green-600/20 via-emerald-600/10 to-transparent',
    accent: 'bg-green-600',
    adjectives: ['Calm', 'Fresh', 'Nature']
  },
  nordic: {
    label: 'Nordic',
    description: 'Cool blues inspired by minimal design.',
    gradient: 'from-blue-600/20 via-sky-600/10 to-transparent',
    accent: 'bg-blue-600',
    adjectives: ['Cool', 'Clean', 'Air']
  },
  midnight: {
    label: 'Midnight',
    description: 'Vibrant pinks for high energy.',
    gradient: 'from-pink-600/20 via-fuchsia-600/10 to-transparent',
    accent: 'bg-pink-600',
    adjectives: ['Vivid', 'Neon', 'Night']
  },
  space: {
    label: 'Space',
    description: 'Monochrome slate for pure content focus.',
    gradient: 'from-slate-600/20 via-gray-600/10 to-transparent',
    accent: 'bg-slate-600',
    adjectives: ['Mono', 'Sleek', 'Zero']
  },
  mono: {
    label: 'Mono',
    description: 'Pure black, white, and gray for industrial focus.',
    gradient: 'from-zinc-700/20 via-zinc-500/10 to-transparent',
    accent: 'bg-zinc-600',
    adjectives: ['Mono', 'Steel', 'Focus']
  },
}
