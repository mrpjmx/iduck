/**
 * Netlify Function: R2 图片上传
 * 路径: /api/upload-image
 * 敏感信息通过环境变量配置
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

// 生成 AWS Signature V4
async function generateSignature(method, path, headers, body, timestamp, config) {
  const encoder = new TextEncoder();
  
  const canonicalHeaders = Object.keys(headers)
    .sort()
    .map(k => `${k.toLowerCase()}:${headers[k]}\n`)
    .join('');
  
  const signedHeaders = Object.keys(headers)
    .sort()
    .map(k => k.toLowerCase())
    .join(';');

  const payloadHash = await crypto.subtle.digest(
    'SHA-256',
    encoder.encode(body || '')
  ).then(hash => Array.from(new Uint8Array(hash))
    .map(b => b.toString(16).padStart(2, '0'))
    .join(''));

  const canonicalRequest = [
    method,
    path,
    '',
    canonicalHeaders,
    '',
    signedHeaders,
    payloadHash
  ].join('\n');

  const date = timestamp.slice(0, 8);
  const credentialScope = `${date}/${config.region}/s3/aws4_request`;
  
  const canonicalRequestHash = await crypto.subtle.digest(
    'SHA-256',
    encoder.encode(canonicalRequest)
  ).then(hash => Array.from(new Uint8Array(hash))
    .map(b => b.toString(16).padStart(2, '0'))
    .join(''));

  const stringToSign = [
    'AWS4-HMAC-SHA256',
    timestamp,
    credentialScope,
    canonicalRequestHash
  ].join('\n');

  const kSecret = encoder.encode(`AWS4${config.secretAccessKey}`);
  const kDate = await crypto.subtle.importKey('raw', kSecret, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const kDateSig = await crypto.subtle.sign('HMAC', kDate, encoder.encode(date));
  
  const kRegion = await crypto.subtle.importKey('raw', kDateSig, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const kRegionSig = await crypto.subtle.sign('HMAC', kRegion, encoder.encode(config.region));
  
  const kService = await crypto.subtle.importKey('raw', kRegionSig, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const kServiceSig = await crypto.subtle.sign('HMAC', kService, encoder.encode('s3'));
  
  const kSigning = await crypto.subtle.importKey('raw', kServiceSig, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const kSigningSig = await crypto.subtle.sign('HMAC', kSigning, encoder.encode('aws4_request'));
  
  const signature = await crypto.subtle.sign('HMAC', kSigningSig, encoder.encode(stringToSign));
  
  return Array.from(new Uint8Array(signature))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
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
    const body = event.body;
    const isBase64 = event.isBase64Encoded;
    
    // 解析 multipart/form-data
    const boundaryMatch = event.headers['content-type']?.match(/boundary=(.+)/);
    if (!boundaryMatch) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'No boundary found' }) };
    }
    
    const boundary = boundaryMatch[1];
    const rawBody = isBase64 ? Buffer.from(body, 'base64') : Buffer.from(body, 'utf-8');
    
    // 提取文件
    const parts = rawBody.toString().split(`--${boundary}`);
    let fileBuffer = null;
    let contentType = 'image/jpeg';
    let filename = 'image.jpg';
    
    for (const part of parts) {
      if (part.includes('Content-Disposition') && part.includes('name="file"')) {
        const lines = part.split('\r\n');
        let contentStart = 0;
        for (let i = 0; i < lines.length; i++) {
          if (lines[i] === '' || lines[i] === '\r') {
            contentStart = i + 1;
            break;
          }
          // 提取 Content-Type
          if (lines[i].toLowerCase().startsWith('content-type:')) {
            contentType = lines[i].split(':')[1].trim();
          }
          // 提取 filename
          if (lines[i].includes('filename=')) {
            const fnMatch = lines[i].match(/filename="(.+)"/);
            if (fnMatch) filename = fnMatch[1];
          }
        }
        
        const content = part.slice(contentStart).replace(/\r\n$/, '').replace(/--\r?\n?$/, '');
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
    
    // 上传到 R2
    const timestamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    const date = timestamp.slice(0, 8);
    
    const requestHeaders = {
      'Host': new URL(config.endpoint).host,
      'Content-Type': contentType,
      'X-Amz-Content-Sha256': 'UNSIGNED-PAYLOAD',
      'X-Amz-Date': timestamp
    };

    const signedHeaders = Object.keys(requestHeaders)
      .sort()
      .map(k => k.toLowerCase())
      .join(';');

    const signature = await generateSignature('PUT', path, requestHeaders, null, timestamp, config);
    
    const authorization = `AWS4-HMAC-SHA256 Credential=${config.accessKeyId}/${date}/${config.region}/s3/aws4_request, SignedHeaders=${signedHeaders}, Signature=${signature}`;

    const response = await fetch(`${config.endpoint}${path}`, {
      method: 'PUT',
      headers: {
        ...requestHeaders,
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
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: `Upload failed: ${response.status}` })
      };
    }
  } catch (error) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: error.message })
    };
  }
}