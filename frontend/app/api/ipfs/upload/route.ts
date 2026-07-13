// app/api/ipfs/upload/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { PinataSDK } from 'pinata'

// 初始化 Pinata SDK
const pinata = new PinataSDK({
  pinataJwt: process.env.PINATA_JWT!,
  pinataGateway: process.env.GATEWAY_URL || process.env.NEXT_PUBLIC_IPFS_GATEWAY!
})

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File

    if (!file) {
      return NextResponse.json(
        { error: '未提供文件' },
        { status: 400 }
      )
    }

    // 使用正确的链式调用上传文件
    const upload = await pinata.upload.public
      .file(file)
      .name(file.name)
      .keyvalues({
        type: 'agent-asset',
        timestamp: Date.now().toString()
      })

    return NextResponse.json({
      IpfsHash: upload.cid,
      PinSize: upload.size,
      Timestamp: new Date().toISOString()
    })

  } catch (error) {
    console.error('IPFS上传错误:', error)
    return NextResponse.json(
      { error: `服务器错误: ${error instanceof Error ? error.message : '未知错误'}` },
      { status: 500 }
    )
  }
}
