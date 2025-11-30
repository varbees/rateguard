import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Search, Filter, X } from "lucide-react";
import { useUser } from "@/lib/hooks/use-user";

export interface FilterState {
  status: {
    active: boolean;
    paused: boolean;
  };
  health: {
    healthy: boolean;
    degraded: boolean;
    down: boolean;
  };
}

interface SearchAndFilterBarProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  filters: FilterState;
  onFilterChange: (filters: FilterState) => void;
  totalResults: number;
}

export function SearchAndFilterBar({
  searchQuery,
  onSearchChange,
  filters,
  onFilterChange,
  totalResults,
}: SearchAndFilterBarProps) {
  const { hasAccess } = useUser();
  const [localSearch, setLocalSearch] = useState(searchQuery);
  const canUseFilters = hasAccess("pro");

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      onSearchChange(localSearch);
    }, 300);
    return () => clearTimeout(timer);
  }, [localSearch, onSearchChange]);

  const activeFiltersCount =
    (filters.status.active ? 1 : 0) +
    (filters.status.paused ? 1 : 0) +
    (filters.health.healthy ? 1 : 0) +
    (filters.health.degraded ? 1 : 0) +
    (filters.health.down ? 1 : 0);

  const clearFilters = () => {
    onFilterChange({
      status: { active: false, paused: false },
      health: { healthy: false, degraded: false, down: false },
    });
  };

  const toggleFilter = (
    category: keyof FilterState,
    key: string,
    checked: boolean
  ) => {
    onFilterChange({
      ...filters,
      [category]: {
        ...filters[category],
        [key]: checked,
      },
    });
  };

  return (
    <div className="flex flex-col sm:flex-row gap-3 mb-6">
      {/* Search */}
      <div className="relative flex-1">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          type="search"
          placeholder="Search by name, URL, or provider..."
          value={localSearch}
          onChange={(e) => setLocalSearch(e.target.value)}
          className="pl-9"
          aria-label="Search API proxies"
        />
      </div>

      {/* Filter Dropdown (Pro+) */}
      {canUseFilters ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="gap-2">
              <Filter className="h-4 w-4" />
              Filters
              {activeFiltersCount > 0 && (
                <Badge variant="secondary" className="ml-1 px-1.5 h-5 min-w-5">
                  {activeFiltersCount}
                </Badge>
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>Filter by Status</DropdownMenuLabel>
            <DropdownMenuCheckboxItem
              checked={filters.status.active}
              onCheckedChange={(checked) =>
                toggleFilter("status", "active", checked)
              }
            >
              Active Only
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem
              checked={filters.status.paused}
              onCheckedChange={(checked) =>
                toggleFilter("status", "paused", checked)
              }
            >
              Paused Only
            </DropdownMenuCheckboxItem>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Filter by Health</DropdownMenuLabel>
            <DropdownMenuCheckboxItem
              checked={filters.health.healthy}
              onCheckedChange={(checked) =>
                toggleFilter("health", "healthy", checked)
              }
            >
              Healthy
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem
              checked={filters.health.degraded}
              onCheckedChange={(checked) =>
                toggleFilter("health", "degraded", checked)
              }
            >
              Degraded
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem
              checked={filters.health.down}
              onCheckedChange={(checked) =>
                toggleFilter("health", "down", checked)
              }
            >
              Down
            </DropdownMenuCheckboxItem>
            {activeFiltersCount > 0 && (
              <>
                <DropdownMenuSeparator />
                <div className="p-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full justify-start text-muted-foreground"
                    onClick={clearFilters}
                  >
                    <X className="h-4 w-4 mr-2" />
                    Clear Filters
                  </Button>
                </div>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : (
        <Button variant="outline" disabled className="gap-2 opacity-50 cursor-not-allowed" title="Upgrade to Pro to use filters">
          <Filter className="h-4 w-4" />
          Filters
        </Button>
      )}
    </div>
  );
}
