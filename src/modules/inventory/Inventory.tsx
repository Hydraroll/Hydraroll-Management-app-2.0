import { useMemo, useState, type FormEvent } from 'react';
import { createId } from '../../lib/ids';
import { getInventory, removePart, savePart } from '../../lib/localStore';
import type { AppRole, InventoryPart } from '../../types';

export function Inventory({ role, onChanged }: { role: AppRole; onChanged: () => void }) {
  const [parts, setParts] = useState(getInventory);
  const [number, setNumber] = useState('');
  const [description, setDescription] = useState('');
  const [stock, setStock] = useState('');
  const [query, setQuery] = useState('');
  const [notice, setNotice] = useState('');
  const canManage = role === 'platform_admin' || role === 'internal_manager';

  const filtered = useMemo(() => parts.filter((part) => `${part.partNumber} ${part.description}`.toLowerCase().includes(query.toLowerCase())), [parts, query]);

  function refresh() {
    const next = getInventory();
    setParts(next);
    onChanged();
  }

  function addPart(event: FormEvent) {
    event.preventDefault();
    if (parts.some((part) => part.partNumber.toLowerCase() === number.trim().toLowerCase())) {
      setNotice('That part number is already in inventory.');
      return;
    }
    const part: InventoryPart = { id: createId(), partNumber: number.trim(), description: description.trim(), stock: Number(stock), updatedAt: new Date().toISOString() };
    savePart(part);
    setNumber(''); setDescription(''); setStock(''); setNotice('Part added.'); refresh();
  }

  function update(part: InventoryPart, patch: Partial<InventoryPart>) {
    savePart({ ...part, ...patch, updatedAt: new Date().toISOString() });
    refresh();
  }

  function deletePart(part: InventoryPart) {
    if (!window.confirm(`Delete ${part.partNumber} from inventory?`)) return;
    if (!removePart(part.id)) {
      setNotice('This part is linked to a saved service sheet and cannot be deleted.');
      return;
    }
    setNotice('Part deleted.'); refresh();
  }

  return <section className="module-page">
    <div className="module-heading"><div><span className="eyebrow">Parts control</span><h2>Inventory / Stocks</h2><p>Track available parts and keep quantities current.</p></div><span className="badge">{parts.length} parts</span></div>
    {notice && <p className="inline-notice" role="status">{notice}</p>}
    {canManage && <form className="inventory-form" onSubmit={addPart}><label>Part number<input required value={number} onChange={(e) => setNumber(e.target.value)} /></label><label>Description<input required value={description} onChange={(e) => setDescription(e.target.value)} /></label><label>Opening stock<input required min="0" step="1" type="number" value={stock} onChange={(e) => setStock(e.target.value)} /></label><button className="primary">Add part</button></form>}
    {!canManage && <p className="permission-note">Only administrators can edit stock records.</p>}
    <div className="toolbar"><input type="search" placeholder="Search part number or description" value={query} onChange={(e) => setQuery(e.target.value)} /><button className="secondary" onClick={refresh}>Refresh</button></div>
    <div className="table-wrap"><table className="data-table"><thead><tr><th>Part number</th><th>Description</th><th>On hand</th><th>Updated</th>{canManage && <th>Actions</th>}</tr></thead><tbody>
      {filtered.map((part) => <tr key={part.id}><td className="strong-cell">{part.partNumber}</td><td>{part.description}</td><td>{canManage ? <input aria-label={`Stock for ${part.partNumber}`} className="stock-input" type="number" min="0" step="1" defaultValue={part.stock} onBlur={(e) => { const value = Number(e.currentTarget.value); if (value !== part.stock && value >= 0) update(part, { stock: value }); }} /> : part.stock}</td><td>{new Date(part.updatedAt).toLocaleDateString()}</td>{canManage && <td><button className="text-button danger-text" onClick={() => deletePart(part)}>Delete</button></td>}</tr>)}
      {!filtered.length && <tr><td colSpan={canManage ? 5 : 4} className="empty-cell">No parts found. Add your first inventory part above.</td></tr>}
    </tbody></table></div>
    <p className="module-footnote">Stock changes made by service sheets are recorded in the shared inventory after cloud sync is connected.</p>
  </section>;
}
