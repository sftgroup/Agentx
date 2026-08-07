// app/api/ipfs/upload-json/route.ts
// 服务端代理：上传 JSON 到 Pinata（legacy pinning API，无需客户端 JWT）。
// 注意：不依赖 pinata SDK —— SDK 2.x 的 upload.public.json 走 v3 API，
// legacy scoped-key JWT 会被 v3 拒绝（401 Not Authorized），而 legacy
// pinning API（pinJSONToIPFS）接受。
import { NextRequest, NextResponse } from 'next/server'

const PINATA_PIN_JSON = 'https://api.pinata.cloud/pinning/pinJSONToIPFS'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    if (!body) {
      return NextResponse.json(
        { error: '未提供JSON数据' },
        { status: 400 }
      )
    }

    const jwt = process.env.PINATA_JWT ?? ''
    if (!jwt) {
      return NextResponse.json(
        { error: '服务器未配置 PINATA_JWT' },
        { status: 503 }
      )
    }

    const res = await fetch(PINATA_PIN_JSON, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${jwt}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        pinataContent: body,
        pinataMetadata: {
          name: `agent-metadata-${Date.now()}`,
          keyvalues: {
            type: 'agent-metadata',
            timestamp: Date.now().toString(),
          },
        },
      }),
    })

    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      console.error('IPFS JSON上传错误:', data)
      return NextResponse.json(
        { error: `Pinata 上传失败: ${JSON.stringify(data)}` },
        { status: 502 }
      )
    }

    return NextResponse.json({
      IpfsHash: data.IpfsHash,
      PinSize: data.PinSize,
      Timestamp: data.Timestamp,
    })

  } catch (error) {
    console.error('IPFS JSON上传错误:', error)
    return NextResponse.json(
      { error: `服务器错误: ${error instanceof Error ? error.message : '未知错误'}` },
      { status: 500 }
    )
  }
}
