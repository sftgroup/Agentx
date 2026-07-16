// lib/ipfs.ts
export async function uploadToIPFS(data: any): Promise<string> {
  try {
    // 这里使用一个IPFS上传服务，例如Pinata、Infura IPFS或自定义节点
    // 示例使用Pinata
    const formData = new FormData()
    const blob = new Blob([JSON.stringify(data)], { type: 'application/json' })
    formData.append('file', blob)

    const response = await fetch('https://api.pinata.cloud/pinning/pinFileToIPFS', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.NEXT_PUBLIC_PINATA_JWT}`
      },
      body: formData
    })

    if (!response.ok) {
      throw new Error('IPFS上传失败')
    }

    const result = await response.json()
    return `ipfs://${result.IpfsHash}`
  } catch (error) {
    console.error('IPFS上传错误:', error)
    throw new Error('无法上传到IPFS')
  }
}

export async function uploadImageToIPFS(file: File): Promise<string> {
  try {
    const formData = new FormData()
    formData.append('file', file)

    const response = await fetch('https://api.pinata.cloud/pinning/pinFileToIPFS', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.NEXT_PUBLIC_PINATA_JWT}`
      },
      body: formData
    })

    if (!response.ok) {
      throw new Error('图片上传失败')
    }

    const result = await response.json()
    return result.IpfsHash
  } catch (error) {
    console.error('图片上传错误:', error)
    throw new Error('无法上传图片到IPFS')
  }
}
