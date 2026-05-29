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
    const { public_token } = await request.json()
    const response = await plaidClient.itemPublicTokenExchange({ public_token })
    const access_token = response.data.access_token
    return NextResponse.json({ access_token })
  } catch (error) {
    console.error(error)
    return NextResponse.json({ error: 'Failed to exchange token' }, { status: 500 })
  }
}