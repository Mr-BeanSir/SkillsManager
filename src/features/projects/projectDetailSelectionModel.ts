export type AttachmentSelectionSource = {
  id: string;
  name: string;
};

export type AttachmentSelectionItem = {
  id: string;
  label: string;
  checked: boolean;
  disabled: boolean;
};

export function buildAttachmentSelectionItems(
  sources: AttachmentSelectionSource[],
  attachedIds: string[]
): AttachmentSelectionItem[] {
  const attachedIdSet = new Set(attachedIds);

  return sources.map((source) => ({
    id: source.id,
    label: source.name,
    checked: attachedIdSet.has(source.id),
    disabled: attachedIdSet.has(source.id)
  }));
}

export function collectPendingAttachmentIds(
  selectedIds: string[],
  attachedIds: string[]
): string[] {
  const attachedIdSet = new Set(attachedIds);
  const pendingIds: string[] = [];

  for (const selectedId of selectedIds) {
    if (attachedIdSet.has(selectedId) || pendingIds.includes(selectedId)) {
      continue;
    }

    pendingIds.push(selectedId);
  }

  return pendingIds;
}
