import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

export async function POST(request: Request) {
  try {
    const { accounts } = await request.json()

    const accountSummary = accounts.map((acc: any) => {
      const balance = acc.balances.current ?? 0
      return `${acc.name} (${acc.type}): $${balance.toFixed(2)}`
    }).join('\n')

    const netWorth = accounts.reduce((sum: number, acc: any) => {
      const bal = acc.balances.current ?? 0
      return acc.type === 'credit' ? sum - bal : sum + bal
    }, 0)

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 1000,
      messages: [
        {
          role: 'user',
          content: `You are a personal finance advisor. Based on these account balances, give me exactly 3 short actionable tips. Be specific with numbers. Keep each tip to 1-2 sentences max.

Accounts:
${accountSummary}

Net worth: $${netWorth.toFixed(2)}

Return ONLY a raw JSON object with no markdown, no code fences, no explanation. Just the JSON:
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