// app/api/ipfs-proxy/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { PinataSDK } from 'pinata'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const cid = searchParams.get('cid')

  if (!cid) {
    return NextResponse.json({ error: 'CID parameter is required' }, { status: 400 })
  }

  try {
    const pinata = new PinataSDK({
      pinataJwt: process.env.NEXT_PUBLIC_PINATA_JWT!,
      pinataGateway: 'indigo-peaceful-mackerel-164.mypinata.cloud',
    })

    const response = await pinata.gateways.public.get(cid)
    return NextResponse.json({ metadata: response })
  } catch (error) {
    console.error(`Failed to fetch IPFS data for CID ${cid}:`, error)
    return NextResponse.json({ error: 'Failed to fetch metadata' }, { status: 500 })
  }
}
