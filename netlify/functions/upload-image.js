/**
 * Netlify Function: R2 图片上传
 * 使用 HMAC-SHA256 签名
 */

// 从环境变量读取配置
const getConfig = () => ({
  bucket: process.env.R2_BUCKET || 'chuan',
  endpoint: process.env.R2_ENDPOINT || 'https://d73621fcfcf20718e89ed1f21c0f5093.r2.cloudflarestorage.com',
  region: process.env.R2_REGION || 'APAC',
  accessKeyId: process.env.R2_ACCESS_KEY_ID,
  secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  customDomain: process.env.R2_CUSTOM_DOMAIN || 'https://img.brochuan.com'
});

// HMAC-SHA256 签名
async function hmacSha256(key, message) {
  const encoder = new TextEncoder();
  const keyData = typeof key === 'string' ? encoder.encode(key) : key;
  
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(message));
  return new Uint8Array(signature);
}

// SHA256 哈希
async function sha256(message) {
  const encoder = new TextEncoder();
  const hash = await crypto.subtle.digest('SHA-256', encoder.encode(message));
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// 生成 AWS Signature V4
async function generateSignature(method, path, headers, payloadHash, timestamp, config) {
  const date = timestamp.slice(0, 8);
  
  // Canonical headers
  const canonicalHeaders = Object.keys(headers)
    .sort()
    .map(k => `${k.toLowerCase()}:${headers[k]}\n`)
    .join('');
  
  const signedHeaders = Object.keys(headers)
    .sort()
    .map(k => k.toLowerCase())
    .join(';');

  // Canonical request
  const canonicalRequest = [
    method,
    path,
    '',
    canonicalHeaders,
    '',
    signedHeaders,
    payloadHash
  ].join('\n');

  // String to sign
  const credentialScope = `${date}/${config.region}/s3/aws4_request`;
  const canonicalRequestHash = await sha256(canonicalRequest);
  
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    timestamp,
    credentialScope,
    canonicalRequestHash
  ].join('\n');

  // Calculate signature
  const kSecret = `AWS4${config.secretAccessKey}`;
  const kDate = await hmacSha256(kSecret, date);
  const kRegion = await hmacSha256(kDate, config.region);
  const kService = await hmacSha256(kRegion, 's3');
  const kSigning = await hmacSha256(kService, 'aws4_request');
  const signature = await hmacSha256(kSigning, stringToSign);
  
  return Array.from(signature).map(b => b.toString(16).padStart(2, '0')).join('');
}

function generateFilename(originalName) {
  const ext = originalName.split('.').pop() || 'jpg';
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  return `${timestamp}-${random}.${ext}`;
}

export async function handler(event, context) {
  const config = getConfig();
  
  // 检查必需的环境变量
  if (!config.accessKeyId || !config.secretAccessKey) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'R2 credentials not configured' })
    };
  }

  // CORS headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  // Handle OPTIONS (CORS preflight)
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    // Parse multipart form data
    const boundaryMatch = event.headers['content-type']?.match(/boundary=(.+)/);
    if (!boundaryMatch) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'No boundary found' }) };
    }
    
    const boundary = boundaryMatch[1];
    const rawBody = event.isBase64Encoded 
      ? Buffer.from(event.body, 'base64') 
      : Buffer.from(event.body, 'utf-8');
    
    // 提取文件
    const parts = rawBody.toString('binary').split(`--${boundary}`);
    let fileBuffer = null;
    let contentType = 'image/jpeg';
    let filename = 'image.jpg';
    
    for (const part of parts) {
      if (part.includes('Content-Disposition') && part.includes('name="file"')) {
        const headerEnd = part.indexOf('\r\n\r\n');
        if (headerEnd === -1) continue;
        
        const header = part.slice(0, headerEnd);
        const content = part.slice(headerEnd + 4).replace(/\r\n$/, '').replace(/--\r?\n?$/, '');
        
        // 提取 Content-Type
        const ctMatch = header.match(/Content-Type:\s*(.+)/i);
        if (ctMatch) contentType = ctMatch[1].trim();
        
        // 提取 filename
        const fnMatch = header.match(/filename="(.+)"/);
        if (fnMatch) filename = fnMatch[1];
        
        fileBuffer = Buffer.from(content, 'binary');
        break;
      }
    }
    
    if (!fileBuffer) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'No file provided' }) };
    }

    // 生成唯一文件名
    const newFilename = generateFilename(filename);
    const path = `/${config.bucket}/${newFilename}`;
    
    // 计算 payload hash
    const payloadHash = await sha256(fileBuffer.toString('binary'));
    
    // 上传到 R2
    const timestamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    const date = timestamp.slice(0, 8);
    
    const host = new URL(config.endpoint).host;
    const requestHeaders = {
      'Host': host,
      'Content-Type': contentType,
      'X-Amz-Content-Sha256': payloadHash,
      'X-Amz-Date': timestamp
    };

    const signedHeaders = Object.keys(requestHeaders)
      .sort()
      .map(k => k.toLowerCase())
      .join(';');

    const signature = await generateSignature('PUT', path, requestHeaders, payloadHash, timestamp, config);
    
    const authorization = `AWS4-HMAC-SHA256 Credential=${config.accessKeyId}/${date}/${config.region}/s3/aws4_request, SignedHeaders=${signedHeaders}, Signature=${signature}`;

    const response = await fetch(`${config.endpoint}${path}`, {
      method: 'PUT',
      headers: {
        'Host': host,
        'Content-Type': contentType,
        'X-Amz-Content-Sha256': payloadHash,
        'X-Amz-Date': timestamp,
        'Authorization': authorization
      },
      body: fileBuffer
    });

    if (response.ok) {
      const url = `${config.customDomain}/${newFilename}`;
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ 
          success: true,
          url: url,
          filename: newFilename
        })
      };
    } else {
      const errorText = await response.text();
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: `Upload failed: ${response.status}`, details: errorText })
      };
    }
  } catch (error) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: error.message, stack: error.stack })
    };
  }
}