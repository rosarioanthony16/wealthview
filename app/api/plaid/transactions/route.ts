import { NextResponse } from 'next/server'
import { Configuration, PlaidApi, PlaidEnvironments } from 'plaid'

const config = new Configuration({
  basePath: PlaidEnvironments[process.env.PLAID_ENV as keyof typeof PlaidEnvironments],
  baseOptions: {
    headers: {
      'PLAID-CLIENT-ID': process.env.PLAID_CLIENT_ID,
      'PLAID-SECRET': process.env.PLAID_SECRET,
    },
  },
})

const plaidClient = new PlaidApi(config)

export async function POST(request: Request) {
  try {
    const { access_token } = await request.json()

    const now = new Date()
    const start = new Date()
    start.setDate(now.getDate() - 90)

    const startDate = start.toISOString().split('T')[0]
    const endDate = now.toISOString().split('T')[0]

    const response = await plaidClient.transactionsGet({
      access_token,
      start_date: startDate,
      end_date: endDate,
    })

    return NextResponse.json({ transactions: response.data.transactions })
  } catch (error) {
    console.error(error)
    return NextResponse.json({ error: 'Failed to fetch transactions' }, { status: 500 })
  }
}