'use client'

import React, { useState, useCallback, useMemo } from 'react'
import { cn } from '@/lib/utils'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { BackgroundEffectData, DeviceMockupData, CanvasSettings } from '@/types/project'
import { AspectRatioPreset, DeviceType, DeviceModel } from '@/types/project'
import { ASPECT_RATIO_PRESETS, DEFAULT_CANVAS_SETTINGS } from '@/lib/constants/aspect-ratio-presets'
import { DEVICE_MOCKUPS, getMockupsByType, DEFAULT_MOCKUP_DATA, DEFAULT_MOCKUP_BY_TYPE } from '@/lib/constants/device-mockups'
import { useAvailableMockups, type MockupFrame, type MockupVariant } from '@/hooks/useAvailableMockups'
import { useProjectStore } from '@/stores/project-store'
import { useShallow } from 'zustand/react/shallow'
import {
  Smartphone,
  Tablet,
  Monitor,
  Watch,
  Tv,
  Minus,
} from 'lucide-react'

interface CanvasTabProps {
  backgroundData?: BackgroundEffectData
  onBackgroundChange: (data: Partial<BackgroundEffectData>) => void
}

// Sub-tab types
type CanvasSubTabId = 'aspect' | 'mockup'

type AvailableModel = {
  id: string
  displayName: string
  isCustom: boolean
  variants?: MockupVariant[]
  frame?: MockupFrame
}

// Device type icon mapping
function DeviceTypeIcon({ type }: { type: DeviceType }) {
  switch (type) {
    case DeviceType.IPhone:
      return <Smartphone className="w-4 h-4" />
    case DeviceType.IPad:
      return <Tablet className="w-4 h-4" />
    case DeviceType.MacBook:
      return <Monitor className="w-4 h-4" />
    case DeviceType.AppleWatch:
      return <Watch className="w-4 h-4" />
    case DeviceType.IMac:
      return <Tv className="w-4 h-4" />
    default:
      return null
  }
}

// Sub-tabs component
function SubTabs<T extends string>({
  value,
  onChange,
  tabs,
}: {
  value: T
  onChange: (next: T) => void
  tabs: { id: T; label: string }[]
}) {
  return (
    <div className="flex p-0.5 bg-muted/50 rounded-lg gap-0.5">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          onClick={() => onChange(tab.id)}
          className={cn(
            "flex-1 px-2 py-1.5 text-[11px] font-medium rounded-md transition-colors",
            value === tab.id
              ? "bg-background/80 text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground hover:bg-background/50"
          )}
        >
          {tab.label}
        </button>
      ))}
    </div>
  )
}

export function CanvasTab({
  backgroundData,
  onBackgroundChange,
}: CanvasTabProps) {
  const [subTab, setSubTab] = useState<CanvasSubTabId>('aspect')

  // Get canvas settings from project store
  const { canvasSettings, updateProjectData } = useProjectStore(
    useShallow((state) => ({
      canvasSettings: state.currentProject?.settings?.canvas,
      updateProjectData: state.updateProjectData,
    }))
  )

  // Current mockup data
  const mockupData = backgroundData?.mockup ?? DEFAULT_MOCKUP_DATA

  // Update mockup data
  const updateMockup = useCallback((updates: Partial<DeviceMockupData>) => {
    const newMockup = { ...mockupData, ...updates }
    onBackgroundChange({ mockup: newMockup })
  }, [mockupData, onBackgroundChange])

  // Update canvas settings via project store
  const updateCanvas = useCallback((updates: Partial<CanvasSettings>) => {
    updateProjectData((project) => {
      const currentCanvas = project.settings?.canvas ?? DEFAULT_CANVAS_SETTINGS
      return {
        ...project,
        settings: {
          ...project.settings,
          canvas: {
            ...currentCanvas,
            ...updates,
          },
        },
      }
    })
  }, [updateProjectData])

  // Toggle mockup enabled
  const toggleMockup = useCallback(() => {
    updateMockup({ enabled: !mockupData.enabled })
  }, [mockupData.enabled, updateMockup])

  const { devices: availableDevices, availableTypes: availableDeviceTypes } = useAvailableMockups()

  const getModelsForType = useCallback((type: DeviceType): AvailableModel[] => {
    const typeKey = type === DeviceType.AppleWatch ? 'watch' : type
    const device = availableDevices.find(d => d.type === typeKey)
    if (device?.models?.length) {
      return device.models.map((model) => ({
        id: model.id,
        displayName: model.name,
        isCustom: true,
        variants: model.variants,
        frame: model.frame,
      }))
    }

    return getMockupsByType(type).map((model) => ({
      id: model.id,
      displayName: model.displayName,
      isCustom: false,
    }))
  }, [availableDevices])

  const applyCustomModel = useCallback((model: AvailableModel, deviceType?: DeviceType) => {
    const firstVariant = model.variants?.[0]
    updateMockup({
      deviceModel: model.id,
      deviceType: deviceType ?? mockupData.deviceType,
      enabled: true,
      customFramePath: firstVariant?.path ?? model.frame?.path,
      customFrameDimensions: model.frame ? { width: model.frame.width, height: model.frame.height } : undefined,
      customScreenRegion: model.frame?.screenRegion,
      customFrameBounds: model.frame?.frameBounds,
      colorVariant: firstVariant?.name,
    })
  }, [mockupData.deviceType, updateMockup])

  const applyBuiltInModel = useCallback((modelId: DeviceModel) => {
    const metadata = DEVICE_MOCKUPS[modelId]
    if (!metadata) return
    updateMockup({
      deviceModel: modelId,
      deviceType: metadata.type,
      enabled: true,
      customFramePath: undefined,
      customFrameDimensions: undefined,
      customScreenRegion: undefined,
      customFrameBounds: undefined,
      colorVariant: undefined,
    })
  }, [updateMockup])

  // Select device type
  const selectDeviceType = useCallback((type: DeviceType) => {
    if (type === DeviceType.None) {
      updateMockup({
        deviceType: type,
        enabled: false,
        customFramePath: undefined,
        customFrameDimensions: undefined,
        customScreenRegion: undefined,
        customFrameBounds: undefined,
        colorVariant: undefined,
      })
      return
    }

    const models = getModelsForType(type)
    const defaultModel = models[0]
    if (defaultModel?.isCustom) {
      applyCustomModel(defaultModel, type)
      return
    }

    const fallbackModel = DEFAULT_MOCKUP_BY_TYPE[type] ?? DeviceModel.IPhone15Pro
    updateMockup({
      deviceType: type,
      deviceModel: fallbackModel,
      enabled: true,
      customFramePath: undefined,
      customFrameDimensions: undefined,
      customScreenRegion: undefined,
      customFrameBounds: undefined,
      colorVariant: undefined,
    })
  }, [applyCustomModel, getModelsForType, updateMockup])

  // Select device model
  const selectDeviceModel = useCallback((modelId: string) => {
    const models = getModelsForType(mockupData.deviceType)
    const selected = models.find(model => model.id === modelId)
    if (!selected) return

    if (selected.isCustom) {
      applyCustomModel(selected)
    } else {
      applyBuiltInModel(selected.id as DeviceModel)
    }
  }, [applyBuiltInModel, applyCustomModel, getModelsForType, mockupData.deviceType])

  // Get available models for current device type
  const availableModels = useMemo(() => {
    if (mockupData.deviceType === DeviceType.None) return []
    return getModelsForType(mockupData.deviceType)
  }, [getModelsForType, mockupData.deviceType])

  const selectedCustomModel = useMemo(() => {
    return availableModels.find(model => model.id === mockupData.deviceModel && model.isCustom)
  }, [availableModels, mockupData.deviceModel])

  const selectCustomVariant = useCallback((variant: MockupVariant) => {
    updateMockup({
      customFramePath: variant.path,
      colorVariant: variant.name,
    })
  }, [updateMockup])

  // Current aspect ratio preset
  const currentAspectRatio = canvasSettings?.aspectRatio ?? AspectRatioPreset.Original

  return (
    <div className="space-y-3">
      <SubTabs
        value={subTab}
        onChange={setSubTab}
        tabs={[
          { id: 'aspect', label: 'Aspect Ratio' },
          // { id: 'mockup', label: 'Device Mockup' }, // TODO: WIP, POST v1.0 feature
        ]}
      />

      {subTab === 'aspect' && (
        <AspectRatioSection
          currentPreset={currentAspectRatio}
          customWidth={canvasSettings?.customWidth}
          customHeight={canvasSettings?.customHeight}
          onPresetChange={(preset) => updateCanvas({ aspectRatio: preset })}
          onCustomChange={(width, height) => updateCanvas({ customWidth: width, customHeight: height })}
        />
      )}

      {subTab === 'mockup' && (
        <MockupSection
          mockupData={mockupData}
          onToggle={toggleMockup}
          onDeviceTypeChange={selectDeviceType}
          onDeviceModelChange={selectDeviceModel}
          onUpdateMockup={updateMockup}
          availableModels={availableModels}
          selectedCustomModel={selectedCustomModel}
          onCustomVariantChange={selectCustomVariant}
          availableDeviceTypes={availableDeviceTypes}
        />
      )}
    </div>
  )
}

// Aspect Ratio Section
interface AspectRatioSectionProps {
  currentPreset: AspectRatioPreset
  customWidth?: number
  customHeight?: number
  onPresetChange: (preset: AspectRatioPreset) => void
  onCustomChange: (width: number, height: number) => void
}

function AspectRatioSection({
  currentPreset,
  customWidth = 1920,
  customHeight = 1080,
  onPresetChange,
  onCustomChange,
}: AspectRatioSectionProps) {
  // Group presets by category
  const standardPresets = ASPECT_RATIO_PRESETS.filter(p => p.category === 'standard')
  const socialPresets = ASPECT_RATIO_PRESETS.filter(p => p.category === 'social')
  const landingPresets = ASPECT_RATIO_PRESETS.filter(p => p.category === 'landing')

  return (
    <div className="space-y-4">
      {/* Standard Presets */}
      <div className="space-y-2">
        <Label className="text-xs text-muted-foreground">Standard</Label>
        <div className="grid grid-cols-3 gap-1.5">
          {standardPresets.map((preset) => (
            <AspectRatioButton
              key={preset.id}
              preset={preset}
              isSelected={currentPreset === preset.id}
              onClick={() => onPresetChange(preset.id)}
            />
          ))}
        </div>
      </div>

      {/* Social Presets */}
      <div className="space-y-2">
        <Label className="text-xs text-muted-foreground">Social</Label>
        <div className="grid grid-cols-3 gap-1.5">
          {socialPresets.map((preset) => (
            <AspectRatioButton
              key={preset.id}
              preset={preset}
              isSelected={currentPreset === preset.id}
              onClick={() => onPresetChange(preset.id)}
            />
          ))}
        </div>
      </div>

      {/* Landing Page Presets */}
      <div className="space-y-2">
        <Label className="text-xs text-muted-foreground">Landing Page</Label>
        <div className="grid grid-cols-2 gap-1.5">
          {landingPresets.map((preset) => (
            <AspectRatioButton
              key={preset.id}
              preset={preset}
              isSelected={currentPreset === preset.id}
              onClick={() => onPresetChange(preset.id)}
            />
          ))}
        </div>
      </div>

      {/* Custom dimensions (when custom is selected) */}
      {currentPreset === AspectRatioPreset.Custom && (
        <div className="space-y-2 pt-2 border-t">
          <Label className="text-xs text-muted-foreground">Custom Dimensions</Label>
          <div className="flex gap-2 items-center">
            <input
              type="number"
              value={customWidth}
              onChange={(e) => onCustomChange(parseInt(e.target.value) || 1920, customHeight)}
              className="w-20 px-2 py-1 text-xs bg-muted/50 rounded border"
              min={100}
              max={7680}
            />
            <span className="text-xs text-muted-foreground">x</span>
            <input
              type="number"
              value={customHeight}
              onChange={(e) => onCustomChange(customWidth, parseInt(e.target.value) || 1080)}
              className="w-20 px-2 py-1 text-xs bg-muted/50 rounded border"
              min={100}
              max={4320}
            />
          </div>
        </div>
      )}
    </div>
  )
}

// Aspect Ratio Button
function AspectRatioButton({
  preset,
  isSelected,
  onClick,
}: {
  preset: (typeof ASPECT_RATIO_PRESETS)[number]
  isSelected: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex flex-col items-center gap-1 p-2 rounded-md border transition-colors",
        isSelected
          ? "bg-primary/10 border-primary text-primary"
          : "bg-muted/30 border-transparent hover:bg-muted/50 text-muted-foreground hover:text-foreground"
      )}
    >
      <div
        className={cn(
          "flex items-center justify-center border rounded-sm",
          isSelected ? "border-primary" : "border-muted-foreground/30"
        )}
        style={{
          width: (preset.iconRatio.width / preset.iconRatio.height) > (32 / 24)
            ? 32
            : Math.round(24 * (preset.iconRatio.width / preset.iconRatio.height)),
          height: (preset.iconRatio.width / preset.iconRatio.height) > (32 / 24)
            ? Math.round(32 / (preset.iconRatio.width / preset.iconRatio.height))
            : 24,
        }}
      >
        {preset.icon && (
          <preset.icon
            className={cn(
              "w-3 h-3",
              isSelected ? "text-primary" : "text-muted-foreground/50"
            )}
          />
        )}
      </div>
      <span className="text-[10px] font-medium">{preset.label}</span>
    </button>
  )
}

// Mockup Section
interface MockupSectionProps {
  mockupData: DeviceMockupData
  onToggle: () => void
  onDeviceTypeChange: (type: DeviceType) => void
  onDeviceModelChange: (model: string) => void
  onUpdateMockup: (updates: Partial<DeviceMockupData>) => void
  availableModels: AvailableModel[]
  selectedCustomModel?: AvailableModel
  onCustomVariantChange: (variant: MockupVariant) => void
  availableDeviceTypes: Set<string>
}

function MockupSection({
  mockupData,
  onToggle,
  onDeviceTypeChange,
  onDeviceModelChange,
  onUpdateMockup,
  availableModels,
  selectedCustomModel,
  onCustomVariantChange,
  availableDeviceTypes,
}: MockupSectionProps) {
  const customVariants = selectedCustomModel?.variants ?? []
  const hasCustomVariants = customVariants.length > 1
  // Only show device types that have actual mockup files (+ None)
  const allDeviceTypes = [
    { type: DeviceType.None, label: 'None', key: 'none' },
    { type: DeviceType.IPhone, label: 'iPhone', key: 'iphone' },
    { type: DeviceType.IPad, label: 'iPad', key: 'ipad' },
    { type: DeviceType.MacBook, label: 'MacBook', key: 'macbook' },
    { type: DeviceType.AppleWatch, label: 'Watch', key: 'watch' },
    { type: DeviceType.IMac, label: 'iMac', key: 'imac' },
  ]

  // Filter to only show types with available mockups
  const hasAutoDiscoveredTypes = availableDeviceTypes.size > 0
  const deviceTypes = allDeviceTypes.filter(({ type, key }) => {
    if (type === DeviceType.None) return true
    if (!hasAutoDiscoveredTypes) return true
    return availableDeviceTypes.has(key)
  })

  const videoFitOptions = [
    { value: 'fill', label: 'Fill (Crop)' },
  ]
  const resolvedVideoFit = 'fill'

  return (
    <div className="space-y-4">
      {/* Device Type Selector */}
      <div className="space-y-2">
        <Label className="text-xs text-muted-foreground">Device Type</Label>
        <div className="grid grid-cols-3 gap-1.5">
          {deviceTypes.map(({ type, label }) => (
            <button
              key={type}
              type="button"
              onClick={() => onDeviceTypeChange(type)}
              className={cn(
                "flex flex-col items-center gap-1 p-2 rounded-md border transition-colors",
                mockupData.deviceType === type
                  ? "bg-primary/10 border-primary text-primary"
                  : "bg-muted/30 border-transparent hover:bg-muted/50 text-muted-foreground hover:text-foreground"
              )}
            >
              <DeviceTypeIcon type={type} />
              <span className="text-[10px] font-medium">{label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Device Model Selector (when type is selected) */}
      {mockupData.deviceType !== DeviceType.None && availableModels.length > 0 && (
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">Device Model</Label>
          <Select
            value={String(mockupData.deviceModel)}
            onValueChange={(value) => onDeviceModelChange(value)}
          >
            <SelectTrigger className="w-full h-8 text-xs">
              <SelectValue placeholder="Select model..." />
            </SelectTrigger>
            <SelectContent>
              {availableModels.map((model) => (
                <SelectItem key={model.id} value={model.id} className="text-xs">
                  {model.displayName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Mockup Options (when enabled) */}
      {mockupData.enabled && (
        <>
          {/* Video Fit Mode */}
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Video Fit</Label>
            <div className="flex gap-1.5">
              {videoFitOptions.map(({ value, label }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => onUpdateMockup({ videoFit: value as DeviceMockupData['videoFit'] })}
                  className={cn(
                    "flex-1 px-2 py-1.5 text-[10px] font-medium rounded-md border transition-colors",
                    resolvedVideoFit === value
                      ? "bg-primary/10 border-primary text-primary"
                      : "bg-muted/30 border-transparent hover:bg-muted/50"
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>



          {/* Color Variant (if device has variants) */}
          {hasCustomVariants && (
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Color Variant</Label>
              <Select
                value={mockupData.colorVariant ?? customVariants[0].name}
                onValueChange={(value) => {
                  const variant = customVariants.find(v => v.name === value)
                  if (variant) {
                    onCustomVariantChange(variant)
                  }
                }}
              >
                <SelectTrigger className="w-full h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {customVariants.map((variant) => (
                    <SelectItem key={variant.name} value={variant.name} className="text-xs capitalize">
                      {variant.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {!selectedCustomModel && DEVICE_MOCKUPS[mockupData.deviceModel as DeviceModel]?.colorVariants.length > 1 && (
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Color Variant</Label>
              <Select
                value={mockupData.colorVariant ?? DEVICE_MOCKUPS[mockupData.deviceModel as DeviceModel].colorVariants[0]}
                onValueChange={(value) => onUpdateMockup({ colorVariant: value })}
              >
                <SelectTrigger className="w-full h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DEVICE_MOCKUPS[mockupData.deviceModel as DeviceModel].colorVariants.map((variant) => (
                    <SelectItem key={variant} value={variant} className="text-xs capitalize">
                      {variant.replace(/-/g, ' ')}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </>
      )}
    </div>
  )
}

export default CanvasTab
