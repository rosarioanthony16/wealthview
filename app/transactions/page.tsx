'use client'
import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { supabase } from '../../lib/supabase'

type Transaction = {
  transaction_id: string
  name: string
  merchant_name: string | null
  amount: number
  date: string
  personal_finance_category: { primary: string, detailed: string } | null
  pending: boolean
}

const categoryColors: Record<string, { bg: string, text: string }> = {
  'FOOD_AND_DRINK':      { bg: '#FFF4E6', text: '#C07A00' },
  'TRANSPORTATION':      { bg: '#E8F4FE', text: '#0B6EC2' },
  'GENERAL_MERCHANDISE': { bg: '#EEF0FF', text: '#4340C4' },
  'ENTERTAINMENT':       { bg: '#FEF0F8', text: '#9B2C6E' },
  'RENT_AND_UTILITIES':  { bg: '#E6F6EE', text: '#1A7A45' },
  'INCOME':              { bg: '#E6F6EE', text: '#1A7A45' },
  'BANK_FEES':           { bg: '#FEF0EE', text: '#C0392B' },
  'TRAVEL':              { bg: '#E8F4FE', text: '#0B6EC2' },
  'MEDICAL':             { bg: '#E6F6EE', text: '#1A7A45' },
  'PERSONAL_CARE':       { bg: '#FEF0F8', text: '#9B2C6E' },
}

const categoryLabels: Record<string, string> = {
  'FOOD_AND_DRINK':      'Food & drink',
  'TRANSPORTATION':      'Transportation',
  'GENERAL_MERCHANDISE': 'Shopping',
  'ENTERTAINMENT':       'Entertainment',
  'RENT_AND_UTILITIES':  'Rent & utilities',
  'INCOME':              'Income',
  'BANK_FEES':           'Bank fees',
  'TRAVEL':              'Travel',
  'MEDICAL':             'Medical',
  'PERSONAL_CARE':       'Personal care',
}

const HIDDEN = new Set(['TRANSFER_IN', 'TRANSFER_OUT', 'LOAN_PAYMENTS'])

function getInitials(name: string) {
  return name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
}

function getCatStyle(cat: string | null) {
  if (!cat) return { bg: '#F0F2F5', text: '#8B91A0' }
  return categoryColors[cat] ?? { bg: '#F0F2F5', text: '#8B91A0' }
}

function getCatLabel(cat: string | null) {
  if (!cat) return 'Other'
  return categoryLabels[cat] ?? cat.toLowerCase().replace(/_/g, ' ')
}

export default function Transactions() {
  const [loading, setLoading] = useState(true)
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('All')
  const [userInitial, setUserInitial] = useState('A')
  const pathname = usePathname()

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>
    const reset = () => {
      clearTimeout(timer)
      timer = setTimeout(async () => {
        await supabase.auth.signOut()
        window.location.href = '/login'
      }, 15 * 60 * 1000)
    }
    const events = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart']
    events.forEach(e => window.addEventListener(e, reset))
    reset()
    return () => { clearTimeout(timer); events.forEach(e => window.removeEventListener(e, reset)) }
  }, [])

  useEffect(() => {
    const handleUnload = () => { supabase.auth.signOut() }
    window.addEventListener('beforeunload', handleUnload)
    return () => window.removeEventListener('beforeunload', handleUnload)
  }, [])

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) { window.location.href = '/login'; return }
      setUserInitial((session.user.email?.[0] ?? 'A').toUpperCase())
      const uid = session.user.id
      const { data: tokens } = await supabase.from('plaid_tokens').select('access_token').eq('user_id', uid)
      if (!tokens || tokens.length === 0) { setLoading(false); return }
      const results = await Promise.all(tokens.map(async t => {
        try {
          const res = await fetch('/api/plaid/transactions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ access_token: t.access_token }) })
          if (!res.ok) return []
          const data = await res.json()
          return (data.transactions || []) as Transaction[]
        } catch { return [] }
      }))
      const all = results.flat().sort((a, b) => b.date.localeCompare(a.date))
      setTransactions(all)
      setLoading(false)
    }).catch(err => { console.error(err); setLoading(false) })
  }, [])

  const visible = transactions.filter(t => !HIDDEN.has(t.personal_finance_category?.primary ?? ''))

  const categories = ['All', ...Array.from(new Set(visible.map(t => t.personal_finance_category?.primary ?? 'OTHER'))).sort()]

  const filtered = visible.filter(t => {
    const displayName = (t.merchant_name ?? t.name).toLowerCase()
    const matchesSearch = displayName.includes(search.toLowerCase())
    const matchesCategory = categoryFilter === 'All' || (t.personal_finance_category?.primary ?? 'OTHER') === categoryFilter
    return matchesSearch && matchesCategory
  })

  const totalSpent = filtered.filter(t => t.amount > 0 && !t.pending).reduce((sum, t) => sum + t.amount, 0)

  const grouped = filtered.reduce((acc: Record<string, Transaction[]>, t) => {
    const date = new Date(t.date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
    if (!acc[date]) acc[date] = []
    acc[date].push(t)
    return acc
  }, {})

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F0F2F5' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 28, height: 28, border: '2px solid #0B1F44', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          <p style={{ color: '#8B91A0', fontSize: 13 }}>Loading transactions...</p>
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
            onClick={async () => { await supabase.auth.signOut(); window.location.href = '/login' }}
            style={{ width: 34, height: 34, borderRadius: '50%', background: '#0B1F44', border: 'none', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            {userInitial}
          </button>
        </div>

        {/* Summary */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 11, color: '#8B91A0', marginBottom: 4 }}>Spent last 90 days</div>
          <div style={{ fontSize: 42, fontWeight: 600, color: '#0B1F44', lineHeight: 1 }}>
            ${totalSpent.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
          </div>
          <div style={{ fontSize: 12, color: '#8B91A0', marginTop: 4 }}>{filtered.length} transactions</div>
        </div>

        {/* Search */}
        <div style={{ background: '#fff', borderRadius: 12, padding: '10px 14px', boxShadow: '0 4px 16px rgba(0,0,0,0.05)', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
          <i className="ti ti-search" style={{ fontSize: 16, color: '#B0B4BC', flexShrink: 0 }} aria-hidden="true" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search merchants..."
            style={{ border: 'none', outline: 'none', fontSize: 13, color: '#0B1F44', width: '100%', fontFamily: 'inherit', background: 'transparent' }}
          />
        </div>

        {/* Category filter */}
        <div style={{ background: '#fff', borderRadius: 12, padding: '10px 14px', boxShadow: '0 4px 16px rgba(0,0,0,0.05)', marginBottom: 24, display: 'flex', alignItems: 'center', gap: 8 }}>
          <i className="ti ti-filter" style={{ fontSize: 16, color: '#B0B4BC', flexShrink: 0 }} aria-hidden="true" />
          <select
            value={categoryFilter}
            onChange={e => setCategoryFilter(e.target.value)}
            style={{ border: 'none', outline: 'none', fontSize: 13, color: '#0B1F44', width: '100%', fontFamily: 'inherit', background: 'transparent', cursor: 'pointer', appearance: 'none' }}
          >
            {categories.map(cat => (
              <option key={cat} value={cat}>{cat === 'All' ? 'All categories' : getCatLabel(cat)}</option>
            ))}
          </select>
        </div>

        {/* Transactions grouped by date */}
        {filtered.length === 0 ? (
          <div style={{ background: '#fff', borderRadius: 20, padding: 32, textAlign: 'center', boxShadow: '0 4px 20px rgba(0,0,0,0.06)' }}>
            <div style={{ fontSize: 13, color: '#8B91A0' }}>
              {transactions.length === 0 ? 'Connect an account to see transactions' : 'No transactions match your filters'}
            </div>
          </div>
        ) : (
          Object.entries(grouped).map(([date, txns]) => (
            <div key={date} style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#B0B4BC', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>{date}</div>
              <div style={{ background: '#fff', borderRadius: 16, boxShadow: '0 4px 16px rgba(0,0,0,0.05)', overflow: 'hidden' }}>
                {txns.map((t, i) => {
                  const cat = t.personal_finance_category?.primary ?? null
                  const catStyle = getCatStyle(cat)
                  const displayName = t.merchant_name ?? t.name
                  return (
                    <div key={t.transaction_id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderBottom: i < txns.length - 1 ? '0.5px solid #E8EAF0' : 'none' }}>
                      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flex: 1, minWidth: 0 }}>
                        <div style={{ width: 36, height: 36, borderRadius: 10, background: catStyle.bg, color: catStyle.text, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 600, flexShrink: 0 }}>
                          {getInitials(displayName)}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 500, color: '#0B1F44', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{displayName}</div>
                          <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 10, fontWeight: 500, background: catStyle.bg, color: catStyle.text }}>{getCatLabel(cat)}</span>
                        </div>
                      </div>
                      <div style={{ textAlign: 'right', marginLeft: 12, flexShrink: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: t.amount < 0 ? '#2D8C56' : '#C0392B' }}>
                          {t.amount < 0 ? '+' : '-'}${Math.abs(t.amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </div>
                        {t.pending && <div style={{ fontSize: 10, color: '#B0B4BC' }}>Pending</div>}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ))
        )}

      </div>

      {/* Bottom nav */}
      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, background: '#fff', borderTop: '0.5px solid #E4E6EA', padding: '10px 0 14px', display: 'flex', justifyContent: 'space-around', boxShadow: '0 -4px 20px rgba(0,0,0,0.06)', zIndex: 50 }}>
        {[
          { label: 'Home', icon: 'ti-layout-dashboard', href: '/' },
          { label: 'Transactions', icon: 'ti-receipt', href: '/transactions' },
          { label: 'Budget', icon: 'ti-target', href: '/budget' },
          { label: 'Subscriptions', icon: 'ti-repeat', href: '/subscriptions' },
        ].map(item => {
          const active = pathname === item.href
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
