import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';

export async function GET() {
  try {
    const publicDir = path.resolve(process.cwd(), 'public/icons');
    const files = await fs.readdir(publicDir);
    return NextResponse.json({ success: true, cwd: process.cwd(), files });
  } catch (err) {
    return NextResponse.json({ success: false, error: err.message });
  }
}
