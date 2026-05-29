'use client'
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export default function Home() {
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        window.location.href = '/login'
      } else {
        setLoading(false)
      }
    })
  }, [])

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

        <div className="bg-blue-50 rounded-2xl p-5 mb-4">
          <p className="text-sm text-blue-700 mb-1">Net worth</p>
          <p className="text-4xl font-semibold text-blue-900">$184,320</p>
          <p className="text-sm text-green-600 mt-1">↑ +$2,140 this month</p>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="bg-white rounded-xl p-4 border border-gray-100">
            <p className="text-xs text-gray-500 mb-1">Cash & savings</p>
            <p className="text-lg font-semibold text-gray-900">$28,450</p>
          </div>
          <div className="bg-white rounded-xl p-4 border border-gray-100">
            <p className="text-xs text-gray-500 mb-1">Investments</p>
            <p className="text-lg font-semibold text-gray-900">$201,870</p>
          </div>
          <div className="bg-white rounded-xl p-4 border border-gray-100">
            <p className="text-xs text-gray-500 mb-1">Total debt</p>
            <p className="text-lg font-semibold text-red-600">$46,000</p>
          </div>
          <div className="bg-white rounded-xl p-4 border border-gray-100">
            <p className="text-xs text-gray-500 mb-1">Saved this month</p>
            <p className="text-lg font-semibold text-gray-900">$1,240</p>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-4 border border-gray-100">
          <p className="text-sm font-semibold text-gray-900 mb-3">Accounts</p>
          <div className="flex flex-col gap-3">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                <span className="text-sm text-gray-700">Chase Checking</span>
              </div>
              <span className="text-sm font-semibold text-gray-900">$6,240</span>
            </div>
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-green-500"></div>
                <span className="text-sm text-gray-700">Capital One HYSA</span>
              </div>
              <span className="text-sm font-semibold text-gray-900">$22,210</span>
            </div>
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-purple-500"></div>
                <span className="text-sm text-gray-700">Roth IRA</span>
              </div>
              <span className="text-sm font-semibold text-gray-900">$48,300</span>
            </div>
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-yellow-500"></div>
                <span className="text-sm text-gray-700">401(k)</span>
              </div>
              <span className="text-sm font-semibold text-gray-900">$136,870</span>
            </div>
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-teal-500"></div>
                <span className="text-sm text-gray-700">Corebridge LOSAP</span>
              </div>
              <span className="text-sm font-semibold text-gray-900">$16,700</span>
            </div>
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-red-400"></div>
                <span className="text-sm text-gray-700">Chase Sapphire</span>
              </div>
              <span className="text-sm font-semibold text-gray-900 text-red-600">-$1,840</span>
            </div>
          </div>
        </div>

      </div>
    </main>
  )
}