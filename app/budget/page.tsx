'use client'
import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

const CATEGORIES = [
  { key: 'FOOD_AND_DRINK',      label: 'Food & drink',      color: '#E67E22' },
  { key: 'TRANSPORTATION',      label: 'Transportation',    color: '#2980B9' },
  { key: 'GENERAL_MERCHANDISE', label: 'Shopping',          color: '#8E44AD' },
  { key: 'ENTERTAINMENT',       label: 'Entertainment',     color: '#E91E8C' },
  { key: 'RENT_AND_UTILITIES',  label: 'Rent & utilities',  color: '#27AE60' },
  { key: 'TRAVEL',              label: 'Travel',            color: '#0B6EC2' },
  { key: 'MEDICAL',             label: 'Medical',           color: '#16A085' },
  { key: 'PERSONAL_CARE',       label: 'Personal care',     color: '#C0392B' },
]

type Budget = { category: string, amount: number }
type Transaction = { amount: number, date: string, personal_finance_category: { primary: string } | null, pending: boolean }

function getBarColor(pct: number) {
  if (pct >= 100) return '#C0392B'
  if (pct >= 80) return '#C07A00'
  return '#2D8C56'
}

export default function Budget() {
  const [loading, setLoading] = useState(true)
  const [budgets, setBudgets] = useState<Record<string, number>>({})
  const [spent, setSpent] = useState<Record<string, number>>({})
  const [editing, setEditing] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const [userId, setUserId] = useState<string | null>(null)

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) { window.location.href = '/login'; return }
      const uid = session.user.id
      setUserId(uid)
      const { data: budgetData } = await supabase.from('budgets').select('category, amount').eq('user_id', uid)
      if (budgetData) {
        const map: Record<string, number> = {}
        budgetData.forEach((b: Budget) => { map[b.category] = b.amount })
        setBudgets(map)
      }
      const { data: tokens } = await supabase.from('plaid_tokens').select('access_token').eq('user_id', uid)
      if (tokens && tokens.length > 0) {
        const now = new Date()
        const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
        const results = await Promise.all(tokens.map(async t => {
          const res = await fetch('/api/plaid/transactions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ access_token: t.access_token }) })
          const data = await res.json()
          return (data.transactions || []).filter((tx: Transaction) => new Date(tx.date) >= firstOfMonth && tx.amount > 0 && !tx.pending)
        }))
        const spentMap: Record<string, number> = {}
        results.flat().forEach((tx: any) => {
          const cat = tx.personal_finance_category?.primary
          if (cat) spentMap[cat] = (spentMap[cat] ?? 0) + tx.amount
        })
        setSpent(spentMap)
      }
      setLoading(false)
    })
  }, [])

  async function saveBudget(category: string, amount: number) {
    if (!userId) return
    await supabase.from('budgets').upsert({ user_id: userId, category, amount }, { onConflict: 'category' })
    setBudgets(prev => ({ ...prev, [category]: amount }))
    setEditing(null)
  }

  const totalBudget = Object.values(budgets).reduce((s, v) => s + v, 0)
  const totalSpent = CATEGORIES.reduce((s, c) => s + (spent[c.key] ?? 0), 0)
  const overBudget = CATEGORIES.filter(c => budgets[c.key] > 0 && (spent[c.key] ?? 0) > budgets[c.key])
  const pctUsed = totalBudget > 0 ? Math.min((totalSpent / totalBudget) * 100, 100) : 0

  const month = new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F0F2F5' }}>
        <div style={{ width: 28, height: 28, border: '2px solid #0B1F44', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: '#F0F2F5', paddingBottom: 80 }}>
      <div style={{ maxWidth: 480, margin: '0 auto', padding: '0 20px' }}>

        <div style={{ paddingTop: 24, paddingBottom: 20 }}>
          <div style={{ fontSize: 11, color: '#8B91A0', marginBottom: 4 }}>{month}</div>
          <div style={{ fontSize: 42, fontWeight: 600, color: '#0B1F44', lineHeight: 1 }}>
            ${totalSpent.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
          </div>
          <div style={{ fontSize: 12, color: '#8B91A0', marginTop: 4 }}>
            of ${totalBudget.toLocaleString('en-US', { minimumFractionDigits: 0 })} budgeted &nbsp;·&nbsp;
            <span style={{ color: '#0B1F44', fontWeight: 500 }}>{Math.round(pctUsed)}% used</span>
          </div>
          {totalBudget > 0 && (
            <div style={{ background: '#E4E6EA', borderRadius: 4, height: 5, marginTop: 10, overflow: 'hidden' }}>
              <div style={{ width: `${pctUsed}%`, background: getBarColor(pctUsed), height: '100%', borderRadius: 4, transition: 'width 0.6s ease' }} />
            </div>
          )}
        </div>

        {overBudget.length > 0 && (
          <div style={{ background: '#FEF0EE', borderRadius: 12, padding: '12px 14px', marginBottom: 20, display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            <span style={{ color: '#C0392B', fontSize: 16, flexShrink: 0 }}>⚠</span>
            <div style={{ fontSize: 12, color: '#7A2020', lineHeight: 1.5 }}>
              <span style={{ fontWeight: 600 }}>Over budget: </span>
              {overBudget.map(c => c.label).join(', ')}
            </div>
          </div>
        )}

        <div style={{ fontSize: 13, fontWeight: 600, color: '#0B1F44', marginBottom: 14 }}>Categories</div>
        <div style={{ fontSize: 11, color: '#B0B4BC', marginBottom: 16 }}>Tap an amount to set your budget</div>

        {CATEGORIES.map(cat => {
          const budget = budgets[cat.key] ?? 0
          const spentAmt = spent[cat.key] ?? 0
          const pct = budget > 0 ? Math.min((spentAmt / budget) * 100, 100) : 0
          const over = budget > 0 && spentAmt > budget
          const isEditing = editing === cat.key

          return (
            <div key={cat.key} style={{ marginBottom: 18 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
                <span style={{ fontSize: 13, fontWeight: 500, color: '#0B1F44' }}>{cat.label}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
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
                      onBlur={() => saveBudget(cat.key, parseFloat(editValue) || 0)}
                      onKeyDown={e => { if (e.key === 'Enter') saveBudget(cat.key, parseFloat(editValue) || 0); if (e.key === 'Escape') setEditing(null) }}
                      style={{ width: 64, fontSize: 12, textAlign: 'right', border: 'none', borderBottom: '1px solid #378ADD', outline: 'none', background: 'transparent', fontFamily: 'inherit', color: '#0B1F44' }}
                      placeholder="0"
                    />
                  ) : (
                    <span
                      onClick={() => { setEditing(cat.key); setEditValue(budget > 0 ? budget.toString() : '') }}
                      style={{ fontSize: 12, color: budget > 0 ? '#5A6070' : '#B0B4BC', cursor: 'pointer' }}
                    >
                      {budget > 0 ? `$${budget.toLocaleString('en-US', { minimumFractionDigits: 0 })}` : 'Set budget'}
                    </span>
                  )}
                </div>
              </div>
              <div style={{ background: '#E4E6EA', borderRadius: 4, height: 6, overflow: 'hidden' }}>
                <div style={{ width: `${pct}%`, background: getBarColor(pct), height: '100%', borderRadius: 4, transition: 'width 0.4s ease' }} />
              </div>
            </div>
          )
        })}

      </div>

      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, background: '#fff', borderTop: '0.5px solid #E4E6EA', padding: '10px 0 14px', display: 'flex', justifyContent: 'space-around', boxShadow: '0 -4px 20px rgba(0,0,0,0.06)', zIndex: 50 }}>
        {[
          { label: 'Home', icon: 'ti-layout-dashboard', href: '/' },
          { label: 'Transactions', icon: 'ti-receipt', href: '/transactions' },
          { label: 'Budget', icon: 'ti-target', href: '/budget' },
          { label: 'Subscriptions', icon: 'ti-repeat', href: '/subscriptions' },
        ].map(item => {
          const active = typeof window !== 'undefined' && window.location.pathname === item.href
          return (
            <button key={item.href} onClick={() => window.location.href = item.href} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, padding: '0 12px', fontFamily: 'inherit' }}>
              <i className={`ti ${item.icon}`} style={{ fontSize: 22, color: active ? '#0B1F44' : '#B0B4BC' }} aria-hidden="true" />
              <span style={{ fontSize: 10, color: active ? '#0B1F44' : '#B0B4BC', fontWeight: active ? 600 : 400 }}>{item.label}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}