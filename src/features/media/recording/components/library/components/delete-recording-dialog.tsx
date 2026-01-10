import { Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { type LibraryRecordingView } from '@/features/media/recording/store/library-store'
import { PROJECT_EXTENSION_REGEX } from '@/features/core/storage/project-paths'

interface DeleteRecordingDialogProps {
  pendingDelete: LibraryRecordingView | null
  onCancel: () => void
  onConfirm: (recording: LibraryRecordingView) => Promise<void>
}

export const DeleteRecordingDialog = ({
  pendingDelete,
  onCancel,
  onConfirm
}: DeleteRecordingDialogProps) => (
  <Dialog open={!!pendingDelete} onOpenChange={(open) => !open && onCancel()}>
    <DialogContent className="sm:max-w-[460px]">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <Trash2 className="h-4 w-4 text-destructive" />
          Delete recording
        </DialogTitle>
        <DialogDescription>
          This can’t be undone. The project and its media will be removed from disk.
        </DialogDescription>
      </DialogHeader>
      {pendingDelete && (
        <div className="rounded-lg border bg-muted/20 p-3">
          <div className="text-sm font-medium text-foreground truncate">
            {pendingDelete.projectInfo?.name || pendingDelete.name.replace(PROJECT_EXTENSION_REGEX, '')}
          </div>
          <div className="mt-1 text-xs text-muted-foreground font-mono break-all max-h-10 overflow-hidden">
            {pendingDelete.path.split(/[\\/]/).slice(-3).join('/')}
          </div>
        </div>
      )}
      <DialogFooter>
        <Button variant="outline" onClick={onCancel} autoFocus>
          Cancel
        </Button>
        <Button
          variant="destructive"
          onClick={async () => {
            if (!pendingDelete) return
            await onConfirm(pendingDelete)
          }}
          disabled={!window.electronAPI?.deleteRecordingProject}
        >
          Delete
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
)
