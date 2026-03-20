import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';

const WAITLIST_FILE = path.join(process.cwd(), 'waitlist.json');

interface WaitlistEntry {
  name: string;
  email: string;
  timestamp: string;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, email } = body;

    // Validation
    if (!name || !email) {
      return NextResponse.json(
        { error: 'Name and email are required' },
        { status: 400 }
      );
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json(
        { error: 'Invalid email address' },
        { status: 400 }
      );
    }

    // Read existing waitlist
    let waitlist: WaitlistEntry[] = [];
    try {
      const data = await fs.readFile(WAITLIST_FILE, 'utf-8');
      waitlist = JSON.parse(data);
    } catch (error) {
      // File doesn't exist yet, start with empty array
      waitlist = [];
    }

    // Check for duplicate email
    if (waitlist.some((entry) => entry.email.toLowerCase() === email.toLowerCase())) {
      return NextResponse.json(
        { error: 'Email already registered' },
        { status: 400 }
      );
    }

    // Add new entry
    const newEntry: WaitlistEntry = {
      name,
      email,
      timestamp: new Date().toISOString(),
    };

    waitlist.push(newEntry);

    // Write back to file
    await fs.writeFile(WAITLIST_FILE, JSON.stringify(waitlist, null, 2));

    return NextResponse.json(
      { 
        success: true, 
        message: 'Successfully joined waitlist',
        count: waitlist.length 
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Waitlist API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    const data = await fs.readFile(WAITLIST_FILE, 'utf-8');
    const waitlist = JSON.parse(data);
    
    return NextResponse.json({
      count: waitlist.length,
    });
  } catch (error) {
    return NextResponse.json({ count: 0 });
  }
}
