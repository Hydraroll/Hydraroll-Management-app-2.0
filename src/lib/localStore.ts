import type { InventoryPart, PartLine, ServiceSheet } from '../types';

const SHEETS_KEY = 'hydraroll:sheets:v1';
const INVENTORY_KEY = 'hydraroll:inventory:v1';
const DRAFT_KEY = 'hydraroll:service-draft:v1';
const REFERENCE_KEY = 'hydraroll:reference-sequence:v1';

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write<T>(key: string, value: T): void {
  localStorage.setItem(key, JSON.stringify(value));
}

export function getSheets(): ServiceSheet[] {
  return read<ServiceSheet[]>(SHEETS_KEY, []);
}

export function getDraft(): Partial<ServiceSheet> | null {
  return read<Partial<ServiceSheet> | null>(DRAFT_KEY, null);
}

export function saveDraft(sheet: Partial<ServiceSheet>): void {
  write(DRAFT_KEY, sheet);
}

export function nextReference(sheets = getSheets()): string {
  const largestSaved = sheets.reduce((max, sheet) => {
    const number = Number(sheet.reference.match(/(\d+)$/)?.[1] ?? 0);
    return Math.max(max, number + 1);
  }, 1);
  const next = Math.max(Number(localStorage.getItem(REFERENCE_KEY)) || 1, largestSaved);
  localStorage.setItem(REFERENCE_KEY, String(next + 1));
  return String(next).padStart(4, '0');
}

export function getInventory(): InventoryPart[] {
  return read<InventoryPart[]>(INVENTORY_KEY, []);
}

export function saveInventory(parts: InventoryPart[]): void {
  write(INVENTORY_KEY, parts);
}

export function getStockUsage(parts: PartLine[]): Map<string, number> {
  const usage = new Map<string, number>();
  for (const line of parts) {
    if (line.inventoryId) usage.set(line.inventoryId, (usage.get(line.inventoryId) ?? 0) + Number(line.quantity || 0));
  }
  return usage;
}

export function calculateStockAfterEdit(
  inventory: InventoryPart[],
  oldParts: PartLine[],
  newParts: PartLine[],
): InventoryPart[] | null {
  const oldUsage = getStockUsage(oldParts);
  const newUsage = getStockUsage(newParts);
  const updated = inventory.map((part) => ({
    ...part,
    stock: part.stock + (oldUsage.get(part.id) ?? 0) - (newUsage.get(part.id) ?? 0),
  }));
  return updated.some((part) => part.stock < 0) ? null : updated;
}

export function saveSheet(sheet: ServiceSheet): { ok: true } | { ok: false; partNumber: string } {
  const sheets = getSheets();
  const existing = sheets.find((item) => item.id === sheet.id);
  const inventory = calculateStockAfterEdit(getInventory(), existing?.parts ?? [], sheet.parts);
  if (!inventory) {
    const partNumber = sheet.parts.find((line) => {
      if (!line.inventoryId) return false;
      const original = getInventory().find((part) => part.id === line.inventoryId);
      const oldUsage = getStockUsage(existing?.parts ?? []).get(line.inventoryId) ?? 0;
      return original && original.stock + oldUsage < line.quantity;
    })?.partNumber ?? 'selected part';
    return { ok: false, partNumber };
  }
  saveInventory(inventory);
  const updated = [sheet, ...sheets.filter((item) => item.id !== sheet.id)];
  write(SHEETS_KEY, updated);
  localStorage.removeItem(DRAFT_KEY);
  return { ok: true };
}

export function deleteSheet(id: string): void {
  const sheets = getSheets();
  const existing = sheets.find((item) => item.id === id);
  if (existing) {
    const inventory = calculateStockAfterEdit(getInventory(), existing.parts, []);
    if (inventory) saveInventory(inventory);
  }
  write(SHEETS_KEY, sheets.filter((item) => item.id !== id));
}

export function savePart(part: InventoryPart): void {
  const parts = getInventory();
  const exists = parts.some((item) => item.id === part.id);
  saveInventory(exists ? parts.map((item) => (item.id === part.id ? part : item)) : [part, ...parts]);
}

export function removePart(id: string): boolean {
  if (getSheets().some((sheet) => sheet.parts.some((line) => line.inventoryId === id))) return false;
  saveInventory(getInventory().filter((part) => part.id !== id));
  return true;
}
