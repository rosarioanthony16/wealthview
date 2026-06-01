'use client'
import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

type Subscription = {
  name: string
  amount: number
  frequency: string
  category: string
}

const categoryStyles: Record<string, { bg: string, text: string }> = {
  'Streaming':  { bg: '#EEF0FF', text: '#4340C4' },
  'Software':   { bg: '#E8F4FE', text: '#0B6EC2' },
  'Insurance':  { bg: '#E6F6EE', text: '#1A7A45' },
  'Utilities':  { bg: '#FFF4E6', text: '#C07A00' },
  'Health':     { bg: '#E6F6EE', text: '#1A7A45' },
  'Fashion':    { bg: '#FEF0F8', text: '#9B2C6E' },
  'Other':      { bg: '#F0F2F5', text: '#8B91A0' },
}

function getInitials(name: string) {
  return name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
}

function getCatStyle(cat: string) {
  return categoryStyles[cat] ?? categoryStyles['Other']
}

export default function Subscriptions() {
  const [loading, setLoading] = useState(true)
  const [analyzing, setAnalyzing] = useState(false)
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([])
  const [tokens, setTokens] = useState<string[]>([])

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) { window.location.href = '/login'; return }
      const uid = session.user.id
      const { data } = await supabase.from('plaid_tokens').select('access_token').eq('user_id', uid)
      if (data) setTokens(data.map(t => t.access_token))
      setLoading(false)
    })
  }, [])

  async function analyze() {
    setAnalyzing(true)
    const results = await Promise.all(tokens.map(async token => {
      const res = await fetch('/api/plaid/transactions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ access_token: token }) })
      const data = await res.json()
      return data.transactions || []
    }))
    const res = await fetch('/api/subscriptions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ transactions: results.flat() }) })
    const data = await res.json()
    setSubscriptions(data.subscriptions || [])
    setAnalyzing(false)
  }

  const monthlyTotal = subscriptions.filter(s => s.frequency === 'monthly').reduce((sum, s) => sum + s.amount, 0)
  const yearlyTotal = monthlyTotal * 12

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
          <div style={{ fontSize: 11, color: '#8B91A0', marginBottom: 4 }}>Monthly subscriptions</div>
          <div style={{ fontSize: 42, fontWeight: 600, color: '#0B1F44', lineHeight: 1 }}>
            ${monthlyTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          {subscriptions.length > 0 && (
            <div style={{ fontSize: 12, color: '#8B91A0', marginTop: 4 }}>
              ${yearlyTotal.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}/yr &nbsp;·&nbsp; {subscriptions.length} active
            </div>
          )}
        </div>

        {subscriptions.length === 0 ? (
          <div style={{ background: '#fff', borderRadius: 20, padding: 32, textAlign: 'center', boxShadow: '0 4px 20px rgba(0,0,0,0.06)', marginBottom: 20 }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>🔍</div>
            <div style={{ fontSize: 15, fontWeight: 600, color: '#0B1F44', marginBottom: 6 }}>Find your subscriptions</div>
            <div style={{ fontSize: 12, color: '#8B91A0', marginBottom: 20, lineHeight: 1.6 }}>Claude will scan your last 90 days of transactions and identify recurring charges</div>
            <button
              onClick={analyze}
              disabled={analyzing}
              style={{ width: '100%', background: '#0B1F44', color: '#fff', border: 'none', borderRadius: 12, padding: '14px', fontSize: 13, fontWeight: 600, cursor: 'pointer', opacity: analyzing ? 0.6 : 1, fontFamily: 'inherit' }}
            >
              {analyzing ? (
                'Scanning transactions...'
              ) : '✦ Scan for subscriptions'}
            </button>
          </div>
        ) : (
          <>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#0B1F44', marginBottom: 14 }}>Active subscriptions</div>
            {subscriptions.map((sub, i) => {
              const style = getCatStyle(sub.category)
              return (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: i < subscriptions.length - 1 ? '0.5px solid #E8EAF0' : 'none' }}>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                    <div style={{ width: 36, height: 36, borderRadius: 10, background: style.bg, color: style.text, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 600, flexShrink: 0 }}>
                      {getInitials(sub.name)}
                    </div>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 500, color: '#0B1F44' }}>{sub.name}</div>
                      <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 10, fontWeight: 500, background: style.bg, color: style.text }}>{sub.category}</span>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#0B1F44' }}>${sub.amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                    <div style={{ fontSize: 10, color: '#8B91A0' }}>/ mo</div>
                  </div>
                </div>
              )
            })}

            <div style={{ marginTop: 24, background: '#EEF4FF', borderRadius: 12, padding: '12px 14px' }}>
              <div style={{ fontSize: 11, color: '#6B7ADB', marginBottom: 4, fontWeight: 500 }}>AI insight</div>
              <div style={{ fontSize: 12, color: '#2D3A8C', lineHeight: 1.6 }}>
                You're spending ${monthlyTotal.toFixed(2)}/mo on subscriptions — ${yearlyTotal.toFixed(0)}/year. Review each one and cancel anything you haven't used in the last 30 days.
              </div>
            </div>

            <button
              onClick={analyze}
              disabled={analyzing}
              style={{ width: '100%', background: '#fff', color: '#8B91A0', border: 'none', borderRadius: 12, padding: '14px', fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit', boxShadow: '0 2px 8px rgba(0,0,0,0.05)', marginTop: 16 }}
            >
              {analyzing ? 'Scanning...' : '↺ Rescan transactions'}
            </button>
          </>
        )}

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