'use client'
import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

type Subscription = {
  name: string
  amount: number
  frequency: string
  category: string
}

const categoryColors: Record<string, string> = {
  'Streaming':  'bg-purple-100 text-purple-700',
  'Software':   'bg-blue-100 text-blue-700',
  'Insurance':  'bg-green-100 text-green-700',
  'Utilities':  'bg-yellow-100 text-yellow-700',
  'Other':      'bg-gray-100 text-gray-600',
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
      const { data } = await supabase
        .from('plaid_tokens')
        .select('access_token')
        .eq('user_id', uid)
      if (data) setTokens(data.map(t => t.access_token))
      setLoading(false)
    })
  }, [])

  async function analyze() {
    setAnalyzing(true)
    const results = await Promise.all(
      tokens.map(async token => {
        const res = await fetch('/api/plaid/transactions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ access_token: token }),
        })
        const data = await res.json()
        return data.transactions || []
      })
    )
    const allTransactions = results.flat()

    const res = await fetch('/api/subscriptions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transactions: allTransactions }),
    })
    const data = await res.json()
    setSubscriptions(data.subscriptions || [])
    setAnalyzing(false)
  }

  const monthlyTotal = subscriptions
    .filter(s => s.frequency === 'monthly')
    .reduce((sum, s) => sum + s.amount, 0)

  const yearlyTotal = monthlyTotal * 12

  if (loading) {
    return (
      <main className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-purple-600 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-gray-400 text-sm">Loading...</p>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="max-w-md mx-auto px-4 pb-8">

        <div className="flex justify-between items-center py-6">
          <div>
            <h1 className="text-xl font-semibold text-gray-900">Subscriptions</h1>
            <p className="text-xs text-gray-400 mt-0.5">AI-detected recurring charges</p>
          </div>
          <button
            onClick={() => window.location.href = '/'}
            className="text-xs text-gray-400 hover:text-gray-600 bg-white border border-gray-200 rounded-lg px-3 py-1.5"
          >
            ← Dashboard
          </button>
        </div>

        {subscriptions.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center">
            <div className="w-12 h-12 bg-purple-50 rounded-2xl flex items-center justify-center mx-auto mb-4 text-2xl">
              🔍
            </div>
            <p className="text-gray-900 font-semibold mb-1">Find your subscriptions</p>
            <p className="text-gray-400 text-sm mb-6">Claude will scan your last 90 days of transactions and identify recurring charges</p>
            <button
              onClick={analyze}
              disabled={analyzing}
              className="w-full bg-purple-600 text-white rounded-xl py-3 text-sm font-semibold hover:bg-purple-700 disabled:opacity-50 transition-colors"
            >
              {analyzing ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                  Scanning transactions...
                </span>
              ) : '✦ Scan for subscriptions'}
            </button>
          </div>
        ) : (
          <>
            <div className="bg-gradient-to-br from-purple-600 to-purple-700 rounded-3xl p-6 mb-4 text-white">
              <p className="text-purple-200 text-xs mb-1 uppercase tracking-wide">Monthly subscriptions</p>
              <p className="text-4xl font-semibold mb-1">
                ${monthlyTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
              <p className="text-purple-200 text-sm">${yearlyTotal.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} per year · {subscriptions.length} subscriptions found</p>
            </div>

            <div className="bg-white rounded-2xl border border-gray-100 mb-4 overflow-hidden">
              <div className="divide-y divide-gray-50">
                {subscriptions.map((sub, i) => (
                  <div key={i} className="flex justify-between items-center px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="flex-1">
                        <p className="text-sm text-gray-800 font-medium">{sub.name}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${categoryColors[sub.category] ?? categoryColors['Other']}`}>
                            {sub.category}
                          </span>
                          <span className="text-xs text-gray-400 capitalize">{sub.frequency}</span>
                        </div>
                      </div>
                    </div>
                    <span className="text-sm font-semibold text-gray-900">
                      ${sub.amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <button
              onClick={analyze}
              disabled={analyzing}
              className="w-full border border-gray-200 text-gray-600 rounded-2xl py-3.5 text-sm font-semibold hover:bg-gray-50 disabled:opacity-50 transition-colors"
            >
              {analyzing ? 'Scanning...' : '↺ Rescan transactions'}
            </button>
          </>
        )}

      </div>
    </main>
  )
}