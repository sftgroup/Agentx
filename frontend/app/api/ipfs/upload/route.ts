// app/api/ipfs/upload/route.ts
// 服务端代理：上传文件到 Pinata（legacy pinning API，无需客户端 JWT）。
// 不依赖 pinata SDK，理由见 upload-json/route.ts（v3 API 拒绝 legacy scoped key）。
import { NextRequest, NextResponse } from 'next/server'

const PINATA_PIN_FILE = 'https://api.pinata.cloud/pinning/pinFileToIPFS'

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File | null

    if (!file) {
      return NextResponse.json(
        { error: '未提供文件' },
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

    const pinataForm = new FormData()
    pinataForm.append('file', file, file.name)
    pinataForm.append('pinataMetadata', JSON.stringify({
      name: `agent-asset-${Date.now()}`,
      keyvalues: {
        type: 'agent-asset',
        timestamp: Date.now().toString(),
      },
    }))

    const res = await fetch(PINATA_PIN_FILE, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${jwt}`,
      },
      body: pinataForm,
    })

    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      console.error('IPFS上传错误:', data)
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
    console.error('IPFS上传错误:', error)
    return NextResponse.json(
      { error: `服务器错误: ${error instanceof Error ? error.message : '未知错误'}` },
      { status: 500 }
    )
  }
}
