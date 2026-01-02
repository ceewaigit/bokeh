import { ArrowDownWideNarrow, ArrowUpNarrowWide, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { type SortKey, type SortDirection } from '@/features/recording/store/library-store'

interface LibrarySortProps {
    sortKey: SortKey
    sortDirection: SortDirection
    onSortChange: (key: SortKey, direction: SortDirection) => void
}

export function LibrarySort({ sortKey, sortDirection, onSortChange }: LibrarySortProps) {
    const toggleDirection = () => {
        onSortChange(sortKey, sortDirection === 'asc' ? 'desc' : 'asc')
    }

    const handleSelect = (key: SortKey) => {
        if (key === sortKey) {
            toggleDirection()
        } else {
            // Default directions for new keys
            const defaultDir = key === 'name' ? 'asc' : 'desc'
            onSortChange(key, defaultDir)
        }
    }

    const SortIcon = sortDirection === 'asc' ? ArrowUpNarrowWide : ArrowDownWideNarrow

    return (
        <div className="flex items-center gap-1">
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="h-9 gap-2 shadow-sm bg-background/50 backdrop-blur-sm">
                        <SortIcon className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="text-xs font-medium">
                            {sortKey === 'date' && 'Date'}
                            {sortKey === 'name' && 'Name'}
                            {sortKey === 'size' && 'Size'}
                            {sortKey === 'duration' && 'Duration'}
                        </span>
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-40">
                    <DropdownMenuItem onClick={() => handleSelect('date')}>
                        <span className="flex-1">Date</span>
                        {sortKey === 'date' && <Check className="h-3.5 w-3.5 ml-2" />}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleSelect('name')}>
                        <span className="flex-1">Name</span>
                        {sortKey === 'name' && <Check className="h-3.5 w-3.5 ml-2" />}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleSelect('size')}>
                        <span className="flex-1">Size</span>
                        {sortKey === 'size' && <Check className="h-3.5 w-3.5 ml-2" />}
                    </DropdownMenuItem>

                    <DropdownMenuSeparator />

                    <DropdownMenuItem onClick={toggleDirection}>
                        <span className="flex-1">
                            {sortDirection === 'asc' ? 'Ascending' : 'Descending'}
                        </span>
                        <SortIcon className="h-3.5 w-3.5 ml-2" />
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>
        </div>
    )
}
