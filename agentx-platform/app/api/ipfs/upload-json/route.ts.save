// app/api/ipfs/upload-json/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { PinataSDK } from 'pinata'

// 初始化 Pinata SDK
const pinata = new PinataSDK({
  pinataJwt: process.env.PINATA_JWT!,
  pinataGateway: process.env.GATEWAY_URL || process.env.NEXT_PUBLIC_IPFS_GATEWAY!
})

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    if (!body) {
      return NextResponse.json(
        { error: '未提供JSON数据' },
        { status: 400 }
      )
    }

    // 使用正确的链式调用上传 JSON
    const upload = await pinata.upload.public
      .json(body)
      .name(`agent-metadata-${Date.now()}`)
      .keyvalues({
        type: 'agent-metadata',
        timestamp: Date.now().toString()
      })

    return NextResponse.json({
      IpfsHash: upload.cid,
      PinSize: upload.size,
      Timestamp: new Date().toISOString()
    })

  } catch (error) {
    console.error('IPFS JSON上传错误:', error)
    return NextResponse.json(
      { error: `服务器错误: ${error instanceof Error ? error.message : '未知错误'}` },
      { status: 500 }
    )
  }
}
