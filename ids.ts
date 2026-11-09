export function createId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function makeEmptySheet(reference: string, technician = '') {
  const today = new Date().toISOString().slice(0, 10);
  return {
    id: createId(),
    reference,
    customer: '',
    date: today,
    make: 'Goldhofer',
    kind: 'goldhofer',
    model: '',
    vin: '',
    hours: '',
    technician,
    interval: '',
    nextDue: '',
    checklist: {},
    measurements: {},
    valveTests: {},
    parts: [],
    notes: '',
    workStatus: 'Completed',
    notified: 'Yes',
    followUp: '',
    technicianSignature: '',
    customerSignature: '',
    completionDate: today,
    customerName: '',
    customerComment: '',
    updatedAt: new Date().toISOString(),
  };
}
