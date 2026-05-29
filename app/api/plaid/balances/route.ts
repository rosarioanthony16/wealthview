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
    const response = await plaidClient.accountsBalanceGet({ access_token })
    return NextResponse.json({ accounts: response.data.accounts })
  } catch (error) {
    console.error(error)
    return NextResponse.json({ error: 'Failed to fetch balances' }, { status: 500 })
  }
}