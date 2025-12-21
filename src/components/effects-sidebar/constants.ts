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
  Crop,
  Bot,
  SlidersHorizontal,
  LayoutGrid,
} from 'lucide-react'

export enum SidebarTabId {
  Clip = 'clip',
  Style = 'style',
  Pointer = 'pointer',
  Framing = 'framing',
  Canvas = 'canvas',
  Advanced = 'advanced',
}

export const SIDEBAR_TABS = [
  { id: SidebarTabId.Clip, icon: SlidersHorizontal, label: 'Clip' },
  { id: SidebarTabId.Style, icon: Palette, label: 'Style' },
  { id: SidebarTabId.Pointer, icon: MousePointer, label: 'Pointer' },
  { id: SidebarTabId.Framing, icon: Crop, label: 'Framing' },
  { id: SidebarTabId.Canvas, icon: LayoutGrid, label: 'Canvas' },
  { id: SidebarTabId.Advanced, icon: Bot, label: 'Advanced' },
] as const
