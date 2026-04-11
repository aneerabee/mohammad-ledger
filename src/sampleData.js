export const statusMeta = {
  received: { label: 'وصلت', color: '#64748b' },
  with_employee: { label: 'عند الموظف', color: '#2563eb' },
  review_hold: { label: 'مراجعة لاحقة', color: '#a16207' },
  picked_up: { label: 'تم السحب', color: '#15803d' },
  issue: { label: 'مشكلة', color: '#dc2626' },
}

export const seedCustomers = []

export const seedTransfers = []

export const issueCatalog = [
  { code: 'name_mismatch', label: 'اسم غير مطابق' },
  { code: 'already_picked', label: 'مسحوبة' },
  { code: 'missing_info', label: 'نقص بيانات' },
  { code: 'system_hold', label: 'معلقة' },
]
