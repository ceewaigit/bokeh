export const GRADIENT_PRESETS = [
  { id: 'gradient-1', colors: ['#FF6B6B', '#4ECDC4'] },
  { id: 'gradient-2', colors: ['#A8E6CF', '#DCEDC1'] },
  { id: 'gradient-3', colors: ['#FFD3B6', '#FFAAA5'] },
  { id: 'gradient-4', colors: ['#8E2DE2', '#4A00E0'] },
  { id: 'gradient-5', colors: ['#81FBB8', '#28C76F'] },
  { id: 'gradient-6', colors: ['#FDBB2D', '#22A6B3'] },
  { id: 'gradient-7', colors: ['#FC466B', '#3F5EFB'] },
  { id: 'gradient-8', colors: ['#FDBB2D', '#B21F1F'] },
  { id: 'gradient-9', colors: ['#1E3C72', '#2A5298'] },
  { id: 'gradient-10', colors: ['#667EEA', '#764BA2'] },
  { id: 'gradient-11', colors: ['#F093FB', '#F5576C'] },
  { id: 'gradient-12', colors: ['#4FACFE', '#00F2FE'] },
  { id: 'gradient-13', colors: ['#43E97B', '#38F9D7'] },
  { id: 'gradient-14', colors: ['#FA709A', '#FEE140'] },
  { id: 'gradient-15', colors: ['#30CFD0', '#330867'] },
]

export const COLOR_PRESETS = [
  '#000000', '#FFFFFF', '#EF4444', '#10B981', '#3B82F6', '#F59E0B',
  '#8B5CF6', '#EC4899', '#14B8A6', '#64748B', '#1E293B', '#F1F5F9'
]

import {
  Palette,
  MousePointer,
  Aperture,
  Monitor,
  LayoutGrid,
  Video,
  StickyNote,
  Activity,
  FileText,
} from 'lucide-react'

export enum SidebarTabId {
  Screen = 'screen',
  Backdrop = 'backdrop',
  Pointer = 'pointer',
  Camera = 'camera',
  Motion = 'motion',
  Webcam = 'webcam',
  Annotation = 'annotation',
  Transcript = 'transcript',
  Canvas = 'canvas',
}

export const SIDEBAR_TABS = [
  { id: SidebarTabId.Screen, icon: Monitor, label: 'Screen' },
  { id: SidebarTabId.Backdrop, icon: Palette, label: 'Backdrop' },
  { id: SidebarTabId.Pointer, icon: MousePointer, label: 'Pointer & Typing' },
  { id: SidebarTabId.Camera, icon: Aperture, label: 'Camera' },
  { id: SidebarTabId.Motion, icon: Activity, label: 'Motion' },
  { id: SidebarTabId.Webcam, icon: Video, label: 'Webcam' },
  { id: SidebarTabId.Annotation, icon: StickyNote, label: 'Overlay' },
  { id: SidebarTabId.Transcript, icon: FileText, label: 'Transcript' },
  { id: SidebarTabId.Canvas, icon: LayoutGrid, label: 'Stage' },
] as const
