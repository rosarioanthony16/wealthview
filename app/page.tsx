'use client'
import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { usePlaidLink } from 'react-plaid-link'

function PlaidLinkButton({ onSuccess, minimal }: { onSuccess: (access_token: string) => void, minimal?: boolean }) {
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

  const { open, ready } = usePlaidLink({
    token: linkToken ?? '',
    onSuccess: onPlaidSuccess,
  })

  if (minimal) {
    return (
      <button
        onClick={() => open()}
        disabled={!ready}
        className="text-xs text-blue-600 hover:text-blue-800 disabled:opacity-50"
      >
        + Add account
      </button>
    )
  }

  return (
    <button
      onClick={() => open()}
      disabled={!ready}
      className="w-full border border-dashed border-gray-300 text-gray-500 rounded-2xl py-4 text-sm hover:border-blue-400 hover:text-blue-600 disabled:opacity-50 transition-colors"
    >
      + Connect a bank account
    </button>
  )
}

type Tip = { type: 'warning' | 'good' | 'idea', title: string, body: string }

const tipConfig = {
  warning: { bg: 'bg-amber-50 border-amber-100', icon: '⚠', iconBg: 'bg-amber-100', iconColor: 'text-amber-600' },
  good:    { bg: 'bg-green-50 border-green-100',  icon: '✓', iconBg: 'bg-green-100',  iconColor: 'text-green-600' },
  idea:    { bg: 'bg-blue-50 border-blue-100',    icon: '✦', iconBg: 'bg-blue-100',   iconColor: 'text-blue-600' },
}

const accountColors: Record<string, string> = {
  depository: 'bg-blue-500',
  credit:     'bg-red-400',
  investment: 'bg-violet-500',
  loan:       'bg-orange-400',
}

export default function Home() {
  const [loading, setLoading] = useState(true)
  const [accounts, setAccounts] = useState<any[]>([])
  const [accessToken, setAccessToken] = useState<string | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [tips, setTips] = useState<Tip[]>([])
  const [tipsLoading, setTipsLoading] = useState(false)
  const [customNames, setCustomNames] = useState<Record<string, string>>({})
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingValue, setEditingValue] = useState('')

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
    return () => {
      clearTimeout(timer)
      events.forEach(e => window.removeEventListener(e, resetTimer))
    }
  }, [])

  useEffect(() => {
    const handleUnload = () => { supabase.auth.signOut() }
    window.addEventListener('beforeunload', handleUnload)
    return () => window.removeEventListener('beforeunload', handleUnload)
  }, [])

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) {
        window.location.href = '/login'
        return
      }
      const uid = session.user.id
      setUserId(uid)
      await loadCustomNames(uid)
      await loadAllBalances(uid)
      setLoading(false)
    })
  }, [])

  async function loadCustomNames(uid: string) {
    const { data } = await supabase
      .from('account_names')
      .select('account_id, custom_name')
      .eq('user_id', uid)
    if (data) {
      const map: Record<string, string> = {}
      data.forEach(row => { map[row.account_id] = row.custom_name })
      setCustomNames(map)
    }
  }

  async function saveCustomName(accountId: string, name: string) {
    if (!userId) return
    await supabase
      .from('account_names')
      .upsert({ user_id: userId, account_id: accountId, custom_name: name }, { onConflict: 'account_id' })
    setCustomNames(prev => ({ ...prev, [accountId]: name }))
    setEditingId(null)
  }

  async function fetchBalances(token: string) {
    const res = await fetch('/api/plaid/balances', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ access_token: token }),
    })
    const data = await res.json()
    return data.accounts || []
  }

  async function loadAllBalances(uid: string) {
    const { data: tokens } = await supabase
      .from('plaid_tokens')
      .select('access_token')
      .eq('user_id', uid)
    if (!tokens || tokens.length === 0) return
    const results = await Promise.all(tokens.map(t => fetchBalances(t.access_token)))
    const allAccounts = results.flat()
    setAccounts(allAccounts)
    setAccessToken(tokens[0].access_token)
  }

  async function handlePlaidSuccess(token: string) {
    if (!userId) return
    await supabase.from('plaid_tokens').insert({ user_id: userId, access_token: token })
    await loadAllBalances(userId)
  }

  async function fetchTips() {
    setTipsLoading(true)
    const res = await fetch('/api/ai-tips', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accounts }),
    })
    const data = await res.json()
    setTips(data.tips || [])
    setTipsLoading(false)
  }

  const netWorth = accounts.reduce((sum, acc) => {
    const bal = acc.balances.current ?? 0
    return acc.type === 'credit' ? sum - bal : sum + bal
  }, 0)

  const totalAssets = accounts
    .filter(a => a.type !== 'credit' && a.type !== 'loan')
    .reduce((sum, a) => sum + (a.balances.current ?? 0), 0)

  const totalDebt = accounts
    .filter(a => a.type === 'credit' || a.type === 'loan')
    .reduce((sum, a) => sum + (a.balances.current ?? 0), 0)

  if (loading) {
    return (
      <main className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-gray-400 text-sm">Loading your dashboard...</p>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="max-w-md mx-auto px-4 pb-8">

        {/* Header */}
        <div className="flex justify-between items-center py-6">
          <div>
            <h1 className="text-xl font-semibold text-gray-900">WealthView</h1>
            <p className="text-xs text-gray-400 mt-0.5">Good evening, Anthony</p>
          </div>
          <button
            onClick={async () => {
              await supabase.auth.signOut()
              window.location.href = '/login'
            }}
            className="text-xs text-gray-400 hover:text-gray-600 bg-white border border-gray-200 rounded-lg px-3 py-1.5"
          >
            Sign out
          </button>
        </div>

        {accounts.length > 0 ? (
          <>
            {/* Net worth hero */}
            <div className="bg-gradient-to-br from-blue-600 to-blue-700 rounded-3xl p-6 mb-4 text-white">
              <p className="text-blue-200 text-xs mb-1 uppercase tracking-wide">Net worth</p>
              <p className="text-4xl font-semibold mb-4">
                ${netWorth.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
              <div className="flex gap-4">
                <div>
                  <p className="text-blue-200 text-xs mb-0.5">Assets</p>
                  <p className="text-white font-semibold text-sm">
                    ${totalAssets.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                  </p>
                </div>
                <div className="w-px bg-blue-500"></div>
                <div>
                  <p className="text-blue-200 text-xs mb-0.5">Debt</p>
                  <p className="text-white font-semibold text-sm">
                    ${totalDebt.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                  </p>
                </div>
              </div>
            </div>

            {/* Accounts */}
            <div className="bg-white rounded-2xl border border-gray-100 mb-4 overflow-hidden">
              <div className="flex justify-between items-center px-4 pt-4 pb-2">
                <p className="text-sm font-semibold text-gray-900">Accounts</p>
                <PlaidLinkButton onSuccess={handlePlaidSuccess} minimal />
              </div>
              <div className="divide-y divide-gray-50">
                {accounts.map(acc => {
                  const balance = acc.balances.current ?? 0
                  const isCredit = acc.type === 'credit'
                  const displayName = customNames[acc.account_id] ?? acc.name
                  const isEditing = editingId === acc.account_id

                  return (
                    <div key={acc.account_id} className="flex justify-between items-center px-4 py-3">
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <div className={`w-2 h-2 rounded-full flex-shrink-0 ${accountColors[acc.type] ?? 'bg-gray-400'}`}></div>
                        <div className="flex-1 min-w-0">
                          {isEditing ? (
                            <input
                              autoFocus
                              value={editingValue}
                              onChange={e => setEditingValue(e.target.value)}
                              onBlur={() => saveCustomName(acc.account_id, editingValue)}
                              onKeyDown={e => {
                                if (e.key === 'Enter') saveCustomName(acc.account_id, editingValue)
                                if (e.key === 'Escape') setEditingId(null)
                              }}
                              className="text-sm text-gray-800 border-b border-blue-400 outline-none bg-transparent w-full"
                            />
                          ) : (
                            <p
                              className="text-sm text-gray-800 truncate cursor-pointer hover:text-blue-600 transition-colors"
                              onClick={() => { setEditingId(acc.account_id); setEditingValue(displayName) }}
                            >
                              {displayName}
                            </p>
                          )}
                          <p className="text-xs text-gray-400 capitalize">{acc.type}</p>
                        </div>
                      </div>
                      <span className={`text-sm font-semibold ml-3 flex-shrink-0 ${isCredit ? 'text-red-500' : 'text-gray-900'}`}>
                        {isCredit ? '-' : ''}${balance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* AI Tips */}
            {tips.length > 0 && (
              <div className="bg-white rounded-2xl border border-gray-100 mb-4 overflow-hidden">
                <div className="px-4 pt-4 pb-2">
                  <p className="text-sm font-semibold text-gray-900">AI insights</p>
                </div>
                <div className="flex flex-col gap-2 px-4 pb-4">
                  {tips.map((tip, i) => {
                    const config = tipConfig[tip.type] ?? tipConfig.idea
                    return (
                      <div key={i} className={`${config.bg} border rounded-xl p-3 flex gap-3`}>
                        <div className={`${config.iconBg} ${config.iconColor} w-7 h-7 rounded-full flex items-center justify-center text-sm flex-shrink-0 mt-0.5`}>
                          {config.icon}
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-gray-900">{tip.title}</p>
                          <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{tip.body}</p>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex flex-col gap-2">
              <button
                onClick={fetchTips}
                disabled={tipsLoading}
                className="w-full bg-violet-600 text-white rounded-2xl py-3.5 text-sm font-semibold hover:bg-violet-700 disabled:opacity-50 transition-colors"
              >
                {tipsLoading ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                    Analyzing...
                  </span>
                ) : '✦ Get AI insights'}
              </button>
              <button
                onClick={() => loadAllBalances(userId!)}
                className="w-full bg-white border border-gray-200 text-gray-600 rounded-2xl py-3.5 text-sm font-semibold hover:bg-gray-50 transition-colors"
              >
                Refresh balances
              </button>
            </div>
          </>
        ) : (
          <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center">
            <div className="w-12 h-12 bg-blue-50 rounded-2xl flex items-center justify-center mx-auto mb-4 text-2xl">
              🏦
            </div>
            <p className="text-gray-900 font-semibold mb-1">Connect your accounts</p>
            <p className="text-gray-400 text-sm mb-6">Link your banks to see your complete financial picture</p>
            <PlaidLinkButton onSuccess={handlePlaidSuccess} />
          </div>
        )}

      </div>
    </main>
  )
}