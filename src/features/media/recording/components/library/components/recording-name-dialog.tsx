import { useEffect, useMemo, useState } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

interface RecordingNameDialogProps {
  open: boolean
  title: string
  description: string
  confirmLabel: string
  initialValue: string
  onConfirm: (value: string) => void | Promise<void>
  onOpenChange: (open: boolean) => void
}

export const RecordingNameDialog = ({
  open,
  title,
  description,
  confirmLabel,
  initialValue,
  onConfirm,
  onOpenChange
}: RecordingNameDialogProps) => {
  const [value, setValue] = useState(initialValue)
  const trimmedValue = useMemo(() => value.trim(), [value])

  useEffect(() => {
    if (open) {
      setValue(initialValue)
    }
  }, [open, initialValue])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="pt-1">
          <Input
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder="Recording name"
            autoFocus
          />
        </div>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="default"
            disabled={!trimmedValue}
            onClick={() => onConfirm(trimmedValue)}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
