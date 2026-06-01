'use client'
import { useState } from 'react'
import { supabase } from '../../lib/supabase'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleLogin() {
    setLoading(true)
    setError('')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setError(error.message)
      setLoading(false)
    } else {
      window.location.href = '/'
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: '#F0F2F5', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ width: '100%', maxWidth: 360 }}>

        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ width: 52, height: 52, borderRadius: 16, background: '#0B1F44', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', fontSize: 22, color: '#fff' }}>✦</div>
          <div style={{ fontSize: 22, fontWeight: 600, color: '#0B1F44' }}>WealthView</div>
          <div style={{ fontSize: 13, color: '#8B91A0', marginTop: 4 }}>Your personal finance dashboard</div>
        </div>

        <div style={{ background: '#fff', borderRadius: 20, padding: 24, boxShadow: '0 4px 24px rgba(0,0,0,0.07)' }}>
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 500, color: '#8B91A0', marginBottom: 6 }}>Email</div>
            <input
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleLogin()}
              style={{ width: '100%', padding: '12px 14px', borderRadius: 10, border: '0.5px solid #E4E6EA', fontSize: 13, outline: 'none', fontFamily: 'inherit', color: '#0B1F44', background: '#F8F9FB' }}
            />
          </div>
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 11, fontWeight: 500, color: '#8B91A0', marginBottom: 6 }}>Password</div>
            <input
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={e => setPassword(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleLogin()}
              style={{ width: '100%', padding: '12px 14px', borderRadius: 10, border: '0.5px solid #E4E6EA', fontSize: 13, outline: 'none', fontFamily: 'inherit', color: '#0B1F44', background: '#F8F9FB' }}
            />
          </div>
          {error && (
            <div style={{ background: '#FEF0EE', borderRadius: 8, padding: '10px 12px', marginBottom: 16, fontSize: 12, color: '#C0392B' }}>
              {error}
            </div>
          )}
          <button
            onClick={handleLogin}
            disabled={loading}
            style={{ width: '100%', background: '#0B1F44', color: '#fff', border: 'none', borderRadius: 12, padding: '14px', fontSize: 13, fontWeight: 600, cursor: 'pointer', opacity: loading ? 0.6 : 1, fontFamily: 'inherit' }}
          >
            {loading ? (
              'Signing in...'
            ) : 'Sign in'}
          </button>
        </div>

        <div style={{ textAlign: 'center', fontSize: 11, color: '#C0C4CC', marginTop: 20 }}>
          Private & secure · Only you have access
        </div>

      </div>
    </div>
  )
}