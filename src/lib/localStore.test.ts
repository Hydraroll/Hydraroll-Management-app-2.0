import { beforeEach, describe, expect, it } from 'vitest';
import { calculateStockAfterEdit, nextReference } from './localStore';
import type { InventoryPart, PartLine, ServiceSheet } from '../types';

const inventory: InventoryPart[] = [{ id: 'part-1', partNumber: '173777', description: 'BG3 coupling', stock: 4, updatedAt: '2026-01-01T00:00:00.000Z' }];
const line = (quantity: number): PartLine => ({ inventoryId: 'part-1', partNumber: '173777', description: 'BG3 coupling', quantity });

class MemoryStorage implements Storage {
  private readonly items = new Map<string, string>();
  get length() { return this.items.size; }
  clear() { this.items.clear(); }
  getItem(key: string) { return this.items.get(key) ?? null; }
  key(index: number) { return [...this.items.keys()][index] ?? null; }
  removeItem(key: string) { this.items.delete(key); }
  setItem(key: string, value: string) { this.items.set(key, String(value)); }
}

describe('local preview data rules', () => {
  beforeEach(() => { Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: new MemoryStorage() }); });

  it('assigns sequential four-digit references and skips existing references', () => {
    expect(nextReference([])).toBe('0001');
    const saved = [{ reference: '0012' } as ServiceSheet];
    expect(nextReference(saved)).toBe('0013');
  });

  it('deducts only the added quantity when an existing sheet is edited', () => {
    const result = calculateStockAfterEdit(inventory, [line(1)], [line(3)]);
    expect(result?.[0].stock).toBe(2);
  });

  it('restores stock when an existing sheet removes an inventory part', () => {
    const result = calculateStockAfterEdit(inventory, [line(2)], []);
    expect(result?.[0].stock).toBe(6);
  });

  it('rejects a stock change that would make the balance negative', () => {
    expect(calculateStockAfterEdit(inventory, [], [line(5)])).toBeNull();
  });
});
