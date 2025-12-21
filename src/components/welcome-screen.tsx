import React from 'react'
import { motion } from 'framer-motion'
import { Monitor, Mic, Check, X, ArrowRight, Settings } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'

interface PermissionItemProps {
    icon: React.ReactNode
    title: string
    description: string
    isGranted: boolean
    onGrant?: () => void
    isOptional?: boolean
}

const PermissionItem: React.FC<PermissionItemProps> = ({
    icon,
    title,
    description,
    isGranted,
    onGrant,
    isOptional = false
}) => {
    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className={`
        flex items-center justify-between p-4 rounded-xl border transition-all duration-300
        ${isGranted
                    ? 'bg-primary/10 border-primary/20'
                    : 'window-surface border-border hover:border-primary/20'
                }
      `}
        >
            <div className="flex items-center gap-4">
                <div className={`
          p-2.5 rounded-lg
          ${isGranted ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground'}
        `}>
                    {icon}
                </div>
                <div>
                    <h3 className="font-medium text-foreground flex items-center gap-2">
                        {title}
                        {isOptional && <span className="text-xs text-muted-foreground font-normal px-2 py-0.5 rounded-full bg-muted">Optional</span>}
                    </h3>
                    <p className="text-sm text-muted-foreground">{description}</p>
                </div>
            </div>

            <div className="flex items-center gap-3">
                {isGranted ? (
                    <div className="flex items-center gap-2 text-primary text-sm font-medium px-3 py-1.5 rounded-full bg-primary/10">
                        <Check size={14} strokeWidth={3} />
                        <span>Granted</span>
                    </div>
                ) : (
                    <div className="flex items-center gap-3">
                        <Switch checked={false} onCheckedChange={() => onGrant?.()} />
                        {onGrant && (
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={onGrant}
                                className="h-8 text-xs bg-transparent border-border hover:bg-accent text-foreground"
                            >
                                Grant Access
                            </Button>
                        )}
                    </div>
                )}
            </div>
        </motion.div>
    )
}

interface WelcomeScreenProps {
    permissions: {
        screenRecording: boolean
        microphone: boolean
    }
    onGrantScreenRecording: () => void
    onGrantMicrophone: () => void
    onContinue: () => void
}

export const WelcomeScreen: React.FC<WelcomeScreenProps> = ({
    permissions,
    onGrantScreenRecording,
    onGrantMicrophone,
    onContinue
}) => {
    const allRequiredGranted = permissions.screenRecording && permissions.microphone

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-transparent text-foreground overflow-hidden">
            {/* Background Effects */}
            <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
                <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] rounded-full bg-primary/5 blur-[120px]" />
                <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] rounded-full bg-primary/5 blur-[120px]" />
            </div>

            <div className="relative z-10 w-full max-w-lg p-8">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5 }}
                    className="text-center mb-10"
                >
                    <h1 className="text-3xl font-bold mb-3 tracking-tight text-foreground">Hello there!</h1>
                    <p className="text-muted-foreground text-lg max-w-md mx-auto leading-relaxed">
                        Let&apos;s get you set up. We need a few permissions to enable the magic.
                    </p>
                </motion.div>

                <div className="space-y-4 mb-10">
                    <PermissionItem
                        icon={<Monitor size={20} />}
                        title="Screen Recording"
                        description="Required to capture your desktop and windows"
                        isGranted={permissions.screenRecording}
                        onGrant={onGrantScreenRecording}
                    />

                    <PermissionItem
                        icon={<Mic size={24} />}
                        title="Microphone"
                        description="Required to record audio with your screen captures."
                        isGranted={permissions.microphone}
                        onGrant={onGrantMicrophone}
                    />
                </div>

                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.3 }}
                    className="flex flex-col gap-4"
                >
                    <Button
                        size="lg"
                        className={`
              w-full h-12 text-base font-medium transition-all duration-300
              ${allRequiredGranted
                                ? 'bg-primary text-primary-foreground hover:bg-primary/90 shadow-lg shadow-primary/20'
                                : 'bg-muted text-muted-foreground cursor-not-allowed hover:bg-muted'
                            }
            `}
                        onClick={onContinue}
                        disabled={!allRequiredGranted}
                    >
                        {allRequiredGranted ? (
                            <span className="flex items-center gap-2">
                                Continue to App <ArrowRight size={18} />
                            </span>
                        ) : (
                            <span className="flex items-center gap-2">
                                Grant Permissions to Continue
                            </span>
                        )}
                    </Button>

                    {!allRequiredGranted && (
                        <p className="text-center text-sm text-muted-foreground/60 animate-pulse">
                            Please grant all permissions to continue
                        </p>
                    )}
                </motion.div>
            </div>
        </div>
    )
}
