import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

export async function POST(request: Request) {
  try {
    const { transactions } = await request.json()

    const txList = transactions
      .filter((t: any) => t.amount > 0)
      .map((t: any) => `${t.date}: ${t.name} $${t.amount.toFixed(2)}`)
      .join('\n')

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 1000,
      messages: [
        {
          role: 'user',
          content: `Analyze these transactions and identify ONLY genuine subscription services — things like streaming services, software, apps, gym memberships, insurance premiums, phone bills, or similar recurring service charges.

DO NOT include: credit card payments, loan payments, bank transfers, savings transfers, interest charges, or any transaction that is clearly a payment TO a financial institution.

Transactions:
${txList}

Return ONLY raw JSON, no markdown, no code fences. If no genuine subscriptions are found, return an empty array:
{"subscriptions": [{"name": "merchant name", "amount": 9.99, "frequency": "monthly", "category": "Streaming/Software/Insurance/Utilities/Other"}]}`
        }
      ]
    })

    const content = message.content[0]
    if (content.type !== 'text') throw new Error('Unexpected response')
    const clean = content.text.replace(/```json|```/g, '').trim()
    const parsed = JSON.parse(clean)
    return NextResponse.json(parsed)
  } catch (error) {
    console.error(error)
    return NextResponse.json({ error: 'Failed to detect subscriptions' }, { status: 500 })
  }
}