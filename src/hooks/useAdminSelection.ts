"use client";

import { useCallback, useMemo, useState } from "react";

export function useAdminSelection(visibleIds: readonly string[]) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const visibleIdSet = useMemo(() => new Set(visibleIds), [visibleIds]);
  const selectedVisibleIds = useMemo(
    () => selectedIds.filter((id) => visibleIdSet.has(id)),
    [selectedIds, visibleIdSet],
  );
  const allVisibleSelected = visibleIds.length > 0 && selectedVisibleIds.length === visibleIds.length;
  const someVisibleSelected = selectedVisibleIds.length > 0 && !allVisibleSelected;

  const toggle = useCallback((id: string) => {
    setSelectedIds((current) => (
      current.includes(id)
        ? current.filter((selectedId) => selectedId !== id)
        : [...current, id]
    ));
  }, []);

  const toggleVisible = useCallback((checked: boolean) => {
    setSelectedIds((current) => {
      if (!checked) return current.filter((id) => !visibleIdSet.has(id));
      return Array.from(new Set([...current, ...visibleIds]));
    });
  }, [visibleIds, visibleIdSet]);

  const clear = useCallback(() => setSelectedIds([]), []);

  const remove = useCallback((ids: readonly string[]) => {
    const idsToRemove = new Set(ids);
    setSelectedIds((current) => current.filter((id) => !idsToRemove.has(id)));
  }, []);

  return {
    selectedIds,
    selectedVisibleIds,
    selectedCount: selectedIds.length,
    allVisibleSelected,
    someVisibleSelected,
    isSelected: (id: string) => selectedIds.includes(id),
    toggle,
    toggleVisible,
    clear,
    remove,
  };
}
