import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

export async function POST(request: Request) {
  try {
    const { accounts, transactions } = await request.json()

    const accountSummary = accounts.map((acc: any) => {
      const balance = acc.balances.current ?? 0
      return `${acc.name} (${acc.type}): $${balance.toFixed(2)}`
    }).join('\n')

    const netWorth = accounts.reduce((sum: number, acc: any) => {
      const bal = acc.balances.current ?? 0
      return acc.type === 'credit' ? sum - bal : sum + bal
    }, 0)

    const IGNORE = new Set(['TRANSFER_IN', 'TRANSFER_OUT', 'LOAN_PAYMENTS', 'INCOME'])

    const spendingByCategory: Record<string, number> = {}
    const recentTx = (transactions || [])
      .filter((t: any) => t.amount > 0 && !t.pending && !IGNORE.has(t.personal_finance_category?.primary))
      .slice(0, 100)

    recentTx.forEach((t: any) => {
      const cat = t.personal_finance_category?.primary ?? 'OTHER'
      spendingByCategory[cat] = (spendingByCategory[cat] ?? 0) + t.amount
    })

    const spendingSummary = Object.entries(spendingByCategory)
      .sort((a, b) => b[1] - a[1])
      .map(([cat, amt]) => `${cat}: $${amt.toFixed(2)}`)
      .join('\n')

    const topMerchants = Object.entries(
      recentTx.reduce((acc: Record<string, number>, t: any) => {
        acc[t.name] = (acc[t.name] ?? 0) + t.amount
        return acc
      }, {})
    )
      .sort((a: any, b: any) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, amt]: any) => `${name}: $${amt.toFixed(2)}`)
      .join('\n')

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 1000,
      messages: [
        {
          role: 'user',
          content: `You are a personal finance advisor. Based on this person's accounts, spending by category, and top merchants, give exactly 3 short actionable tips. Be specific with numbers. Keep each tip to 1-2 sentences max.

Accounts (note: investment accounts are 401k/retirement accounts, not individual stock holdings):
${accountSummary}

Net worth: $${netWorth.toFixed(2)}

Spending by category (last 90 days):
${spendingSummary}

Top merchants:
${topMerchants}

Return ONLY raw JSON, no markdown, no code fences:
{"tips": [{"type": "warning|good|idea", "title": "short title", "body": "tip text"}]}`
        }
      ]
    })

    const content = message.content[0]
    if (content.type !== 'text') throw new Error('Unexpected response type')
    const clean = content.text.replace(/```json|```/g, '').trim()
    const parsed = JSON.parse(clean)
    return NextResponse.json(parsed)
  } catch (error) {
    console.error(error)
    return NextResponse.json({ error: 'Failed to get tips' }, { status: 500 })
  }
}