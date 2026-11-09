import { useEffect, useMemo, useState, type ChangeEvent } from 'react';
import checklistSource from '../../data/checklists.json';
import { SignaturePad } from '../../components/SignaturePad';
import { makeEmptySheet } from '../../lib/ids';
import { deleteSheet, getDraft, getInventory, getSheets, nextReference, saveDraft, saveSheet } from '../../lib/localStore';
import type { AppRole, ChecklistMap, ChecklistResult, InventoryPart, ServiceSheet, ServiceStatus } from '../../types';

const checklistMap = checklistSource as unknown as ChecklistMap;
const statusOptions: ServiceStatus[] = ['O', 'C', 'R', 'N/A'];
const valveCounts: Record<string, number> = { '6': 12, '7': 12, '8': 6, '2': 10, '1': 10, '11': 2, '3': 4 };

function freshSheet(technician: string): ServiceSheet {
  const draft = getDraft();
  if (draft?.id && draft.reference) return { ...makeEmptySheet(draft.reference, technician), ...draft } as ServiceSheet;
  return makeEmptySheet(nextReference(), technician) as ServiceSheet;
}

export function ServiceSheets({ technicianName, role, onSaved }: { technicianName: string; role: AppRole; onSaved: () => void }) {
  const [sheet, setSheet] = useState<ServiceSheet>(() => freshSheet(technicianName));
  const [saved, setSaved] = useState(getSheets);
  const [inventory, setInventory] = useState(getInventory);
  const [notice, setNotice] = useState('');
  const readOnly = role === 'customer_user';

  useEffect(() => { saveDraft(sheet); }, [sheet]);

  function patch<K extends keyof ServiceSheet>(key: K, value: ServiceSheet[K]) {
    setSheet((current) => ({ ...current, [key]: value, updatedAt: new Date().toISOString() }));
  }

  function field<K extends keyof ServiceSheet>(key: K) {
    return (event: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => patch(key, event.target.value as ServiceSheet[K]);
  }

  const groups = useMemo(() => {
    const chosen = checklistMap[sheet.kind] ?? checklistMap.goldhofer;
    return sheet.kind === 'goldhofer' && sheet.make !== 'Goldhofer' ? checklistMap.common : chosen;
  }, [sheet.kind, sheet.make]);
  const complete = Object.values(sheet.checklist).filter((result) => result.status).length;
  const total = groups.reduce((count, group) => count + group[1].length, 0);

  function setChecklist(key: string, result: Partial<ChecklistResult>) {
    patch('checklist', { ...sheet.checklist, [key]: { ...(sheet.checklist[key] ?? { status: '', comment: '' }), ...result } });
  }

  function setValve(key: string, result: Partial<ServiceSheet['valveTests'][string]>) {
    patch('valveTests', { ...sheet.valveTests, [key]: { ...(sheet.valveTests[key] ?? { status: '', repair: '' }), ...result } });
  }

  function addPart(part?: InventoryPart) {
    patch('parts', [...sheet.parts, { inventoryId: part?.id, partNumber: part?.partNumber ?? '', description: part?.description ?? '', quantity: 1 }]);
  }

  function updatePart(index: number, change: Partial<ServiceSheet['parts'][number]>) {
    patch('parts', sheet.parts.map((part, i) => i === index ? { ...part, ...change } : part));
  }

  function refreshLists() { setSaved(getSheets()); setInventory(getInventory()); onSaved(); }

  function newSheet() {
    const reference = nextReference();
    setSheet(makeEmptySheet(reference, technicianName) as ServiceSheet);
    setNotice('Started a new service sheet.');
  }

  function saveCurrent() {
    const result = saveSheet({ ...sheet, technician: readOnly ? sheet.technician : technicianName || sheet.technician, updatedAt: new Date().toISOString() });
    if (!result.ok) { setNotice(`Not enough stock for ${result.partNumber}. Adjust inventory before saving.`); return; }
    setNotice(`Service sheet ${sheet.reference} saved on this device.`);
    refreshLists();
  }

  function openSheet(item: ServiceSheet) { setSheet(item); setNotice(`Opened service sheet ${item.reference}.`); window.scrollTo({ top: 0, behavior: 'smooth' }); }

  function removeSheet(item: ServiceSheet) {
    if (!window.confirm(`Delete service sheet ${item.reference}?`)) return;
    deleteSheet(item.id); refreshLists(); setNotice(`Service sheet ${item.reference} deleted.`);
  }

  return <section className="service-module">
    <div className="module-heading"><div><span className="eyebrow">Workshop & field service</span><h2>Service sheet</h2><p>Inspection and repair record</p></div><div className="service-actions"><span className="badge">{sheet.reference || 'New sheet'}</span><button className="secondary" onClick={() => window.print()}>Print / PDF</button><button className="primary" onClick={saveCurrent} disabled={readOnly}>Save service sheet</button></div></div>
    {readOnly && <p className="permission-note">Viewer access is read-only.</p>}{notice && <p className="inline-notice" role="status">{notice}</p>}
    <section className="card"><div className="card-head"><div><h3>Job details</h3><p>Customer, equipment, and service record</p></div><span className="badge">{sheet.reference}</span></div><div className="form-grid">
      <label className="span-2">Customer / client<input disabled={readOnly} value={sheet.customer} onChange={field('customer')} placeholder="Company name" /></label>
      <label>Document reference<input readOnly value={sheet.reference} /></label>
      <label>Service date<input disabled={readOnly} type="date" value={sheet.date} onChange={field('date')} /></label>
      <label>Equipment make<select disabled={readOnly} value={sheet.make} onChange={field('make')}>{['Goldhofer','Scheuerle','Nooteboom','HydraRoll / HR','Other'].map((make) => <option key={make}>{make}</option>)}</select></label>
      <label>Service sheet type<select disabled={readOnly} value={sheet.kind} onChange={field('kind')}><option value="goldhofer">Conventional inspection</option><option value="gooseneck">Gooseneck inspection</option><option value="scheuerle">Scheuerle conventional</option><option value="nooteboom">Nooteboom conventional</option><option value="ppu">Power Pack Unit (PPU)</option><option value="reconfigure">Reconfigure conventional</option></select></label>
      <label>Model / configuration<input disabled={readOnly} value={sheet.model} onChange={field('model')} placeholder="Model, axle line, configuration" /></label>
      <label>VIN / registration<input disabled={readOnly} value={sheet.vin} onChange={field('vin')} placeholder="VIN or rego" /></label>
      <label>Odometer / hours<input disabled={readOnly} value={sheet.hours} onChange={field('hours')} placeholder="km or engine hours" /></label>
      <label>Technician / inspected by<input readOnly={Boolean(technicianName)} disabled={readOnly} value={technicianName || sheet.technician} onChange={field('technician')} placeholder="Signed-in technician" /></label>
      <label>Service interval<select disabled={readOnly} value={sheet.interval} onChange={field('interval')}><option value="">Select interval</option>{['3 monthly','6 monthly','12 monthly','Pre-delivery inspection','Breakdown / repair','Reconfiguration','Other'].map((item) => <option key={item}>{item}</option>)}</select></label>
      <label>Next service due<input disabled={readOnly} type="date" value={sheet.nextDue} onChange={field('nextDue')} /></label>
    </div></section>

    <section className="card checklist-card"><div className="card-head"><div><h3>Inspection checklist</h3><p>Mark each item and add comments where needed.</p></div><div className="progress-info">{complete} / {total}<div className="progress-track"><span style={{ width: `${total ? complete / total * 100 : 0}%` }} /></div></div></div><div className="status-legend">O · OK <span>C · Changed</span><span>R · Repaired</span><span>N/A</span></div>
      {groups.map(([title, items], sectionIndex) => <div className="check-section" key={title}><h4>{title}<small>{items.length} items</small></h4>{items.map((name, itemIndex) => { const key = `${sheet.kind}-${sectionIndex}-${itemIndex}`; const result = sheet.checklist[key] ?? { status: '', comment: '' }; return <div className="check-row" key={key}><strong>{name}</strong><div className="status-buttons">{statusOptions.map((status) => <button type="button" className={result.status === status ? 'status selected' : 'status'} key={status} disabled={readOnly} onClick={() => setChecklist(key, { status: result.status === status ? '' : status })}>{status}</button>)}</div><input disabled={readOnly} aria-label={`Comments for ${name}`} value={result.comment} onChange={(event) => setChecklist(key, { comment: event.target.value })} placeholder="Comments / findings" /></div>; })}</div>)}
    </section>

    {['goldhofer','scheuerle','reconfigure'].includes(sheet.kind) && <section className="card"><div className="card-head"><div><h3>Pressure & system tests</h3><p>Record values for the applicable equipment tests.</p></div><span className="badge">Optional / as applicable</span></div><div className="measurement-grid"><div className="measure-group"><h4>ALB valve test · MIN</h4>{['Lift pressure','Air pressure IN','Air pressure OUT'].map((name) => <label key={name}>{name}<input disabled={readOnly} inputMode="decimal" placeholder="Bar" value={sheet.measurements[`MIN ${name}`] ?? ''} onChange={(event) => patch('measurements', { ...sheet.measurements, [`MIN ${name}`]: event.target.value })} /></label>)}</div><div className="measure-group"><h4>ALB valve test · MAX</h4>{['Lift pressure','Air pressure IN','Air pressure OUT'].map((name) => <label key={name}>{name}<input disabled={readOnly} inputMode="decimal" placeholder="Bar" value={sheet.measurements[`MAX ${name}`] ?? ''} onChange={(event) => patch('measurements', { ...sheet.measurements, [`MAX ${name}`]: event.target.value })} /></label>)}</div></div>
      {['goldhofer','scheuerle'].includes(sheet.kind) && <><h4 className="subheading">Ball valve system tests</h4><p className="muted-text">Mark each point as pass or fail. A failed point opens a repair field.</p><div className="valve-grid">{(sheet.kind === 'goldhofer' ? ['6','7','8','2','1'] : ['7','8','11','3','2']).map((group) => <div className="valve-group" key={group}><h4>Ball valve {group}</h4>{Array.from({ length: valveCounts[group] }, (_, index) => { const key = `${group}-${index + 1}`; const result = sheet.valveTests[key] ?? { status: '', repair: '' }; return <div className="valve-row" key={key}><span>[{group}] {index + 1}</span><div className="valve-status"><button disabled={readOnly} className={result.status === 'pass' ? 'valve-choice pass active' : 'valve-choice'} onClick={() => setValve(key, { status: result.status === 'pass' ? '' : 'pass' })}>✓</button><button disabled={readOnly} className={result.status === 'fail' ? 'valve-choice fail active' : 'valve-choice'} onClick={() => setValve(key, { status: result.status === 'fail' ? '' : 'fail' })}>✕</button></div>{result.status === 'fail' && <input className="repair-field" disabled={readOnly} value={result.repair} onChange={(event) => setValve(key, { repair: event.target.value })} placeholder="Repairs made…" />}</div>; })}</div>)}</div></>}
    </section>}

    <section className="card"><div className="card-head"><div><h3>Parts used</h3><p>Choose an inventory item or enter a part manually.</p></div><button className="secondary" disabled={readOnly} onClick={() => addPart()}>＋ Add part</button></div><div className="parts-table"><div className="parts-header"><span>Part number</span><span>Description</span><span>Qty used</span><span /></div>{sheet.parts.map((part, index) => <div className="part-line" key={`${part.inventoryId ?? 'manual'}-${index}`}><select disabled={readOnly} aria-label="Select inventory part" value={part.inventoryId ?? ''} onChange={(event) => { const chosen = inventory.find((item) => item.id === event.target.value); updatePart(index, chosen ? { inventoryId: chosen.id, partNumber: chosen.partNumber, description: chosen.description } : { inventoryId: undefined }); }}><option value="">Manual / select inventory part</option>{inventory.map((item) => <option key={item.id} value={item.id}>{item.partNumber} · {item.description} (stock {item.stock})</option>)}</select><input disabled={readOnly} aria-label="Part number" value={part.partNumber} onChange={(event) => updatePart(index, { partNumber: event.target.value })} placeholder="Part number" /><input disabled={readOnly} aria-label="Part description" value={part.description} onChange={(event) => updatePart(index, { description: event.target.value })} placeholder="Description" /><input disabled={readOnly} aria-label="Quantity used" min="1" step="1" type="number" value={part.quantity} onChange={(event) => updatePart(index, { quantity: Number(event.target.value) })} /><button disabled={readOnly} className="remove-button" aria-label="Remove part" onClick={() => patch('parts', sheet.parts.filter((_, i) => i !== index))}>×</button></div>)}</div></section>

    <section className="card"><div className="card-head"><div><h3>Work performed & further notes</h3><p>Repairs completed, defects found, recommendations and follow-up work.</p></div></div><div className="form-grid"><label className="full-width">Notes<textarea disabled={readOnly} value={sheet.notes} onChange={field('notes')} placeholder="Record findings, work carried out, and recommendations…" /></label><label>Work status<select disabled={readOnly} value={sheet.workStatus} onChange={field('workStatus')}>{['Completed','Completed with recommendations','Further work required','Inspection only'].map((item) => <option key={item}>{item}</option>)}</select></label><label>Customer notified<select disabled={readOnly} value={sheet.notified} onChange={field('notified')}>{['Yes','No','Not applicable'].map((item) => <option key={item}>{item}</option>)}</select></label><label className="span-2">Follow-up / quote required<input disabled={readOnly} value={sheet.followUp} onChange={field('followUp')} placeholder="Describe follow-up work" /></label></div></section>

    <section className="card"><div className="card-head"><div><h3>Sign-off</h3><p>Technician and customer acknowledgement.</p></div></div><div className="signature-grid"><SignaturePad label="Technician signature" value={sheet.technicianSignature} disabled={readOnly} onChange={(value) => patch('technicianSignature', value)} /><SignaturePad label="Customer signature" value={sheet.customerSignature} disabled={readOnly} onChange={(value) => patch('customerSignature', value)} /></div><div className="form-grid"><label>Completion date<input disabled={readOnly} type="date" value={sheet.completionDate} onChange={field('completionDate')} /></label><label>Customer name<input disabled={readOnly} value={sheet.customerName} onChange={field('customerName')} /></label><label className="span-2">Customer comments<input disabled={readOnly} value={sheet.customerComment} onChange={field('customerComment')} /></label></div></section>

    <section className="card saved-sheets-card"><div className="card-head"><div><h3>Saved service sheets</h3><p>On this device in local preview mode.</p></div><button className="secondary" onClick={newSheet} disabled={readOnly}>＋ New sheet</button></div><div className="saved-sheet-list">{saved.map((item) => <article className="saved-sheet-row" key={item.id}><div><strong>{item.reference} · {item.customer || 'Customer not set'}</strong><small>{item.make} {item.model} · {item.vin || 'No VIN'} · {item.date}</small></div><div className="row-actions"><button className="secondary" onClick={() => openSheet(item)}>Open</button><button className="text-button danger-text" disabled={readOnly} onClick={() => removeSheet(item)}>Delete</button></div></article>)}{!saved.length && <p className="empty-state">No saved sheets yet.</p>}</div></section>
  </section>;
}
