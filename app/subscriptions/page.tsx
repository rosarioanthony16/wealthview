'use client'
import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { supabase } from '../../lib/supabase'

type RawTx = {
  name: string
  merchant_name: string | null
  amount: number
  date: string
  personal_finance_category: { primary: string } | null
  pending: boolean
}

type Subscription = {
  name: string
  amount: number   // mean per-charge, treated as monthly cost
  months: number   // distinct calendar months seen
  lastDate: string
}

const ICON_COLORS = [
  { bg: '#EEF0FF', text: '#4340C4' },
  { bg: '#FFF4E6', text: '#C07A00' },
  { bg: '#E8F4FE', text: '#0B6EC2' },
  { bg: '#FEF0F8', text: '#9B2C6E' },
  { bg: '#E6F6EE', text: '#1A7A45' },
  { bg: '#FEF0EE', text: '#C0392B' },
]

const EXCLUDED = new Set(['TRANSFER_IN', 'TRANSFER_OUT', 'LOAN_PAYMENTS', 'INCOME'])

function detectSubscriptions(transactions: RawTx[]): Subscription[] {
  const debits = transactions.filter(t =>
    t.amount > 0 &&
    !t.pending &&
    !EXCLUDED.has(t.personal_finance_category?.primary ?? '')
  )

  const byMerchant: Record<string, RawTx[]> = {}
  for (const tx of debits) {
    const name = (tx.merchant_name ?? tx.name).trim()
    if (!name) continue
    if (!byMerchant[name]) byMerchant[name] = []
    byMerchant[name].push(tx)
  }

  const results: Subscription[] = []
  for (const [name, txs] of Object.entries(byMerchant)) {
    // Must appear in at least 2 distinct calendar months
    const months = new Set(txs.map(t => t.date.slice(0, 7)))
    if (months.size < 2) continue

    const amounts = txs.map(t => t.amount)
    const mean = amounts.reduce((s, a) => s + a, 0) / amounts.length
    if (mean <= 0) continue

    // All charges must be within 10% of the mean
    const withinVariance = amounts.every(a => Math.abs(a - mean) / mean <= 0.10)
    if (!withinVariance) continue

    const lastDate = [...txs].sort((a, b) => b.date.localeCompare(a.date))[0].date
    results.push({
      name,
      amount: Math.round(mean * 100) / 100,
      months: months.size,
      lastDate,
    })
  }

  return results.sort((a, b) => b.amount - a.amount)
}

function getInitials(name: string) {
  return name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
}

function formatDate(dateStr: string) {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export default function Subscriptions() {
  const [loading, setLoading]             = useState(true)
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([])
  const [userInitial, setUserInitial]     = useState('A')
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
    const onUnload = () => { supabase.auth.signOut() }
    window.addEventListener('beforeunload', onUnload)
    return () => window.removeEventListener('beforeunload', onUnload)
  }, [])

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) { window.location.href = '/login'; return }
      setUserInitial((session.user.email?.[0] ?? 'A').toUpperCase())
      const uid = session.user.id
      const { data: tokens } = await supabase
        .from('plaid_tokens').select('access_token').eq('user_id', uid)
      if (tokens && tokens.length > 0) {
        const results = await Promise.all(tokens.map(async t => {
          try {
            const res = await fetch('/api/plaid/transactions', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ access_token: t.access_token }),
            })
            if (!res.ok) return []
            const data = await res.json()
            return (data.transactions || []) as RawTx[]
          } catch { return [] }
        }))
        setSubscriptions(detectSubscriptions(results.flat()))
      }
      setLoading(false)
    }).catch(err => { console.error(err); setLoading(false) })
  }, [])

  const monthlyTotal = subscriptions.reduce((s, sub) => s + sub.amount, 0)
  const yearlyTotal  = monthlyTotal * 12

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F0F2F5' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 28, height: 28, border: '2px solid #0B1F44', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          <p style={{ color: '#8B91A0', fontSize: 13 }}>Scanning transactions...</p>
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

        {/* Summary hero */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 11, color: '#8B91A0', marginBottom: 4 }}>Monthly subscriptions</div>
          <div style={{ fontSize: 42, fontWeight: 600, color: '#0B1F44', lineHeight: 1 }}>
            ${monthlyTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div style={{ fontSize: 12, color: '#8B91A0', marginTop: 4 }}>
            {subscriptions.length > 0
              ? <>${yearlyTotal.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}/yr &nbsp;·&nbsp; {subscriptions.length} detected</>
              : 'No recurring charges detected'}
          </div>
        </div>

        {subscriptions.length === 0 ? (
          <div style={{ background: '#fff', borderRadius: 20, padding: 32, textAlign: 'center', boxShadow: '0 4px 20px rgba(0,0,0,0.06)' }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>🔍</div>
            <div style={{ fontSize: 15, fontWeight: 600, color: '#0B1F44', marginBottom: 6 }}>No subscriptions found</div>
            <div style={{ fontSize: 12, color: '#8B91A0', lineHeight: 1.6 }}>
              Subscriptions are detected when the same merchant charges a similar amount across multiple months. Connect more accounts or check back after more transactions have posted.
            </div>
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#0B1F44' }}>Detected subscriptions</div>
              <div style={{ fontSize: 11, color: '#B0B4BC' }}>{subscriptions.length} recurring</div>
            </div>

            <div style={{ background: '#fff', borderRadius: 16, boxShadow: '0 4px 16px rgba(0,0,0,0.05)', overflow: 'hidden', marginBottom: 28 }}>
              {subscriptions.map((sub, i) => {
                const color = ICON_COLORS[i % ICON_COLORS.length]
                return (
                  <div
                    key={sub.name}
                    style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderBottom: i < subscriptions.length - 1 ? '0.5px solid #E8EAF0' : 'none' }}
                  >
                    <div style={{ display: 'flex', gap: 10, alignItems: 'center', flex: 1, minWidth: 0 }}>
                      <div style={{ width: 36, height: 36, borderRadius: 10, background: color.bg, color: color.text, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 600, flexShrink: 0 }}>
                        {getInitials(sub.name)}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 500, color: '#0B1F44', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {sub.name}
                        </div>
                        <div style={{ fontSize: 11, color: '#8B91A0', marginTop: 2 }}>
                          {sub.months} month{sub.months !== 1 ? 's' : ''} detected &nbsp;·&nbsp; last {formatDate(sub.lastDate)}
                        </div>
                      </div>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 12 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#0B1F44' }}>
                        ${sub.amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </div>
                      <div style={{ fontSize: 10, color: '#8B91A0' }}>/mo</div>
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
