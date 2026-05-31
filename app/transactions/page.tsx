'use client'
import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

type Transaction = {
  transaction_id: string
  name: string
  amount: number
  date: string
  personal_finance_category: { primary: string, detailed: string } | null
  pending: boolean
}

const categoryColors: Record<string, string> = {
  'FOOD_AND_DRINK':       'bg-orange-100 text-orange-700',
  'TRANSPORTATION':       'bg-blue-100 text-blue-700',
  'GENERAL_MERCHANDISE':  'bg-purple-100 text-purple-700',
  'ENTERTAINMENT':        'bg-pink-100 text-pink-700',
  'RENT_AND_UTILITIES':   'bg-green-100 text-green-700',
  'TRANSFER_IN':          'bg-gray-100 text-gray-500',
  'TRANSFER_OUT':         'bg-gray-100 text-gray-500',
  'LOAN_PAYMENTS':        'bg-gray-100 text-gray-500',
  'INCOME':               'bg-emerald-100 text-emerald-700',
  'BANK_FEES':            'bg-red-100 text-red-700',
  'TRAVEL':               'bg-sky-100 text-sky-700',
  'MEDICAL':              'bg-teal-100 text-teal-700',
  'PERSONAL_CARE':        'bg-rose-100 text-rose-700',
}

const categoryLabels: Record<string, string> = {
  'FOOD_AND_DRINK':       'Food & Drink',
  'TRANSPORTATION':       'Transportation',
  'GENERAL_MERCHANDISE':  'Shopping',
  'ENTERTAINMENT':        'Entertainment',
  'RENT_AND_UTILITIES':   'Rent & Utilities',
  'TRANSFER_IN':          'Transfer In',
  'TRANSFER_OUT':         'Transfer Out',
  'LOAN_PAYMENTS':        'Loan Payments',
  'INCOME':               'Income',
  'BANK_FEES':            'Bank Fees',
  'TRAVEL':               'Travel',
  'MEDICAL':              'Medical',
  'PERSONAL_CARE':        'Personal Care',
}

function getCategoryStyle(cat: string | null) {
  if (!cat) return 'bg-gray-100 text-gray-500'
  return categoryColors[cat] ?? 'bg-gray-100 text-gray-500'
}

function getCategoryLabel(cat: string | null) {
  if (!cat) return 'Other'
  return categoryLabels[cat] ?? cat
}

const HIDDEN_CATEGORIES = new Set(['TRANSFER_IN', 'TRANSFER_OUT', 'LOAN_PAYMENTS'])

export default function Transactions() {
  const [loading, setLoading] = useState(true)
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [filter, setFilter] = useState('All')

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) { window.location.href = '/login'; return }
      const uid = session.user.id
      const { data: tokens } = await supabase
        .from('plaid_tokens').select('access_token').eq('user_id', uid)
      if (!tokens || tokens.length === 0) { setLoading(false); return }
      const results = await Promise.all(
        tokens.map(async t => {
          const res = await fetch('/api/plaid/transactions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ access_token: t.access_token }),
          })
          const data = await res.json()
          return data.transactions || []
        })
      )
      const all = results.flat().sort((a: Transaction, b: Transaction) =>
        new Date(b.date).getTime() - new Date(a.date).getTime()
      )
      setTransactions(all)
      setLoading(false)
    })
  }, [])

  const visibleTransactions = transactions.filter(
    t => !HIDDEN_CATEGORIES.has(t.personal_finance_category?.primary ?? '')
  )

  const categories = ['All', ...Array.from(new Set(
    visibleTransactions.map(t => t.personal_finance_category?.primary ?? 'OTHER')
  )).sort()]

  const filtered = filter === 'All'
    ? visibleTransactions
    : visibleTransactions.filter(t => (t.personal_finance_category?.primary ?? 'OTHER') === filter)

  const totalSpent = filtered
    .filter(t => t.amount > 0 && !t.pending)
    .reduce((sum, t) => sum + t.amount, 0)

  const grouped = filtered.reduce((acc: Record<string, Transaction[]>, t) => {
    const date = new Date(t.date + 'T00:00:00').toLocaleDateString('en-US', {
      weekday: 'long', month: 'long', day: 'numeric'
    })
    if (!acc[date]) acc[date] = []
    acc[date].push(t)
    return acc
  }, {})

  if (loading) {
    return (
      <main className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-violet-600 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-gray-400 text-sm">Loading transactions...</p>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="max-w-md mx-auto px-4 pb-8">

        <div className="flex justify-between items-center py-6">
          <div>
            <h1 className="text-xl font-semibold text-gray-900">Transactions</h1>
            <p className="text-xs text-gray-400 mt-0.5">Last 90 days</p>
          </div>
          <button
            onClick={() => window.location.href = '/'}
            className="text-xs text-gray-400 hover:text-gray-600 bg-white border border-gray-200 rounded-lg px-3 py-1.5"
          >
            ← Dashboard
          </button>
        </div>

        <div className="bg-gradient-to-br from-violet-600 to-violet-700 rounded-3xl p-6 mb-4 text-white">
          <p className="text-violet-200 text-xs mb-1 uppercase tracking-wide">Total spent</p>
          <p className="text-4xl font-semibold">
            ${totalSpent.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
          <p className="text-violet-200 text-xs mt-2">{filtered.length} transactions</p>
        </div>

        <div className="flex gap-2 overflow-x-auto pb-2 mb-4">
          {categories.map(cat => (
            <button
              key={cat}
              onClick={() => setFilter(cat)}
              className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                filter === cat
                  ? 'bg-violet-600 text-white'
                  : 'bg-white border border-gray-200 text-gray-600 hover:border-violet-300'
              }`}
            >
              {cat === 'All' ? 'All' : getCategoryLabel(cat)}
            </button>
          ))}
        </div>

        {Object.entries(grouped).map(([date, txns]) => (
          <div key={date} className="mb-4">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">{date}</p>
            <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
              <div className="divide-y divide-gray-50">
                {txns.map(t => {
                  const cat = t.personal_finance_category?.primary ?? null
                  return (
                    <div key={t.transaction_id} className="flex justify-between items-center px-4 py-3">
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-gray-800 truncate">{t.name}</p>
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${getCategoryStyle(cat)}`}>
                            {getCategoryLabel(cat)}
                          </span>
                        </div>
                      </div>
                      <div className="text-right ml-3 flex-shrink-0">
                        <p className={`text-sm font-semibold ${t.amount < 0 ? 'text-green-600' : 'text-gray-900'}`}>
                          {t.amount < 0 ? '+' : '-'}${Math.abs(t.amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </p>
                        {t.pending && <p className="text-xs text-gray-400">Pending</p>}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        ))}

        {filtered.length === 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center">
            <p className="text-gray-400 text-sm">No transactions found</p>
          </div>
        )}

      </div>
    </main>
  )
}