export type PendingRowState = string[];

export function markPendingRowId(current: PendingRowState, rowId: string): PendingRowState {
  if (current.includes(rowId)) {
    return current;
  }

  return [...current, rowId];
}

export function clearPendingRowId(current: PendingRowState, rowId: string): PendingRowState {
  return current.filter((item) => item !== rowId);
}

export function applyOptimisticToggle<Row extends { enabled: boolean }, Key extends keyof Row>(
  rows: Row[],
  row: Row,
  key: Key,
  compareRows: (left: Row, right: Row) => number
): Row[] {
  return replaceMatchingRow(
    rows,
    row[key],
    key,
    { ...row, enabled: !row.enabled },
    compareRows
  );
}

export function restoreToggledRow<Row, Key extends keyof Row>(
  rows: Row[],
  previousRow: Row,
  key: Key,
  compareRows: (left: Row, right: Row) => number
): Row[] {
  return replaceMatchingRow(rows, previousRow[key], key, previousRow, compareRows);
}

export function applyOptimisticRemoval<Row, Key extends keyof Row>(
  rows: Row[],
  rowId: Row[Key],
  key: Key
): Row[] {
  return rows.filter((row) => row[key] !== rowId);
}

export function restoreRemovedRow<Row>(
  rows: Row[],
  row: Row,
  compareRows: (left: Row, right: Row) => number
): Row[] {
  return [...rows, row].sort(compareRows);
}

function replaceMatchingRow<Row, Key extends keyof Row>(
  rows: Row[],
  rowId: Row[Key],
  key: Key,
  updatedRow: Row,
  compareRows: (left: Row, right: Row) => number
): Row[] {
  return rows
    .map((row) => (row[key] === rowId ? updatedRow : row))
    .sort(compareRows);
}
