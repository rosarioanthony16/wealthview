'use client'
import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { usePlaidLink } from 'react-plaid-link'

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

  const { open, ready } = usePlaidLink({
    token: linkToken ?? '',
    onSuccess: onPlaidSuccess,
  })

  return (
    <button
      onClick={() => open()}
      disabled={!ready}
      className="w-full bg-blue-600 text-white rounded-xl py-3 text-sm font-semibold hover:bg-blue-700 disabled:opacity-50"
    >
      + Connect a bank account
    </button>
  )
}

export default function Home() {
  const [loading, setLoading] = useState(true)
  const [accounts, setAccounts] = useState<any[]>([])
  const [accessToken, setAccessToken] = useState<string | null>(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        window.location.href = '/login'
      } else {
        setLoading(false)
      }
    })
  }, [])

  async function fetchBalances(token: string) {
    const res = await fetch('/api/plaid/balances', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ access_token: token }),
    })
    const data = await res.json()
    setAccounts(data.accounts || [])
    setAccessToken(token)
  }

  const netWorth = accounts.reduce((sum, acc) => {
    const bal = acc.balances.current ?? 0
    return acc.type === 'credit' ? sum - bal : sum + bal
  }, 0)

  if (loading) {
    return (
      <main className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-400 text-sm">Loading...</p>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-md mx-auto">

        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">WealthView</h1>
            <p className="text-sm text-gray-500">Good evening, Anthony</p>
          </div>
          <button
            onClick={async () => {
              await supabase.auth.signOut()
              window.location.href = '/login'
            }}
            className="text-xs text-gray-400 hover:text-gray-600"
          >
            Sign out
          </button>
        </div>

        {accounts.length > 0 ? (
          <>
            <div className="bg-blue-50 rounded-2xl p-5 mb-4">
              <p className="text-sm text-blue-700 mb-1">Net worth</p>
              <p className="text-4xl font-semibold text-blue-900">
                ${netWorth.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
            </div>

            <div className="bg-white rounded-2xl p-4 border border-gray-100 mb-4">
              <p className="text-sm font-semibold text-gray-900 mb-3">Accounts</p>
              <div className="flex flex-col gap-3">
                {accounts.map(acc => {
                  const balance = acc.balances.current ?? 0
                  const isCredit = acc.type === 'credit'
                  const colors: Record<string, string> = {
                    depository: 'bg-blue-500',
                    credit: 'bg-red-400',
                    investment: 'bg-purple-500',
                    loan: 'bg-orange-400',
                  }
                  return (
                    <div key={acc.account_id} className="flex justify-between items-center">
                      <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${colors[acc.type] ?? 'bg-gray-400'}`}></div>
                        <span className="text-sm text-gray-700">{acc.name}</span>
                      </div>
                      <span className={`text-sm font-semibold ${isCredit ? 'text-red-600' : 'text-gray-900'}`}>
                        {isCredit ? '-' : ''}${balance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>

            <button
              onClick={() => fetchBalances(accessToken!)}
              className="w-full border border-gray-200 text-gray-600 rounded-xl py-3 text-sm font-semibold hover:bg-gray-50 mb-3"
            >
              Refresh balances
            </button>
          </>
        ) : (
          <div className="bg-white rounded-2xl p-6 border border-gray-100 mb-4 text-center">
            <p className="text-gray-500 text-sm mb-4">Connect your bank accounts to get started</p>
            <PlaidLinkButton onSuccess={fetchBalances} />
          </div>
        )}

      </div>
    </main>
  )
}