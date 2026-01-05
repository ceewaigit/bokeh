import { Search, X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

interface LibrarySearchProps {
    query: string
    onQueryChange: (query: string) => void
}

export function LibrarySearch({ query, onQueryChange }: LibrarySearchProps) {
    return (
        <div className="relative w-48 lg:w-64 transition-all duration-300 group focus-within:w-64 lg:focus-within:w-72">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground transition-colors group-focus-within:text-primary" />
            <Input
                type="text"
                placeholder="Search recordings..."
                className="pl-9 pr-8 bg-background/50 backdrop-blur-sm focus:bg-background transition-colors"
                value={query}
                onChange={(e) => onQueryChange(e.target.value)}
            />
            {query && (
                <Button
                    variant="ghost"
                    size="icon"
                    className="absolute right-1 top-1 h-7 w-7 text-muted-foreground hover:text-foreground"
                    onClick={() => onQueryChange('')}
                >
                    <X className="h-3.5 w-3.5" />
                </Button>
            )}
        </div>
    )
}
