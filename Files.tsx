import { useEffect, useMemo, useState, type FormEvent } from 'react';
import type { AppRole } from '../../types';
import { addFiles, listFiles, removeFile, type LocalStoredFile } from './fileStore';

const categories = ['Service reports', 'Equipment manuals', 'Photos', 'Quotes & invoices', 'Other'];

export function Files({ role }: { role: AppRole }) {
  const [files, setFiles] = useState<LocalStoredFile[]>([]);
  const [selected, setSelected] = useState<File[]>([]);
  const [category, setCategory] = useState(categories[0]);
  const [equipment, setEquipment] = useState('');
  const [notes, setNotes] = useState('');
  const [query, setQuery] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const canEdit = ['platform_admin', 'internal_manager', 'technician'].includes(role);

  async function refresh() {
    try { setFiles(await listFiles()); setError(''); }
    catch { setError('Browser file storage is unavailable. Open this app in a current browser to manage files.'); }
  }

  useEffect(() => { void refresh(); }, []);

  const visible = useMemo(() => files.filter((file) => `${file.name} ${file.category} ${file.equipment} ${file.notes}`.toLowerCase().includes(query.toLowerCase())).sort((a, b) => b.added.localeCompare(a.added)), [files, query]);

  async function upload(event: FormEvent) {
    event.preventDefault();
    if (!selected.length) { setNotice('Choose at least one file.'); return; }
    try { await addFiles(selected, category, equipment.trim(), notes.trim()); setSelected([]); setNotes(''); setNotice('Files added on this device.'); await refresh(); }
    catch { setError('Could not save those files in this browser.'); }
  }

  async function download(file: LocalStoredFile) {
    const url = URL.createObjectURL(file.blob);
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = file.name; anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function share(file: LocalStoredFile) {
    const shareFile = new File([file.blob], file.name, { type: file.type || 'application/octet-stream' });
    if (navigator.share && navigator.canShare?.({ files: [shareFile] })) {
      try { await navigator.share({ title: file.name, files: [shareFile] }); } catch (reason) { if (!(reason instanceof DOMException && reason.name === 'AbortError')) setNotice('Device sharing was not available.'); }
    } else {
      await download(file); setNotice('Downloaded so you can share it.');
    }
  }

  async function deleteFile(file: LocalStoredFile) {
    if (!window.confirm(`Delete ${file.name} from this device?`)) return;
    await removeFile(file.id); await refresh();
  }

  return <section className="module-page">
    <div className="module-heading"><div><span className="eyebrow">Equipment documents</span><h2>Files</h2><p>Store manuals, reports, photos, and related documents.</p></div><span className="badge">{files.length} files</span></div>
    {canEdit && <form className="file-upload-form" onSubmit={upload}><label>Files<input type="file" multiple onChange={(event) => setSelected(Array.from(event.target.files ?? []))} /></label><label>Category<select value={category} onChange={(event) => setCategory(event.target.value)}>{categories.map((item) => <option key={item}>{item}</option>)}</select></label><label>Equipment / VIN<input value={equipment} onChange={(event) => setEquipment(event.target.value)} placeholder="Optional VIN, rego, or model" /></label><label>Notes<input value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Optional description" /></label><button className="primary">Add files</button></form>}
    {!canEdit && <p className="permission-note">You have view access to stored files.</p>}
    {notice && <p className="inline-notice" role="status">{notice}</p>}{error && <p className="error-message" role="alert">{error}</p>}
    <div className="toolbar"><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search files" /><button className="secondary" onClick={() => void refresh()}>Refresh</button></div>
    <div className="file-list">{visible.map((file) => <article className="file-row" key={file.id}><div><strong>{file.name}</strong><small>{(file.size / 1024 / 1024).toFixed(2)} MB · {new Date(file.added).toLocaleDateString()}</small></div><span className="file-category">{file.category}</span><div className="file-context">{file.equipment || 'No equipment'}{file.notes && <small>{file.notes}</small>}</div><div className="file-actions"><button className="secondary" onClick={() => void download(file)}>Download</button><button className="secondary" onClick={() => void share(file)}>Share</button>{canEdit && <button className="text-button danger-text" onClick={() => void deleteFile(file)}>Delete</button>}</div></article>)}{!visible.length && !error && <div className="empty-state">No matching files. Add your first document above.</div>}</div>
    <p className="module-footnote">Local preview stores files in this browser. Hosted mode will use the configured private Supabase Storage bucket.</p>
  </section>;
}
