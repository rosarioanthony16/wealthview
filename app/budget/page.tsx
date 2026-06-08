'use client'
import { useEffect, useState, useRef } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { supabase } from '../../lib/supabase'

const CATEGORIES = [
  { key: 'FOOD_AND_DRINK',      label: 'Food & drink',     bg: '#FFF4E6', text: '#C07A00' },
  { key: 'TRANSPORTATION',      label: 'Transportation',   bg: '#E8F4FE', text: '#0B6EC2' },
  { key: 'GENERAL_MERCHANDISE', label: 'Shopping',         bg: '#EEF0FF', text: '#4340C4' },
  { key: 'ENTERTAINMENT',       label: 'Entertainment',    bg: '#FEF0F8', text: '#9B2C6E' },
  { key: 'RENT_AND_UTILITIES',  label: 'Rent & utilities', bg: '#E6F6EE', text: '#1A7A45' },
  { key: 'TRAVEL',              label: 'Travel',           bg: '#E8F4FE', text: '#0B6EC2' },
  { key: 'MEDICAL',             label: 'Medical',          bg: '#E6F6EE', text: '#1A7A45' },
  { key: 'PERSONAL_CARE',       label: 'Personal care',    bg: '#FEF0F8', text: '#9B2C6E' },
]

const CUSTOM_COLORS = [
  { bg: '#EEF0FF', text: '#4340C4' },
  { bg: '#FFF4E6', text: '#C07A00' },
  { bg: '#E8F4FE', text: '#0B6EC2' },
  { bg: '#FEF0F8', text: '#9B2C6E' },
  { bg: '#E6F6EE', text: '#1A7A45' },
  { bg: '#FEF0EE', text: '#C0392B' },
]

type Category   = { key: string, label: string, bg: string, text: string }
type Transaction = { amount: number, date: string, personal_finance_category: { primary: string } | null, pending: boolean }

function barColor(pct: number) {
  if (pct >= 100) return '#C0392B'
  if (pct >= 80)  return '#C07A00'
  return '#2D8C56'
}

function initials(label: string) {
  return label.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
}

export default function Budget() {
  const [loading, setLoading]               = useState(true)
  const [budgets, setBudgets]               = useState<Record<string, number>>({})
  const [spent, setSpent]                   = useState<Record<string, number>>({})
  const [editing, setEditing]               = useState<string | null>(null)
  const [editValue, setEditValue]           = useState('')
  const [userId, setUserId]                 = useState<string | null>(null)
  const [userInitial, setUserInitial]       = useState('A')
  const [customCategories, setCustomCategories] = useState<Category[]>([])
  const [newCatName, setNewCatName]         = useState('')
  const [lastMonthSpent, setLastMonthSpent] = useState<Record<string, number>>({})
  const cancelEditRef = useRef(false)
  const pathname = usePathname()
  const router   = useRouter()

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>
    const reset = () => {
      clearTimeout(timer)
      timer = setTimeout(async () => {
        await supabase.auth.signOut()
        router.push('/login')
      }, 15 * 60 * 1000)
    }
    const events = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart']
    events.forEach(e => window.addEventListener(e, reset))
    reset()
    return () => { clearTimeout(timer); events.forEach(e => window.removeEventListener(e, reset)) }
  }, [])

  useEffect(() => {
    const onUnload = () => { supabase.auth.signOut() }
    window.addEventListener('beforeunload', onUnload)
    return () => window.removeEventListener('beforeunload', onUnload)
  }, [])

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) { router.push('/login'); return }
      const uid = session.user.id
      setUserId(uid)
      setUserInitial((session.user.email?.[0] ?? 'A').toUpperCase())

      const { data: budgetData } = await supabase
        .from('budget_targets')
        .select('category, monthly_limit')
        .eq('user_id', uid)
      if (budgetData) {
        const map: Record<string, number> = {}
        const customs: Category[] = []
        budgetData.forEach(b => {
          map[b.category] = b.monthly_limit
          if (b.category.startsWith('custom::')) {
            const label = b.category.slice(8)
            const color = CUSTOM_COLORS[customs.length % CUSTOM_COLORS.length]
            customs.push({ key: b.category, label, ...color })
          }
        })
        setBudgets(map)
        setCustomCategories(customs)
      }

      const { data: tokens } = await supabase
        .from('plaid_tokens').select('access_token').eq('user_id', uid)
      if (tokens && tokens.length > 0) {
        const now = new Date()
        const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
          .toISOString().split('T')[0]
        const results = await Promise.all(tokens.map(async t => {
          try {
            const res = await fetch('/api/plaid/transactions', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ access_token: t.access_token }),
            })
            if (!res.ok) return []
            const data = await res.json()
            return (data.transactions || []) as Transaction[]
          } catch { return [] }
        }))
        const allTxs = results.flat()

        const spentMap: Record<string, number> = {}
        allTxs
          .filter(tx => tx.date >= firstOfMonth && tx.amount > 0 && !tx.pending)
          .forEach(tx => {
            const cat = tx.personal_finance_category?.primary
            if (cat) spentMap[cat] = (spentMap[cat] ?? 0) + tx.amount
          })
        setSpent(spentMap)

        const firstOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
          .toISOString().split('T')[0]
        const lastMonthMap: Record<string, number> = {}
        allTxs
          .filter(tx => tx.date >= firstOfLastMonth && tx.date < firstOfMonth && tx.amount > 0 && !tx.pending)
          .forEach(tx => {
            const cat = tx.personal_finance_category?.primary
            if (cat) lastMonthMap[cat] = (lastMonthMap[cat] ?? 0) + tx.amount
          })
        setLastMonthSpent(lastMonthMap)
      }
      setLoading(false)
    }).catch(err => { console.error(err); setLoading(false) })
  }, [])

  async function saveBudget(category: string, value: string) {
    if (!userId) return
    const monthly_limit = parseFloat(value) || 0
    await supabase
      .from('budget_targets')
      .upsert({ user_id: userId, category, monthly_limit }, { onConflict: 'user_id,category' })
    setBudgets(prev => ({ ...prev, [category]: monthly_limit }))
    setEditing(null)
  }

  async function addCustomCategory() {
    const label = newCatName.trim()
    if (!label || !userId) return
    const key = 'custom::' + label
    if (customCategories.some(c => c.key === key)) return
    const color = CUSTOM_COLORS[customCategories.length % CUSTOM_COLORS.length]
    const newCat: Category = { key, label, ...color }
    setCustomCategories(prev => [...prev, newCat])
    setBudgets(prev => ({ ...prev, [key]: 0 }))
    setNewCatName('')
    await supabase
      .from('budget_targets')
      .upsert({ user_id: userId, category: key, monthly_limit: 0 }, { onConflict: 'user_id,category' })
  }

  const allCategories: Category[] = [...CATEGORIES, ...customCategories]
  const totalBudget = Object.values(budgets).reduce((s, v) => s + v, 0)
  const totalSpent  = allCategories.reduce((s, c) => s + (spent[c.key] ?? 0), 0)
  const overBudget  = allCategories.filter(c => budgets[c.key] > 0 && (spent[c.key] ?? 0) > budgets[c.key])
  const pctUsed     = totalBudget > 0 ? Math.min((totalSpent / totalBudget) * 100, 100) : 0
  const now          = new Date()
  const month        = now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
  const prevMonthName = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    .toLocaleDateString('en-US', { month: 'long' })
  const reportRows = CATEGORIES
    .map(cat => ({
      ...cat,
      thisMonth: spent[cat.key] ?? 0,
      lastMonth: lastMonthSpent[cat.key] ?? 0,
    }))
    .filter(r => r.thisMonth > 0 || r.lastMonth > 0)
    .sort((a, b) => b.thisMonth - a.thisMonth)

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F0F2F5' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 28, height: 28, border: '2px solid #0B1F44', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          <p style={{ color: '#8B91A0', fontSize: 13 }}>Loading your budget...</p>
        </div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: '#F0F2F5', paddingBottom: 72 }}>
      <div style={{ maxWidth: 480, margin: '0 auto', padding: '0 20px' }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 24, paddingBottom: 20 }}>
          <div style={{ fontSize: 18, fontWeight: 600, color: '#0B1F44' }}>WealthView</div>
          <button
            onClick={async () => { await supabase.auth.signOut(); router.push('/login') }}
            style={{ width: 34, height: 34, borderRadius: '50%', background: '#0B1F44', border: 'none', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            {userInitial}
          </button>
        </div>

        {/* Summary hero */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 11, color: '#8B91A0', marginBottom: 4 }}>{month}</div>
          <div style={{ fontSize: 42, fontWeight: 600, color: '#0B1F44', lineHeight: 1 }}>
            ${totalSpent.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
          </div>
          <div style={{ fontSize: 12, color: '#8B91A0', marginTop: 4 }}>
            of ${totalBudget.toLocaleString('en-US', { minimumFractionDigits: 0 })} budgeted
            {totalBudget > 0 && (
              <span> &nbsp;·&nbsp; <span style={{ color: '#0B1F44', fontWeight: 500 }}>{Math.round(pctUsed)}% used</span></span>
            )}
          </div>
          {totalBudget > 0 && (
            <div style={{ background: '#E4E6EA', borderRadius: 4, height: 5, marginTop: 10, overflow: 'hidden' }}>
              <div style={{ width: `${pctUsed}%`, background: barColor(pctUsed), height: '100%', borderRadius: 4, transition: 'width 0.6s ease' }} />
            </div>
          )}
        </div>

        {/* Over-budget alert */}
        {overBudget.length > 0 && (
          <div style={{ background: '#FEF0EE', borderRadius: 12, padding: '12px 14px', marginBottom: 20, display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            <span style={{ color: '#C0392B', fontSize: 16, flexShrink: 0 }}>⚠</span>
            <div style={{ fontSize: 12, color: '#7A2020', lineHeight: 1.5 }}>
              <span style={{ fontWeight: 600 }}>Over budget: </span>
              {overBudget.map(c => c.label).join(', ')}
            </div>
          </div>
        )}

        {/* Category list */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#0B1F44' }}>Categories</div>
          <div style={{ fontSize: 11, color: '#B0B4BC' }}>Tap a limit to edit</div>
        </div>

        <div style={{ background: '#fff', borderRadius: 16, boxShadow: '0 4px 16px rgba(0,0,0,0.05)', overflow: 'hidden', marginBottom: 28 }}>

          {allCategories.map(cat => {
            const budget    = budgets[cat.key] ?? 0
            const spentAmt  = spent[cat.key] ?? 0
            const pct       = budget > 0 ? Math.min((spentAmt / budget) * 100, 100) : 0
            const over      = budget > 0 && spentAmt > budget
            const isEditing = editing === cat.key

            return (
              <div key={cat.key} style={{ padding: '14px 16px', borderBottom: '0.5px solid #E8EAF0' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                  <div style={{ width: 34, height: 34, borderRadius: 8, background: cat.bg, color: cat.text, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 600, flexShrink: 0 }}>
                    {initials(cat.label)}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
                      <span style={{ fontSize: 13, fontWeight: 500, color: '#0B1F44' }}>{cat.label}</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <span style={{ fontSize: 12, fontWeight: 600, color: over ? '#C0392B' : '#5A6070' }}>
                          ${spentAmt.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                        </span>
                        <span style={{ fontSize: 12, color: '#D0D3DA' }}>/</span>
                        {isEditing ? (
                          <input
                            autoFocus
                            type="number"
                            value={editValue}
                            onChange={e => setEditValue(e.target.value)}
                            onBlur={() => {
                              if (cancelEditRef.current) { cancelEditRef.current = false; return }
                              saveBudget(cat.key, editValue)
                            }}
                            onKeyDown={e => {
                              if (e.key === 'Enter') saveBudget(cat.key, editValue)
                              if (e.key === 'Escape') { cancelEditRef.current = true; setEditing(null) }
                            }}
                            style={{ width: 64, fontSize: 12, textAlign: 'right', border: 'none', borderBottom: '1px solid #378ADD', outline: 'none', background: 'transparent', fontFamily: 'inherit', color: '#0B1F44' }}
                            placeholder="0"
                          />
                        ) : (
                          <span
                            onClick={() => { cancelEditRef.current = false; setEditing(cat.key); setEditValue(budget > 0 ? budget.toString() : '') }}
                            style={{ fontSize: 12, color: budget > 0 ? '#5A6070' : '#B0B4BC', cursor: 'pointer' }}
                          >
                            {budget > 0
                              ? `$${budget.toLocaleString('en-US', { minimumFractionDigits: 0 })}`
                              : 'Set limit'}
                          </span>
                        )}
                      </div>
                    </div>
                    <div style={{ background: '#E4E6EA', borderRadius: 4, height: 5, overflow: 'hidden' }}>
                      <div style={{ width: `${pct}%`, background: barColor(pct), height: '100%', borderRadius: 4, transition: 'width 0.4s ease' }} />
                    </div>
                  </div>
                </div>
              </div>
            )
          })}

          {/* Add custom category */}
          <div style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 34, height: 34, borderRadius: 8, background: '#F0F2F5', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <i className="ti ti-plus" style={{ fontSize: 16, color: '#B0B4BC' }} aria-hidden="true" />
            </div>
            <input
              value={newCatName}
              onChange={e => setNewCatName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') addCustomCategory() }}
              placeholder="Add a category..."
              style={{ flex: 1, border: 'none', outline: 'none', fontSize: 13, color: '#0B1F44', fontFamily: 'inherit', background: 'transparent' }}
            />
            {newCatName.trim() && (
              <button
                onClick={addCustomCategory}
                style={{ background: '#0B1F44', color: '#fff', border: 'none', borderRadius: 8, padding: '6px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0 }}
              >
                Add
              </button>
            )}
          </div>

        </div>

        {/* Month-over-month comparison */}
        {reportRows.length > 0 && (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#0B1F44' }}>Month over month</div>
              <div style={{ fontSize: 11, color: '#B0B4BC' }}>{prevMonthName} → {now.toLocaleDateString('en-US', { month: 'long' })}</div>
            </div>

            <div style={{ background: '#fff', borderRadius: 16, boxShadow: '0 4px 16px rgba(0,0,0,0.05)', overflow: 'hidden', marginBottom: 28 }}>
              {reportRows.map((row, i) => {
                const hasPrev     = row.lastMonth > 0
                const pctChange   = hasPrev ? ((row.thisMonth - row.lastMonth) / row.lastMonth) * 100 : null
                const rounded     = pctChange !== null ? Math.round(Math.abs(pctChange)) : null
                const changeColor = pctChange === null || rounded === 0
                  ? '#8B91A0'
                  : pctChange < 0 ? '#2D8C56' : '#C0392B'
                const changeLabel = pctChange === null
                  ? 'New'
                  : rounded === 0
                  ? '—'
                  : `${pctChange < 0 ? '↓' : '↑'} ${rounded}%`
                return (
                  <div key={row.key} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderBottom: i < reportRows.length - 1 ? '0.5px solid #E8EAF0' : 'none' }}>
                    <div style={{ width: 34, height: 34, borderRadius: 8, background: row.bg, color: row.text, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 600, flexShrink: 0 }}>
                      {initials(row.label)}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 500, color: '#0B1F44', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.label}</div>
                      <div style={{ fontSize: 11, color: '#8B91A0', marginTop: 2 }}>
                        {hasPrev
                          ? `vs $${row.lastMonth.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} in ${prevMonthName}`
                          : `No spend in ${prevMonthName}`}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#0B1F44' }}>
                        ${row.thisMonth.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                      </div>
                      <div style={{ fontSize: 11, fontWeight: 600, color: changeColor, marginTop: 2 }}>
                        {changeLabel}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </>
        )}

      </div>

      {/* Bottom nav */}
      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, background: '#fff', borderTop: '0.5px solid #E4E6EA', padding: '10px 0 14px', display: 'flex', justifyContent: 'space-around', boxShadow: '0 -4px 20px rgba(0,0,0,0.06)', zIndex: 50 }}>
        {[
          { label: 'Home',          icon: 'ti-layout-dashboard', href: '/' },
          { label: 'Transactions',  icon: 'ti-receipt',          href: '/transactions' },
          { label: 'Budget',        icon: 'ti-target',           href: '/budget' },
          { label: 'Subscriptions', icon: 'ti-repeat',           href: '/subscriptions' },
        ].map(item => {
          const active = pathname === item.href
          return (
            <button key={item.href} onClick={() => router.push(item.href)} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, padding: '0 12px', fontFamily: 'inherit' }}>
              <i className={`ti ${item.icon}`} style={{ fontSize: 22, color: active ? '#0B1F44' : '#B0B4BC' }} aria-hidden="true" />
              <span style={{ fontSize: 10, color: active ? '#0B1F44' : '#B0B4BC', fontWeight: active ? 600 : 400 }}>{item.label}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
