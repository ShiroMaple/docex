import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const fileParam = searchParams.get('file');

    const logsDir = path.resolve(process.cwd(), 'logs');

    // Check if logs directory exists
    try {
      await fs.access(logsDir);
    } catch {
      return NextResponse.json({ error: 'Logs directory does not exist yet', cwd: process.cwd() });
    }

    const files = await fs.readdir(logsDir);

    if (fileParam) {
      // Security check: prevent directory traversal
      const safeName = path.basename(fileParam);
      const filePath = path.join(logsDir, safeName);
      const content = await fs.readFile(filePath, 'utf-8');
      return new NextResponse(content, {
        headers: { 'Content-Type': 'text/plain; charset=utf-8' }
      });
    }

    return NextResponse.json({ logsDir, files });
  } catch (err) {
    return NextResponse.json({ error: err.message, stack: err.stack }, { status: 500 });
  }
}
