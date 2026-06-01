'use client'
import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { usePlaidLink } from 'react-plaid-link'
import { LineChart, Line, XAxis, Tooltip, ResponsiveContainer, Area, AreaChart } from 'recharts'

function PlaidLinkButton({ onSuccess }: { onSuccess: (access_token: string) => void }) {
  const [linkToken, setLinkToken] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/plaid/create-link-token', { method: 'POST' })
      .then(res => res.json())
      .then(data => setLinkToken(data.link_token))
  }, [])

  const onPlaidSuccess = useCallback(async (public_token: string) => {
    const res = await fetch('/api/plaid/exchange-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ public_token }),
    })
    const data = await res.json()
    onSuccess(data.access_token)
  }, [onSuccess])

  const { open, ready } = usePlaidLink({ token: linkToken ?? '', onSuccess: onPlaidSuccess })

  return (
    <button
      onClick={() => open()}
      disabled={!ready}
      style={{ background: 'none', border: 'none', color: '#8B91A0', fontSize: 13, cursor: 'pointer', padding: '8px 0' }}
    >
      + Connect account
    </button>
  )
}

type Tip = { type: 'warning' | 'good' | 'idea', title: string, body: string }

const accountColors: Record<string, string> = {
  depository: '#E8F4FE',
  credit: '#FEF0EE',
  investment: '#EEF0FF',
  loan: '#FFF4E6',
}
const accountTextColors: Record<string, string> = {
  depository: '#0B6EC2',
  credit: '#C0392B',
  investment: '#4340C4',
  loan: '#C07A00',
}

function getInitials(name: string) {
  return name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
}

export default function Home() {
  const [loading, setLoading] = useState(true)
  const [accounts, setAccounts] = useState<any[]>([])
  const [userId, setUserId] = useState<string | null>(null)
  const [tips, setTips] = useState<Tip[]>([])
  const [tipsLoading, setTipsLoading] = useState(false)
  const [customNames, setCustomNames] = useState<Record<string, string>>({})
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingValue, setEditingValue] = useState('')
  const [netWorthHistory, setNetWorthHistory] = useState<{ date: string, value: number }[]>([])

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>
    const resetTimer = () => {
      clearTimeout(timer)
      timer = setTimeout(async () => {
        await supabase.auth.signOut()
        window.location.href = '/login'
      }, 15 * 60 * 1000)
    }
    const events = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart']
    events.forEach(e => window.addEventListener(e, resetTimer))
    resetTimer()
    return () => { clearTimeout(timer); events.forEach(e => window.removeEventListener(e, resetTimer)) }
  }, [])

  useEffect(() => {
    const handleUnload = () => { supabase.auth.signOut() }
    window.addEventListener('beforeunload', handleUnload)
    return () => window.removeEventListener('beforeunload', handleUnload)
  }, [])

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) { window.location.href = '/login'; return }
      const uid = session.user.id
      setUserId(uid)
      await loadCustomNames(uid)
      await loadAllBalances(uid)
      const { data: history } = await supabase
        .from('net_worth_history')
        .select('snapshot_date, net_worth')
        .eq('user_id', uid)
        .order('snapshot_date', { ascending: true })
        .limit(30)
      if (history) {
        setNetWorthHistory(history.map(h => ({
          date: new Date(h.snapshot_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
          value: h.net_worth
        })))
      }
      setLoading(false)
    })
  }, [])

  async function loadCustomNames(uid: string) {
    const { data } = await supabase.from('account_names').select('account_id, custom_name').eq('user_id', uid)
    if (data) {
      const map: Record<string, string> = {}
      data.forEach(row => { map[row.account_id] = row.custom_name })
      setCustomNames(map)
    }
  }

  async function saveCustomName(accountId: string, name: string) {
    if (!userId) return
    await supabase.from('account_names').upsert({ user_id: userId, account_id: accountId, custom_name: name }, { onConflict: 'account_id' })
    setCustomNames(prev => ({ ...prev, [accountId]: name }))
    setEditingId(null)
  }

  async function fetchBalances(token: string) {
    const res = await fetch('/api/plaid/balances', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ access_token: token }) })
    const data = await res.json()
    return data.accounts || []
  }

  async function loadAllBalances(uid: string) {
    const { data: tokens } = await supabase.from('plaid_tokens').select('access_token').eq('user_id', uid)
    if (!tokens || tokens.length === 0) return
    const results = await Promise.all(tokens.map(t => fetchBalances(t.access_token)))
    const allAccounts = results.flat()
    setAccounts(allAccounts)

    const nw = allAccounts.reduce((sum, acc) => {
      const bal = acc.balances.current ?? 0
      return acc.type === 'credit' ? sum - bal : sum + bal
    }, 0)
    const today = new Date().toISOString().split('T')[0]
    const { data: existing } = await supabase.from('net_worth_history').select('id').eq('user_id', uid).eq('snapshot_date', today).maybeSingle()
    if (!existing) await supabase.from('net_worth_history').insert({ user_id: uid, net_worth: Math.round(nw * 100) / 100, snapshot_date: today })
  }

  async function handlePlaidSuccess(token: string) {
    if (!userId) return
    await supabase.from('plaid_tokens').insert({ user_id: userId, access_token: token })
    await loadAllBalances(userId)
  }

  async function fetchTips() {
    setTipsLoading(true)
    const { data: tokens } = await supabase.from('plaid_tokens').select('access_token').eq('user_id', userId!)
    let allTransactions: any[] = []
    if (tokens && tokens.length > 0) {
      const results = await Promise.all(tokens.map(async t => {
        const res = await fetch('/api/plaid/transactions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ access_token: t.access_token }) })
        const data = await res.json()
        return data.transactions || []
      }))
      allTransactions = results.flat()
    }
    const res = await fetch('/api/ai-tips', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accounts, transactions: allTransactions }) })
    const data = await res.json()
    setTips(data.tips || [])
    setTipsLoading(false)
  }

  const netWorth = accounts.reduce((sum, acc) => {
    const bal = acc.balances.current ?? 0
    return acc.type === 'credit' ? sum - bal : sum + bal
  }, 0)
  const totalAssets = accounts.filter(a => a.type !== 'credit' && a.type !== 'loan').reduce((sum, a) => sum + (a.balances.current ?? 0), 0)
  const totalDebt = accounts.filter(a => a.type === 'credit' || a.type === 'loan').reduce((sum, a) => sum + (a.balances.current ?? 0), 0)

  const groups = [
    { label: 'Checking', filter: (a: any) => a.subtype === 'checking' },
    { label: 'Savings', filter: (a: any) => ['savings', 'money market', 'cd'].includes(a.subtype) },
    { label: 'Investments', filter: (a: any) => a.type === 'investment' },
    { label: 'Credit cards', filter: (a: any) => a.type === 'credit' },
    { label: 'Other', filter: (a: any) => a.type !== 'investment' && a.type !== 'credit' && !['checking', 'savings', 'money market', 'cd'].includes(a.subtype) },
  ]

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F0F2F5' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 28, height: 28, border: '2px solid #0B1F44', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          <p style={{ color: '#8B91A0', fontSize: 13 }}>Loading your dashboard...</p>
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
            A
          </button>
        </div>

        {accounts.length > 0 ? (
          <>
            {/* Net worth hero */}
            <div style={{ marginBottom: 24 }}>
              <div style={{ fontSize: 12, color: '#8B91A0', marginBottom: 4 }}>Total net worth</div>
              <div style={{ fontSize: 42, fontWeight: 600, color: '#0B1F44', lineHeight: 1 }}>
                ${netWorth.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
              </div>
              <div style={{ fontSize: 12, color: '#2D8C56', marginTop: 6 }}>↑ Growing over time</div>
            </div>

            {/* Chart */}
            {netWorthHistory.length > 1 && (
              <div style={{ marginBottom: 24 }}>
                <ResponsiveContainer width="100%" height={80}>
                  <AreaChart data={netWorthHistory} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="nwGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#0B1F44" stopOpacity={0.15} />
                        <stop offset="100%" stopColor="#0B1F44" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#B0B4BC' }} tickLine={false} axisLine={false} />
                    <Tooltip
                      formatter={(value: any) => value == null ? ['', ''] : [`$${Number(value).toLocaleString('en-US', { minimumFractionDigits: 0 })}`, 'Net worth']}
                      contentStyle={{ fontSize: 12, borderRadius: 8, border: '0.5px solid #E4E6EA', boxShadow: '0 4px 16px rgba(0,0,0,0.08)' }}
                    />
                    <Area type="monotone" dataKey="value" stroke="#0B1F44" strokeWidth={2} fill="url(#nwGrad)" dot={false} activeDot={{ r: 4, fill: '#0B1F44' }} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Stats row */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 28 }}>
              <div style={{ background: '#fff', borderRadius: 12, padding: '12px 14px', boxShadow: '0 4px 16px rgba(0,0,0,0.05)' }}>
                <div style={{ fontSize: 11, color: '#8B91A0', marginBottom: 4 }}>Assets</div>
                <div style={{ fontSize: 18, fontWeight: 600, color: '#0B1F44' }}>${totalAssets.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</div>
              </div>
              <div style={{ background: '#fff', borderRadius: 12, padding: '12px 14px', boxShadow: '0 4px 16px rgba(0,0,0,0.05)' }}>
                <div style={{ fontSize: 11, color: '#8B91A0', marginBottom: 4 }}>Debt</div>
                <div style={{ fontSize: 18, fontWeight: 600, color: '#C0392B' }}>${totalDebt.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</div>
              </div>
            </div>

            {/* Accounts */}
            <div style={{ marginBottom: 28 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#0B1F44', marginBottom: 14 }}>Accounts</div>
              {groups.map(group => {
                const groupAccounts = accounts.filter(group.filter)
                if (groupAccounts.length === 0) return null
                return (
                  <div key={group.label} style={{ marginBottom: 20 }}>
                    <div style={{ fontSize: 11, color: '#B0B4BC', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>{group.label}</div>
                    {groupAccounts.map((acc, i) => {
                      const balance = acc.balances.current ?? 0
                      const isCredit = acc.type === 'credit'
                      const displayName = customNames[acc.account_id] ?? acc.name
                      const isEditing = editingId === acc.account_id
                      const bg = accountColors[acc.type] ?? '#F0F2F5'
                      const tc = accountTextColors[acc.type] ?? '#0B1F44'
                      return (
                        <div key={acc.account_id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: i < groupAccounts.length - 1 ? '0.5px solid #E8EAF0' : 'none' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
                            <div style={{ width: 34, height: 34, borderRadius: 8, background: bg, color: tc, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 600, flexShrink: 0 }}>
                              {getInitials(displayName)}
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              {isEditing ? (
                                <input
                                  autoFocus
                                  value={editingValue}
                                  onChange={e => setEditingValue(e.target.value)}
                                  onBlur={() => saveCustomName(acc.account_id, editingValue)}
                                  onKeyDown={e => { if (e.key === 'Enter') saveCustomName(acc.account_id, editingValue); if (e.key === 'Escape') setEditingId(null) }}
                                  style={{ fontSize: 13, fontWeight: 500, color: '#0B1F44', border: 'none', borderBottom: '1px solid #378ADD', outline: 'none', background: 'transparent', width: '100%', fontFamily: 'inherit' }}
                                />
                              ) : (
                                <div
                                  style={{ fontSize: 13, fontWeight: 500, color: '#0B1F44', cursor: 'pointer', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                                  onClick={() => { setEditingId(acc.account_id); setEditingValue(displayName) }}
                                >
                                  {displayName}
                                </div>
                              )}
                            </div>
                          </div>
                          <div style={{ fontSize: 13, fontWeight: 600, color: isCredit ? '#C0392B' : '#0B1F44', marginLeft: 12, flexShrink: 0 }}>
                            {isCredit ? '-' : ''}${balance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )
              })}
              <PlaidLinkButton onSuccess={handlePlaidSuccess} />
            </div>

            {/* AI Tips */}
            {tips.length > 0 && (
              <div style={{ marginBottom: 28 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#0B1F44', marginBottom: 14 }}>AI insights</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {tips.map((tip, i) => {
                    const styles = {
                      warning: { bg: '#FEF0EE', icon: '⚠', iconBg: '#FDDDD8', iconColor: '#C0392B' },
                      good:    { bg: '#EBF7F0', icon: '✓', iconBg: '#C8EDD9', iconColor: '#2D8C56' },
                      idea:    { bg: '#EEF4FF', icon: '✦', iconBg: '#D6E4FF', iconColor: '#3B5BDB' },
                    }
                    const s = styles[tip.type] ?? styles.idea
                    return (
                      <div key={i} style={{ background: s.bg, borderRadius: 12, padding: '12px 14px', display: 'flex', gap: 10 }}>
                        <div style={{ width: 28, height: 28, borderRadius: '50%', background: s.iconBg, color: s.iconColor, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, flexShrink: 0 }}>{s.icon}</div>
                        <div>
                          <div style={{ fontSize: 12, fontWeight: 600, color: '#0B1F44', marginBottom: 2 }}>{tip.title}</div>
                          <div style={{ fontSize: 11, color: '#5A6070', lineHeight: 1.5 }}>{tip.body}</div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Actions */}
            <button
              onClick={fetchTips}
              disabled={tipsLoading}
              style={{ width: '100%', background: '#0B1F44', color: '#fff', border: 'none', borderRadius: 14, padding: '15px', fontSize: 13, fontWeight: 600, cursor: 'pointer', opacity: tipsLoading ? 0.6 : 1, fontFamily: 'inherit', marginBottom: 10 }}
            >
              {tipsLoading ? 'Analyzing...' : '✦ Get AI insights'}
            </button>
            <button
              onClick={() => loadAllBalances(userId!)}
              style={{ width: '100%', background: '#fff', color: '#8B91A0', border: 'none', borderRadius: 14, padding: '15px', fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}
            >
              Refresh balances
            </button>
          </>
        ) : (
          <div style={{ background: '#fff', borderRadius: 20, padding: 32, textAlign: 'center', boxShadow: '0 4px 20px rgba(0,0,0,0.06)' }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>🏦</div>
            <div style={{ fontSize: 15, fontWeight: 600, color: '#0B1F44', marginBottom: 6 }}>Connect your accounts</div>
            <div style={{ fontSize: 12, color: '#8B91A0', marginBottom: 20 }}>Link your banks to see your complete financial picture</div>
            <PlaidLinkButton onSuccess={handlePlaidSuccess} />
          </div>
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