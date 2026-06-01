'use client'
import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

const CATEGORIES = [
  { key: 'FOOD_AND_DRINK',      label: 'Food & Drink',      color: 'bg-orange-400' },
  { key: 'TRANSPORTATION',      label: 'Transportation',    color: 'bg-blue-400' },
  { key: 'GENERAL_MERCHANDISE', label: 'Shopping',          color: 'bg-purple-400' },
  { key: 'ENTERTAINMENT',       label: 'Entertainment',     color: 'bg-pink-400' },
  { key: 'RENT_AND_UTILITIES',  label: 'Rent & Utilities',  color: 'bg-green-400' },
  { key: 'TRAVEL',              label: 'Travel',            color: 'bg-sky-400' },
  { key: 'MEDICAL',             label: 'Medical',           color: 'bg-teal-400' },
  { key: 'PERSONAL_CARE',       label: 'Personal Care',     color: 'bg-rose-400' },
]

type Budget = { category: string, amount: number }
type Transaction = {
  amount: number
  date: string
  personal_finance_category: { primary: string } | null
  pending: boolean
}

export default function Budget() {
  const [loading, setLoading] = useState(true)
  const [budgets, setBudgets] = useState<Record<string, number>>({})
  const [spent, setSpent] = useState<Record<string, number>>({})
  const [editing, setEditing] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const [userId, setUserId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) { window.location.href = '/login'; return }
      const uid = session.user.id
      setUserId(uid)

      const { data: budgetData } = await supabase
        .from('budgets')
        .select('category, amount')
        .eq('user_id', uid)
      if (budgetData) {
        const map: Record<string, number> = {}
        budgetData.forEach((b: Budget) => { map[b.category] = b.amount })
        setBudgets(map)
      }

      const { data: tokens } = await supabase
        .from('plaid_tokens')
        .select('access_token')
        .eq('user_id', uid)

      if (tokens && tokens.length > 0) {
        const now = new Date()
        const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
        const results = await Promise.all(
          tokens.map(async t => {
            const res = await fetch('/api/plaid/transactions', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ access_token: t.access_token }),
            })
            const data = await res.json()
            return (data.transactions || []).filter((tx: Transaction) =>
              new Date(tx.date) >= firstOfMonth && tx.amount > 0 && !tx.pending
            )
          })
        )
        const allTx = results.flat()
        const spentMap: Record<string, number> = {}
        allTx.forEach((tx: any) => {
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
    setSaving(true)
    await supabase
      .from('budgets')
      .upsert({ user_id: userId, category, amount }, { onConflict: 'category' })
    setBudgets(prev => ({ ...prev, [category]: amount }))
    setEditing(null)
    setSaving(false)
  }

  const totalBudget = Object.values(budgets).reduce((s, v) => s + v, 0)
  const totalSpent = CATEGORIES.reduce((s, c) => s + (spent[c.key] ?? 0), 0)

  if (loading) {
    return (
      <main className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-green-600 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-gray-400 text-sm">Loading budget...</p>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="max-w-md mx-auto px-4 pb-8">

        <div className="flex justify-between items-center py-6">
          <div>
            <h1 className="text-xl font-semibold text-gray-900">Budget</h1>
            <p className="text-xs text-gray-400 mt-0.5">
              {new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
            </p>
          </div>
          <button
            onClick={() => window.location.href = '/'}
            className="text-xs text-gray-400 hover:text-gray-600 bg-white border border-gray-200 rounded-lg px-3 py-1.5"
          >
            ← Dashboard
          </button>
        </div>

        <div className="bg-gradient-to-br from-green-600 to-green-700 rounded-3xl p-6 mb-4 text-white">
          <p className="text-green-200 text-xs mb-1 uppercase tracking-wide">Monthly budget</p>
          <p className="text-4xl font-semibold mb-1">
            ${totalSpent.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
          <p className="text-green-200 text-sm">
            of ${totalBudget.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} budgeted
          </p>
          {totalBudget > 0 && (
            <div className="mt-3 bg-green-800 rounded-full h-2">
              <div
                className="bg-white rounded-full h-2 transition-all"
                style={{ width: `${Math.min((totalSpent / totalBudget) * 100, 100)}%` }}
              />
            </div>
          )}
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden mb-4">
          <div className="px-4 pt-4 pb-2">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Categories</p>
            <p className="text-xs text-gray-400 mt-1">Tap a budget amount to edit it</p>
          </div>
          <div className="divide-y divide-gray-50">
            {CATEGORIES.map(cat => {
              const budget = budgets[cat.key] ?? 0
              const spentAmt = spent[cat.key] ?? 0
              const pct = budget > 0 ? Math.min((spentAmt / budget) * 100, 100) : 0
              const over = budget > 0 && spentAmt > budget
              const isEditing = editing === cat.key

              return (
                <div key={cat.key} className="px-4 py-3">
                  <div className="flex justify-between items-center mb-2">
                    <div className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full ${cat.color}`}></div>
                      <span className="text-sm text-gray-800">{cat.label}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-semibold ${over ? 'text-red-500' : 'text-gray-500'}`}>
                        ${spentAmt.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                      </span>
                      <span className="text-xs text-gray-300">/</span>
                      {isEditing ? (
                        <input
                          autoFocus
                          type="number"
                          value={editValue}
                          onChange={e => setEditValue(e.target.value)}
                          onBlur={() => saveBudget(cat.key, parseFloat(editValue) || 0)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') saveBudget(cat.key, parseFloat(editValue) || 0)
                            if (e.key === 'Escape') setEditing(null)
                          }}
                          className="w-20 text-xs text-right border-b border-blue-400 outline-none bg-transparent"
                          placeholder="0"
                        />
                      ) : (
                        <span
                          className="text-xs text-gray-400 cursor-pointer hover:text-blue-600 transition-colors"
                          onClick={() => { setEditing(cat.key); setEditValue(budget > 0 ? budget.toString() : '') }}
                        >
                          {budget > 0 ? `$${budget.toLocaleString('en-US', { minimumFractionDigits: 0 })}` : 'Set budget'}
                        </span>
                      )}
                    </div>
                  </div>
                  {budget > 0 && (
                    <div className="bg-gray-100 rounded-full h-1.5">
                      <div
                        className={`rounded-full h-1.5 transition-all ${over ? 'bg-red-400' : cat.color}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>

      </div>
    </main>
  )
}