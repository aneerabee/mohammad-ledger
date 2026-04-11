export const FILTER_ALL = 'all'

export const statusOrder = [
  'new',
  'sent_to_operator',
  'under_review',
  'issue',
  'approved',
  'customer_confirmed',
  'sent_to_accountant',
  'paid',
  'closed',
]

export function createEmptyTransferDraft() {
  return {
    customerId: '',
    senderName: '',
    reference: '',
  }
}

export function createEmptyCustomerDraft() {
  return {
    name: '',
    openingBalance: '',
    settledTotal: '',
  }
}

export function normalizeReference(reference) {
  return reference.trim().toUpperCase()
}

export function normalizeName(name) {
  return name.trim().replace(/\s+/g, ' ')
}

export function parseMoney(value) {
  if (value === '' || value === null || value === undefined) {
    return 0
  }

  const parsed = Number(value)
  return Number.isNaN(parsed) ? 0 : parsed
}

export function computeMargin(systemAmount, customerAmount) {
  if (typeof systemAmount !== 'number' || typeof customerAmount !== 'number') {
    return null
  }

  return systemAmount - customerAmount
}

export function buildCustomerFromDraft(draft, existingCustomers = []) {
  const name = normalizeName(draft.name)

  if (!name) {
    return { ok: false, error: 'يجب إدخال اسم الزبون.' }
  }

  const duplicate = existingCustomers.some(
    (item) => normalizeName(item.name).toLowerCase() === name.toLowerCase(),
  )

  if (duplicate) {
    return { ok: false, error: 'الزبون موجود مسبقًا.' }
  }

  const now = new Date()

  return {
    ok: true,
    value: {
      id: now.getTime(),
      name,
      openingBalance: parseMoney(draft.openingBalance),
      settledTotal: parseMoney(draft.settledTotal),
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    },
  }
}

export function buildTransferFromDraft(draft, existingTransfers = [], customers = []) {
  const senderName = normalizeName(draft.senderName)
  const reference = normalizeReference(draft.reference)
  const customerId = Number(draft.customerId)
  const customer = customers.find((item) => item.id === customerId)

  if (!customer) {
    return { ok: false, error: 'يجب اختيار الزبون من القائمة.' }
  }

  if (!senderName || !reference) {
    return { ok: false, error: 'يجب إدخال اسم المرسل ورقم الحوالة.' }
  }

  const duplicate = existingTransfers.some(
    (item) => normalizeReference(item.reference) === reference,
  )

  if (duplicate) {
    return { ok: false, error: 'رقم الحوالة موجود مسبقًا.' }
  }

  const now = new Date()

  return {
    ok: true,
    value: {
      id: now.getTime(),
      customerId,
      senderName,
      receiverName: customer.name,
      reference,
      status: 'new',
      issueCode: '',
      systemAmount: null,
      customerAmount: null,
      margin: null,
      paymentStatus: 'pending',
      note: '',
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    },
  }
}

export function transitionTransfer(item, nextStatus) {
  const nextItem = {
    ...item,
    status: nextStatus,
    updatedAt: new Date().toISOString(),
  }

  if (nextStatus === 'issue') {
    nextItem.paymentStatus = 'pending'
  }

  if (nextStatus === 'paid' || nextStatus === 'closed') {
    nextItem.paymentStatus = 'paid'
  }

  if (nextStatus !== 'issue') {
    nextItem.issueCode = ''
  }

  return nextItem
}

export function updateAmount(item, field, value) {
  const parsed = value === '' ? null : Number(value)

  if (Number.isNaN(parsed)) {
    return item
  }

  const nextItem = {
    ...item,
    [field]: parsed,
    updatedAt: new Date().toISOString(),
  }

  return {
    ...nextItem,
    margin: computeMargin(nextItem.systemAmount, nextItem.customerAmount),
  }
}

export function togglePayment(item) {
  const nextPaid = item.paymentStatus === 'paid' ? 'pending' : 'paid'
  const nextStatus =
    nextPaid === 'paid'
      ? item.status === 'closed'
        ? 'closed'
        : 'paid'
      : item.status === 'paid' || item.status === 'closed'
        ? 'sent_to_accountant'
        : item.status

  return {
    ...item,
    paymentStatus: nextPaid,
    status: nextStatus,
    updatedAt: new Date().toISOString(),
  }
}

export function updateTransferField(item, field, value) {
  return {
    ...item,
    [field]: value,
    updatedAt: new Date().toISOString(),
  }
}

export function updateCustomerField(item, field, value) {
  const moneyField = field === 'openingBalance' || field === 'settledTotal'

  return {
    ...item,
    [field]: moneyField ? parseMoney(value) : value,
    updatedAt: new Date().toISOString(),
  }
}

export function filterTransfers(transfers, filters, customersById = new Map()) {
  const normalizedSearch = filters.searchTerm.trim().toLowerCase()

  return transfers.filter((item) => {
    const customerName = (customersById.get(item.customerId)?.name || item.receiverName || '').toLowerCase()
    const matchesSearch =
      normalizedSearch === '' ||
      item.reference.toLowerCase().includes(normalizedSearch) ||
      item.senderName.toLowerCase().includes(normalizedSearch) ||
      customerName.includes(normalizedSearch) ||
      (item.note || '').toLowerCase().includes(normalizedSearch)

    const matchesStatus =
      filters.statusFilter === FILTER_ALL || item.status === filters.statusFilter

    const matchesPayment =
      filters.paymentFilter === FILTER_ALL || item.paymentStatus === filters.paymentFilter

    const matchesCustomer =
      filters.customerFilter === FILTER_ALL || item.customerId === Number(filters.customerFilter)

    return matchesSearch && matchesStatus && matchesPayment && matchesCustomer
  })
}

export function sortTransfers(transfers, sortMode, customersById = new Map()) {
  const sorted = [...transfers]

  switch (sortMode) {
    case 'oldest':
      sorted.sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      )
      return sorted
    case 'customer':
      sorted.sort((a, b) =>
        (customersById.get(a.customerId)?.name || a.receiverName || '').localeCompare(
          customersById.get(b.customerId)?.name || b.receiverName || '',
          'ar',
        ),
      )
      return sorted
    case 'sender':
      sorted.sort((a, b) => a.senderName.localeCompare(b.senderName, 'ar'))
      return sorted
    case 'latest':
    default:
      sorted.sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      )
      return sorted
  }
}

export function summarizeTransfers(transfers) {
  const totalSystem = transfers.reduce(
    (sum, item) => sum + (typeof item.systemAmount === 'number' ? item.systemAmount : 0),
    0,
  )
  const totalCustomer = transfers.reduce(
    (sum, item) => sum + (typeof item.customerAmount === 'number' ? item.customerAmount : 0),
    0,
  )
  const totalMargin = transfers.reduce(
    (sum, item) => sum + (typeof item.margin === 'number' ? item.margin : 0),
    0,
  )
  const issueCount = transfers.filter((item) => item.status === 'issue').length
  const readyForAccountant = transfers.filter(
    (item) => item.status === 'customer_confirmed' || item.status === 'sent_to_accountant',
  )
  const paidCount = transfers.filter((item) => item.paymentStatus === 'paid').length

  return {
    totalSystem,
    totalCustomer,
    totalMargin,
    issueCount,
    readyForAccountant,
    paidCount,
  }
}

export function summarizeCustomers(customers, transfers) {
  return customers
    .map((customer) => {
      const ownTransfers = transfers.filter((item) => item.customerId === customer.id)
      const deliveredTotal = ownTransfers.reduce(
        (sum, item) =>
          sum +
          (item.paymentStatus === 'paid' && typeof item.customerAmount === 'number'
            ? item.customerAmount
            : 0),
        0,
      )
      const pendingTotal = ownTransfers.reduce(
        (sum, item) =>
          sum +
          (item.paymentStatus !== 'paid' && typeof item.customerAmount === 'number'
            ? item.customerAmount
            : 0),
        0,
      )

      return {
        ...customer,
        transferCount: ownTransfers.length,
        deliveredTotal,
        pendingTotal,
        currentBalance: customer.openingBalance + deliveredTotal - customer.settledTotal,
      }
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'ar'))
}

export function serializeAppState(state) {
  return JSON.stringify(state, null, 2)
}

export function parseAppStateBackup(text) {
  const parsed = JSON.parse(text)

  if (!parsed || !Array.isArray(parsed.customers) || !Array.isArray(parsed.transfers)) {
    throw new Error('النسخة الاحتياطية غير صالحة.')
  }

  return {
    customers: parsed.customers.map((item) => ({
      openingBalance: 0,
      settledTotal: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      ...item,
      name: normalizeName(item.name || ''),
    })),
    transfers: parsed.transfers.map((item) => ({
      issueCode: '',
      note: '',
      paymentStatus: 'pending',
      systemAmount: null,
      customerAmount: null,
      margin: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      ...item,
      reference: normalizeReference(item.reference || ''),
    })),
  }
}
